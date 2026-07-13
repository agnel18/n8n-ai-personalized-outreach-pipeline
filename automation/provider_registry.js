'use strict';

const { getProviderDefinition } = require('./provider_catalog');

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveProviderConfig(env = process.env) {
  const providerId = String(env.API_PROVIDER || 'openai').trim().toLowerCase();
  const definition = getProviderDefinition(providerId);

  if (!definition) {
    throw new Error(
      `Unsupported API_PROVIDER "${providerId || '(empty)'}". ` +
      'This build currently supports only "openai".',
    );
  }

  const apiKey = String(
    env[definition.keyEnv] ||
    env.API_KEY ||
    '',
  ).trim();

  const baseUrl = normalizeBaseUrl(
    env[definition.baseUrlEnv] ||
    env.API_BASE_URL ||
    definition.defaultBaseUrl,
  );

  const model = String(
    env[definition.modelEnv] ||
    env.MODEL ||
    definition.defaultModel,
  ).trim();

  return {
    provider: definition.id,
    label: definition.label,
    apiKey,
    baseUrl,
    model,
    supportsWebSearch: definition.supportsWebSearch,
    ready: Boolean(apiKey && baseUrl && model),
    keySource: env[definition.keyEnv]
      ? definition.keyEnv
      : env.API_KEY
        ? 'API_KEY (legacy)'
        : '',
    modelSource: env[definition.modelEnv]
      ? definition.modelEnv
      : env.MODEL
        ? 'MODEL (legacy)'
        : 'catalog default',
  };
}

function loadProviderAdapter(config, options = {}) {
  if (config.provider !== 'openai') {
    throw new Error(`No adapter is registered for provider "${config.provider}".`);
  }

  const { createOpenAIAdapter } = require('./providers/openai');
  return createOpenAIAdapter(config, options);
}

module.exports = {
  normalizeBaseUrl,
  resolveProviderConfig,
  loadProviderAdapter,
};
