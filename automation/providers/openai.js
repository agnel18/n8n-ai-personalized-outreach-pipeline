'use strict';

const {
  fetchWithTimeout,
  readResponseBody,
  extractOpenAIResponseText,
  extractOpenAICitations,
  appendSources,
  normalizeOpenAIError,
} = require('./common');

const VALIDATION_CACHE_MS = 5 * 60 * 1000;

function stageTokenLimit(stage) {
  if (stage === 'research') return 5000;
  if (stage === 'review') return 3000;
  return 1500;
}

function createOpenAIAdapter(config, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  let validationCache = null;

  async function validateConfiguration({ timeoutMs = 15000, force = false } = {}) {
    if (!config.apiKey) {
      return {
        ready: false,
        provider: 'openai',
        model: config.model,
        reason: 'OPENAI_API_KEY is not set.',
      };
    }

    if (
      !force &&
      validationCache &&
      Date.now() - validationCache.checkedAt < VALIDATION_CACHE_MS
    ) {
      return validationCache.result;
    }

    let response;
    try {
      response = await fetchWithTimeout(
        `${config.baseUrl}/models/${encodeURIComponent(config.model)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
        timeoutMs,
        fetchImpl,
      );
    } catch (error) {
      const reason = error?.name === 'AbortError'
        ? `OpenAI validation timed out after ${timeoutMs} ms.`
        : `Could not reach OpenAI: ${error.message}`;

      const result = {
        ready: false,
        provider: 'openai',
        model: config.model,
        reason,
      };
      validationCache = { checkedAt: Date.now(), result };
      return result;
    }

    const body = await readResponseBody(response);
    if (!response.ok) {
      const error = normalizeOpenAIError(
        response.status,
        body.json,
        body.text,
        config.model,
      );
      const result = {
        ready: false,
        provider: 'openai',
        model: config.model,
        reason: error.reason,
        upstreamStatus: response.status,
      };
      validationCache = { checkedAt: Date.now(), result };
      return result;
    }

    const result = {
      ready: true,
      provider: 'openai',
      model: config.model,
      reason: 'OpenAI key and model validated.',
      webSearchSupported: config.supportsWebSearch,
    };
    validationCache = { checkedAt: Date.now(), result };
    return result;
  }

  async function generate({
    stage,
    prompt,
    enableWebSearch = false,
    timeoutMs = 165000,
  }) {
    const body = {
      model: config.model,
      input: String(prompt || ''),
      max_output_tokens: stageTokenLimit(stage),
    };

    if (enableWebSearch && stage === 'research') {
      body.tools = [{ type: 'web_search' }];
      body.tool_choice = 'auto';
      body.include = ['web_search_call.action.sources'];
    }

    let response;
    try {
      response = await fetchWithTimeout(
        `${config.baseUrl}/responses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
        fetchImpl,
      );
    } catch (error) {
      return {
        ok: false,
        reason: error?.name === 'AbortError'
          ? `OpenAI request timed out after ${timeoutMs} ms.`
          : `OpenAI request failed: ${error.message}`,
        code: error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        provider: 'openai',
        model: config.model,
        retryable: true,
      };
    }

    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      return normalizeOpenAIError(
        response.status,
        responseBody.json,
        responseBody.text,
        config.model,
      );
    }

    const responseText = extractOpenAIResponseText(responseBody.json);
    if (!responseText) {
      return {
        ok: false,
        reason: 'OpenAI returned a successful response without output text.',
        code: 'EMPTY_OUTPUT',
        provider: 'openai',
        model: config.model,
        retryable: false,
        upstreamStatus: response.status,
      };
    }

    const citations = extractOpenAICitations(responseBody.json);
    const textWithSources = stage === 'research'
      ? appendSources(responseText, citations)
      : responseText;

    return {
      ok: true,
      responseText: textWithSources,
      citations,
      provider: 'openai',
      model: config.model,
      usage: {
        inputTokens: responseBody.json?.usage?.input_tokens ?? null,
        outputTokens: responseBody.json?.usage?.output_tokens ?? null,
        totalTokens: responseBody.json?.usage?.total_tokens ?? null,
      },
      finishReason: responseBody.json?.status || 'completed',
      retryable: false,
    };
  }

  return {
    id: 'openai',
    validateConfiguration,
    generate,
  };
}

module.exports = {
  createOpenAIAdapter,
  stageTokenLimit,
};
