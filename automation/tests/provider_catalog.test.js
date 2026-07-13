'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROVIDER_CATALOG,
  getProviderDefinition,
  listProviders,
} = require('../provider_catalog');

test('catalog contains only OpenAI in the initial release', () => {
  assert.deepEqual(Object.keys(PROVIDER_CATALOG), ['openai']);
});

test('OpenAI definition contains the expected defaults', () => {
  const openai = getProviderDefinition(' OPENAI ');
  assert.equal(openai.id, 'openai');
  assert.equal(openai.defaultBaseUrl, 'https://api.openai.com/v1');
  assert.equal(openai.defaultModel, 'gpt-5.5');
  assert.equal(openai.supportsWebSearch, true);
});

test('unknown providers return null', () => {
  assert.equal(getProviderDefinition('xai'), null);
});

test('listProviders returns one provider', () => {
  assert.equal(listProviders().length, 1);
});
