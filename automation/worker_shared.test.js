// Unit tests for the pure, provider-agnostic helpers shared by all workers.
// Run: `npm test` (uses Node's built-in test runner — no dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  slug,
  nowStamp,
  sanitizeLead,
  buildPrompt,
  stageMeta,
  loadPromptTemplate,
} = require('./worker_shared');

test('slug: normal company name', () => {
  assert.equal(slug('Unilam Wood Industries'), 'Unilam_Wood_Industries');
});

test('slug: empty / null / punctuation-only fall back to Unknown_Company', () => {
  assert.equal(slug(''), 'Unknown_Company');
  assert.equal(slug(null), 'Unknown_Company');
  assert.equal(slug('  @@!!  '), 'Unknown_Company');
});

test('nowStamp: deterministic YYYYMMDD_HHMMSS', () => {
  // Month is 0-indexed: 6 = July.
  assert.equal(nowStamp(new Date(2026, 6, 2, 16, 35, 9)), '20260702_163509');
});

test('stageMeta: maps each stage to (key, status); unknown -> null', () => {
  assert.deepEqual(stageMeta('research'), { key: 'stage1', status: 'Stage1_Done' });
  assert.deepEqual(stageMeta('review'), { key: 'stage2', status: 'Stage2_Done' });
  assert.deepEqual(stageMeta('final_email'), { key: 'stage3', status: 'Stage3_Done' });
  assert.equal(stageMeta('bogus'), null);
});

test('sanitizeLead: truncates long strings to 4000 chars, preserves non-strings', () => {
  const clean = sanitizeLead({ desc: 'x'.repeat(5000), foundedYear: 2021 });
  assert.equal(clean.desc.length, 4000);
  assert.equal(clean.foundedYear, 2021);
});

test('buildPrompt: includes the template and a JSON payload with previous_output', () => {
  const prompt = buildPrompt('TEMPLATE_MARKER', { email: 'a@b.co' }, 'PRIOR_STAGE_TEXT');
  assert.match(prompt, /TEMPLATE_MARKER/);
  assert.match(prompt, /INPUT PAYLOAD \(JSON\)/);
  assert.match(prompt, /PRIOR_STAGE_TEXT/);
  assert.match(prompt, /"email": "a@b\.co"/);
});

test('loadPromptTemplate: rejects an unknown stage', async () => {
  await assert.rejects(() => loadPromptTemplate('bogus'), /Unknown stage: bogus/);
});
