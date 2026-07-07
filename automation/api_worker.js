// API worker — a drop-in alternative to the browser workers (chatgpt_worker.js /
// grok_worker.js) for people who have an LLM API key. It exposes the SAME HTTP API
// and response shapes (/health, /session-check, /new-chat, /run-stage), so the n8n
// workflow works unchanged — select provider "api" in the workflow Config (this
// worker's default port is 8789) and run `npm run start:api`.
//
// Unlike the browser workers, this one drives NO browser: each pipeline stage is a
// single OpenAI-compatible chat-completions call. Because every stage is stateless
// (the previous stage's text arrives in context.previous_output), three independent
// calls reproduce the pipeline exactly.
//
// Provider is configurable via env (defaults to xAI Grok):
//   API_BASE_URL   default https://api.x.ai/v1   (OpenAI-compatible base)
//   API_KEY        required
//   MODEL          default grok-4.3
//   API_PROVIDER   xai | openai | generic        (controls how web search is wired)
//   ENABLE_WEB_SEARCH  true|false                (only the research stage searches)
// See .env.example for the full list.
const fs = require('fs');
const path = require('path');

// ── Auto-load .env ────────────────────────────────────────────────────────────
// Node doesn't read .env files on its own, so we do it here. This means you can
// just run `npm run start:api` (or `node api_worker.js`) and the values from your
// .env file are picked up automatically — no flags to remember, nothing extra to
// install.
//
// We look for a .env next to this file first, then in the folder you ran the
// command from. Anything already set in your shell (or passed inline) always
// wins, so this never overrides an explicit setting.
function loadDotEnv() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
  ];
  const envPath = candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });

  if (!envPath) {
    console.log('No .env file found — using existing environment variables as-is.');
    console.log(`  (Looked in: ${candidates.join('  and  ')})`);
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    console.log(`Found .env at ${envPath} but could not read it: ${err.message}`);
    return;
  }

  let loaded = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue; // blank line or comment
    const withoutExport = trimmed.replace(/^export\s+/, '');
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue; // not a KEY=VALUE line
    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    let value = withoutExport.slice(eq + 1).trim();
    // Strip one layer of matching surrounding quotes, if present.
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    // Never overwrite something already set in the real environment.
    if (!(key in process.env)) {
      process.env[key] = value;
      loaded++;
    }
  }
  console.log(`Loaded ${loaded} setting(s) from ${envPath}`);
}

loadDotEnv();
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const {
  loadPromptTemplate,
  buildPrompt,
  saveMarkdown,
  stageMeta,
} = require('./worker_shared');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.WORKER_PORT || process.env.API_WORKER_PORT || 8789;
const API_BASE_URL = (process.env.API_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, '');
const API_KEY = process.env.API_KEY || '';
const MODEL = process.env.MODEL || 'grok-4.3';
const API_PROVIDER = (process.env.API_PROVIDER || 'xai').toLowerCase();
const ENABLE_WEB_SEARCH =
  process.env.ENABLE_WEB_SEARCH === undefined
    ? true
    : /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_WEB_SEARCH));
// Per-request ceiling; high-mode research + web search can be slow.
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 180000);

// Add provider-appropriate web-search parameters to a chat-completions body.
// xAI: top-level `search_parameters` (Live Search). OpenAI: `web_search_options`
// only works on search-preview models, so it's best-effort — if the model isn't
// search-capable the API ignores it (or errors, which we surface). Only the
// research stage searches; review/final_email work off previous_output.
function applyWebSearch(body, stage) {
  if (!ENABLE_WEB_SEARCH || stage !== 'research') return body;
  if (API_PROVIDER === 'xai') {
    body.search_parameters = { mode: 'auto', return_citations: true };
  } else if (API_PROVIDER === 'openai') {
    body.web_search_options = {};
  }
  // 'generic' providers: leave as-is (no standard search param).
  return body;
}

