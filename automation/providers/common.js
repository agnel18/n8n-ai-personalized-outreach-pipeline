'use strict';

async function fetchWithTimeout(url, options = {}, timeoutMs = 165000, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required. Use Node.js 20 or newer.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response) {
  const text = await response.text().catch(() => '');
  if (!text) return { text: '', json: null };

  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function extractOpenAIResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function extractOpenAICitations(payload) {
  const citations = [];
  const seen = new Set();

  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;

    for (const content of Array.isArray(item.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        const citation = annotation?.url_citation || annotation;
        const url = String(citation?.url || '').trim();
        if (!url || seen.has(url)) continue;

        seen.add(url);
        citations.push({
          title: String(citation?.title || url).trim(),
          url,
        });
      }
    }
  }

  return citations;
}

function appendSources(responseText, citations) {
  const text = String(responseText || '').trim();
  if (!citations.length) return text;

  const sourceLines = citations.map(
    (citation, index) => `${index + 1}. [${citation.title}](${citation.url})`,
  );

  return `${text}\n\n## Sources\n\n${sourceLines.join('\n')}`;
}

function normalizeOpenAIError(status, payload, rawText, model) {
  const message = String(
    payload?.error?.message ||
    payload?.message ||
    rawText ||
    `OpenAI API returned HTTP ${status}.`,
  ).trim();

  const code = String(
    payload?.error?.code ||
    payload?.error?.type ||
    `HTTP_${status}`,
  );

  return {
    ok: false,
    reason: message,
    code,
    provider: 'openai',
    model,
    retryable: status === 429 || status >= 500,
    upstreamStatus: status,
  };
}

module.exports = {
  fetchWithTimeout,
  readResponseBody,
  extractOpenAIResponseText,
  extractOpenAICitations,
  appendSources,
  normalizeOpenAIError,
};
