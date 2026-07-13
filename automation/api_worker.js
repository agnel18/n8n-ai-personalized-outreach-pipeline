'use strict';

// OpenAI API worker for the n8n lead-generation pipeline.
// It preserves the same HTTP contract as the browser workers:
//   GET  /health
//   POST /session-check
//   POST /new-chat
//   POST /run-stage

const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
  ];

  const envPath = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });

  if (!envPath) {
    console.log('No .env file found; using existing environment variables.');
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.log(`Could not read ${envPath}: ${error.message}`);
    return;
  }

  let loaded = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.replace(/^export\s+/, '');
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = withoutExport.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
      loaded += 1;
    }
  }

  console.log(`Loaded ${loaded} setting(s) from ${envPath}`);
}

loadDotEnv();

const express = require('express');
const {
  loadPromptTemplate,
  buildPrompt,
  saveMarkdown,
  stageMeta,
} = require('./worker_shared');
const {
  resolveProviderConfig,
  loadProviderAdapter,
} = require('./provider_registry');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.WORKER_PORT || process.env.API_WORKER_PORT || 8789);
const HOST = process.env.WORKER_HOST || '0.0.0.0';
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH === undefined
  ? true
  : /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_WEB_SEARCH));
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 165000);
const VALIDATION_TIMEOUT_MS = Number(process.env.API_VALIDATION_TIMEOUT_MS || 15000);

let providerConfig = null;
let providerAdapter = null;
let startupError = '';

try {
  providerConfig = resolveProviderConfig(process.env);
  providerAdapter = loadProviderAdapter(providerConfig);
} catch (error) {
  startupError = error.message;
}

function configurationSummary() {
  return {
    provider: providerConfig?.provider || 'openai',
    apiBaseUrl: providerConfig?.baseUrl || '',
    model: providerConfig?.model || '',
    webSearch: ENABLE_WEB_SEARCH,
    keySource: providerConfig?.keySource || '',
    modelSource: providerConfig?.modelSource || '',
  };
}

async function checkReadiness(force = false) {
  if (startupError) {
    return {
      ready: false,
      reason: startupError,
      ...configurationSummary(),
    };
  }

  if (!providerConfig?.ready || !providerAdapter) {
    return {
      ready: false,
      reason: 'OPENAI_API_KEY is not set.',
      ...configurationSummary(),
    };
  }

  const validation = await providerAdapter.validateConfiguration({
    timeoutMs: VALIDATION_TIMEOUT_MS,
    force,
  });

  return {
    ...configurationSummary(),
    ...validation,
  };
}

app.get('/health', async (_req, res) => {
  try {
    const readiness = await checkReadiness(false);
    res.json({
      ok: true,
      service: 'api-worker',
      ...readiness,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: 'api-worker',
      ready: false,
      reason: error.message,
      ...configurationSummary(),
    });
  }
});

app.post('/session-check', async (req, res) => {
  const contextData = req.body?.context || {};

  try {
    const readiness = await checkReadiness(false);
    res.json({
      ok: true,
      ready: readiness.ready,
      reason: readiness.reason,
      provider: readiness.provider,
      model: readiness.model,
      context: {
        ...contextData,
        operator_action: readiness.ready
          ? `OpenAI API ready with model ${readiness.model}.`
          : `OpenAI API is not ready: ${readiness.reason}`,
      },
    });
  } catch (error) {
    res.json({
      ok: true,
      ready: false,
      reason: error.message,
      context: {
        ...contextData,
        operator_action: `OpenAI API is not ready: ${error.message}`,
      },
    });
  }
});

// API mode is stateless, so a new chat is unnecessary.
app.post('/new-chat', (req, res) => {
  const contextData = req.body?.context || {};
  res.json({
    ok: true,
    reason: 'API mode is stateless; no chat reset is required.',
    context: {
      ...contextData,
      operator_action: 'OpenAI API mode: no chat reset required.',
    },
  });
});

app.post('/run-stage', async (req, res) => {
  try {
    const stage = req.body?.stage;
    const contextData = req.body?.context || {};
    const lead = contextData.lead || req.body?.lead || {};
    const previousOutput = contextData.previous_output || req.body?.previousOutput || '';
    const meta = stageMeta(stage);

    if (!meta) {
      return res.status(400).json({
        ok: false,
        stage,
        reason: `Unknown stage: ${stage}`,
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: `Unknown stage: ${stage}`,
        },
      });
    }

    const readiness = await checkReadiness(false);
    if (!readiness.ready) {
      return res.status(200).json({
        ok: false,
        retryable: false,
        stage,
        reason: readiness.reason,
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: readiness.reason,
        },
      });
    }

    const template = await loadPromptTemplate(stage);
    const prompt = buildPrompt(template, lead, previousOutput);
    const useWebSearch = ENABLE_WEB_SEARCH && stage === 'research';

    console.log(
      `[api] ${stage}: calling ${providerConfig.model} @ ${providerConfig.baseUrl}` +
      (useWebSearch ? ' (web search on)' : ''),
    );

    const result = await providerAdapter.generate({
      stage,
      prompt,
      enableWebSearch: useWebSearch,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    if (!result.ok) {
      console.log(`[api] ${stage}: FAILED — ${result.reason}`);
      const responseStatus = result.retryable ? 503 : 200;

      return res.status(responseStatus).json({
        ok: false,
        stage,
        reason: result.reason,
        code: result.code || '',
        retryable: Boolean(result.retryable),
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: result.reason,
          api_provider: result.provider || providerConfig.provider,
          api_model: result.model || providerConfig.model,
        },
      });
    }

    console.log(`[api] ${stage}: ok — ${result.responseText.length} chars`);

    const mdPath = await saveMarkdown({
      companyName: lead.organization_name || lead.company || 'Unknown_Company',
      stage,
      responseText: result.responseText,
    });

    return res.json({
      ok: true,
      stage,
      reason: 'Stage completed successfully.',
      context: {
        ...contextData,
        status: meta.status,
        updated_at: new Date().toISOString(),
        previous_output: result.responseText,
        operator_action: 'Stage complete.',
        api_provider: result.provider,
        api_model: result.model,
        api_usage: result.usage,
        [meta.key]: {
          responseText: result.responseText,
          mdPath,
          provider: result.provider,
          model: result.model,
          citations: result.citations,
          usage: result.usage,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      reason: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`api-worker listening on http://${HOST}:${PORT}`);
  console.log(
    `provider: ${providerConfig?.provider || 'openai'} | ` +
    `base: ${providerConfig?.baseUrl || '(not configured)'} | ` +
    `model: ${providerConfig?.model || '(not configured)'}`,
  );
  console.log(`web search: ${ENABLE_WEB_SEARCH ? 'on (research stage)' : 'off'}`);
  if (startupError) console.log(`CONFIGURATION ERROR: ${startupError}`);
  if (!providerConfig?.apiKey) {
    console.log('WARNING: OPENAI_API_KEY is not set in automation/.env.');
  }
});