// One chat-completions call with a timeout and a single retry/backoff on 429/5xx.
async function callChatCompletion(prompt, stage) {
  if (!API_KEY) {
    return { ok: false, reason: 'API_KEY is not set. Add it to automation/.env.' };
  }

  const body = applyWebSearch(
    {
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
    },
    stage,
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        return { ok: false, reason: `API request timed out after ${REQUEST_TIMEOUT_MS} ms.` };
      }
      // Network error — retry once.
      if (attempt === 0) continue;
      return { ok: false, reason: `API request failed: ${err.message}` };
    }
    clearTimeout(timer);

    if (res.status === 429 || res.status >= 500) {
      if (attempt === 0) continue; // retry once with backoff
      const errText = await res.text().catch(() => '');
      return { ok: false, reason: `API error ${res.status}: ${errText.slice(0, 300)}` };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, reason: `API error ${res.status}: ${errText.slice(0, 300)}` };
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      return { ok: false, reason: `Could not parse API response JSON: ${err.message}` };
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
      return { ok: false, reason: 'API returned an empty completion.' };
    }
    return { ok: true, responseText: String(text).trim() };
  }
  return { ok: false, reason: 'API request failed after retry.' };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'api-worker',
    ready: Boolean(API_KEY),
    reason: API_KEY ? 'API key present.' : 'API_KEY not set — add it to automation/.env.',
    apiBaseUrl: API_BASE_URL,
    model: MODEL,
    provider: API_PROVIDER,
    webSearch: ENABLE_WEB_SEARCH,
  });
});

app.post('/session-check', (req, res) => {
  const contextData = req.body?.context || {};
  const ready = Boolean(API_KEY);
  res.json({
    ok: true,
    ready,
    reason: ready ? 'API key present.' : 'API_KEY not set.',
    context: {
      ...contextData,
      operator_action: ready
        ? 'Session ready. Proceeding.'
        : 'Set API_KEY in automation/.env, then rerun.',
    },
  });
});

// Stateless in API mode — there is no chat to reset. Kept so the workflow's
// (optional) new-chat step is a harmless success.
app.post('/new-chat', (req, res) => {
  const contextData = req.body?.context || {};
  res.json({
    ok: true,
    reason: 'API mode is stateless; no chat reset needed.',
    context: { ...contextData, operator_action: 'API mode: no chat reset needed.' },
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
        context: { ...contextData, status: 'Failed', operator_action: `Unknown stage: ${stage}` },
      });
    }

    if (!API_KEY) {
      return res.status(409).json({
        ok: false,
        stage,
        reason: 'API_KEY is not set.',
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: 'Set API_KEY in automation/.env, then rerun.',
        },
      });
    }

    const template = await loadPromptTemplate(stage);
    const prompt = buildPrompt(template, lead, previousOutput);

    console.log(`[api] ${stage}: calling ${MODEL} @ ${API_BASE_URL}` +
      (ENABLE_WEB_SEARCH && stage === 'research' ? ' (web search on)' : ''));
    const result = await callChatCompletion(prompt, stage);
    if (!result.ok) {
      console.log(`[api] ${stage}: FAILED — ${result.reason}`);
      return res.status(409).json({
        ok: false,
        stage,
        reason: result.reason,
        context: { ...contextData, status: 'Failed', operator_action: result.reason },
      });
    }
    console.log(`[api] ${stage}: ok — ${result.responseText.length} chars`);

    const mdPath = await saveMarkdown({
      companyName: lead.organization_name || lead.company || 'Unknown_Company',
      stage,
      responseText: result.responseText,
    });

    res.json({
      ok: true,
      stage,
      reason: 'Stage completed successfully.',
      context: {
        ...contextData,
        status: meta.status,
        updated_at: new Date().toISOString(),
        previous_output: result.responseText,
        operator_action: 'Stage complete.',
        [meta.key]: {
          responseText: result.responseText,
          mdPath,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      reason: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
  }
});

app.listen(PORT, () => {
  console.log(`api-worker listening on http://localhost:${PORT}`);
  console.log(`provider: ${API_PROVIDER} | base: ${API_BASE_URL} | model: ${MODEL}`);
  console.log(`web search: ${ENABLE_WEB_SEARCH ? 'on (research stage)' : 'off'}`);
  if (!API_KEY) console.log('WARNING: API_KEY is not set — set it in automation/.env before running the workflow.');
});