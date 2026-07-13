'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBaseUrl,
  resolveProviderConfig,
  loadProviderAdapter,
} = require('../provider_registry');

test('resolves OpenAI-specific environment variables', () => {
  const config = resolveProviderConfig({
    API_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'gpt-5.5',
    OPENAI_BASE_URL: 'https://api.openai.com/v1/',
  });

  assert.equal(config.provider, 'openai');
  assert.equal(config.apiKey, 'test-key');
  assert.equal(config.model, 'gpt-5.5');
  assert.equal(config.baseUrl, 'https://api.openai.com/v1');
  assert.equal(config.ready, true);
});

test('supports legacy API_KEY and MODEL variables', () => {
  const config = resolveProviderConfig({
    API_PROVIDER: 'openai',
    API_KEY: 'legacy-key',
    MODEL: 'gpt-5.5',
  });

  assert.equal(config.apiKey, 'legacy-key');
  assert.equal(config.keySource, 'API_KEY (legacy)');
});

test('defaults to OpenAI', () => {
  const config = resolveProviderConfig({ OPENAI_API_KEY: 'test-key' });
  assert.equal(config.provider, 'openai');
});

test('rejects providers that are not included yet', () => {
  assert.throws(
    () => resolveProviderConfig({ API_PROVIDER: 'xai', XAI_API_KEY: 'key' }),
    /currently supports only "openai"/,
  );
});

test('normalizes trailing slashes in base URLs', () => {
  assert.equal(
    normalizeBaseUrl('https://api.openai.com/v1///'),
    'https://api.openai.com/v1',
  );
});

test('loads the OpenAI adapter', () => {
  const config = resolveProviderConfig({ OPENAI_API_KEY: 'test-key' });
  const adapter = loadProviderAdapter(config, {
    fetchImpl: async () => new Response('{}', { status: 200 }),
  });
  assert.equal(adapter.id, 'openai');
});
