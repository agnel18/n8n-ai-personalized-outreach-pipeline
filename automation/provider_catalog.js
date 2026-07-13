'use strict';

const PROVIDER_CATALOG = Object.freeze({
  openai: Object.freeze({
    id: 'openai',
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
    modelEnv: 'OPENAI_MODEL',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    supportsWebSearch: true,
  }),
});

function getProviderDefinition(providerId) {
  const normalized = String(providerId || '').trim().toLowerCase();
  return PROVIDER_CATALOG[normalized] || null;
}

function listProviders() {
  return Object.values(PROVIDER_CATALOG);
}

module.exports = {
  PROVIDER_CATALOG,
  getProviderDefinition,
  listProviders,
};
