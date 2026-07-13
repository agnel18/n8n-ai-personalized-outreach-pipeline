'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpenAIAdapter } = require('../providers/openai');

function makeConfig() {
  return {
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
    supportsWebSearch: true,
  };
}

test('validates the configured model', async () => {
  const requests = [];
  const adapter = createOpenAIAdapter(makeConfig(), {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ id: 'gpt-5.5' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await adapter.validateConfiguration({ force: true });
  assert.equal(result.ready, true);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/models/gpt-5.5');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key');
});

test('research uses the Responses API web_search tool', async () => {
  let requestBody;
  const adapter = createOpenAIAdapter(makeConfig(), {
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Research result.',
            annotations: [{
              type: 'url_citation',
              url: 'https://example.com/source',
              title: 'Example source',
            }],
          }],
        }],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
        },
      }), { status: 200 });
    },
  });

  const result = await adapter.generate({
    stage: 'research',
    prompt: 'Research this company.',
    enableWebSearch: true,
  });

  assert.equal(requestBody.model, 'gpt-5.5');
  assert.deepEqual(requestBody.tools, [{ type: 'web_search' }]);
  assert.equal(requestBody.tool_choice, 'auto');
  assert.equal(result.ok, true);
  assert.match(result.responseText, /Research result/);
  assert.match(result.responseText, /Example source/);
  assert.equal(result.citations.length, 1);
  assert.equal(result.usage.totalTokens, 30);
});

test('writing stages do not enable web search', async () => {
  let requestBody;
  const adapter = createOpenAIAdapter(makeConfig(), {
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        status: 'completed',
        output_text: 'Subject: Test\n\nEmail body.',
      }), { status: 200 });
    },
  });

  const result = await adapter.generate({
    stage: 'final_email',
    prompt: 'Write the email.',
    enableWebSearch: true,
  });

  assert.equal('tools' in requestBody, false);
  assert.equal(result.ok, true);
});

test('normalizes OpenAI API errors', async () => {
  const adapter = createOpenAIAdapter(makeConfig(), {
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: 'Invalid API key.',
        type: 'invalid_request_error',
      },
    }), { status: 401 }),
  });

  const result = await adapter.generate({
    stage: 'research',
    prompt: 'Research.',
    enableWebSearch: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Invalid API key.');
  assert.equal(result.retryable, false);
  assert.equal(result.upstreamStatus, 401);
});
