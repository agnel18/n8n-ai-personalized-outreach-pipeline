// Shared, provider-agnostic helpers for the pipeline workers. These are pure
// (no browser, no network) so both the browser worker and the API worker can
// produce byte-identical prompts and markdown output. Extracted verbatim from
// chatgpt_worker.js; the browser workers keep their own copies for now to avoid
// destabilizing the verified path (optional future refactor: have them import here).
const path = require('path');
const fs = require('fs/promises');

// Repo root holds the system_prompt_0N.md templates; output goes under docs/output.
// Same resolution the browser workers use, so all workers agree on paths.
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(process.cwd(), '..');
const OUTPUT_ROOT = process.env.OUTPUT_ROOT || path.join(REPO_ROOT, 'docs', 'output');

function slug(value) {
  return String(value || 'Unknown_Company')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Unknown_Company';
}

function nowStamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function sanitizeLead(lead = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(lead)) {
    const value = typeof v === 'string' ? v.slice(0, 4000) : v;
    clean[k] = value;
  }
  return clean;
}

// Maps a pipeline stage to its prompt template file (in the repo root).
async function loadPromptTemplate(stage) {
  const fileMap = {
    research: 'system_prompt_01.md',
    review: 'system_prompt_02.md',
    final_email: 'system_prompt_03.md',
  };
  const fileName = fileMap[stage];
  if (!fileName) throw new Error(`Unknown stage: ${stage}`);
  return fs.readFile(path.join(REPO_ROOT, fileName), 'utf8');
}

// Compose the final prompt: the stage template followed by the JSON payload
// (lead + the previous stage's output). Identical shape across all workers so a
// lead's research/review/email are built the same way regardless of backend.
function buildPrompt(template, lead, previousOutput) {
  const payload = {
    lead: sanitizeLead(lead),
    previous_output: previousOutput || '',
    instructions: 'Return only final requested output. No meta commentary.',
  };
  return `${template}\n\n---\n\nINPUT PAYLOAD (JSON)\n${JSON.stringify(payload, null, 2)}`;
}

// Persist a stage's output as docs/output/<YYYYMMDD>/<companySlug>/<stamp>_<slug>_<Label>.md
// and return the absolute path (n8n logs it as context.stageN.mdPath).
async function saveMarkdown({ companyName, stage, responseText }) {
  const stageLabel =
    stage === 'research' ? 'Research' : stage === 'review' ? 'Review' : 'Final_Email';
  const stamp = nowStamp();
  const companySlug = slug(companyName);
  const dateFolder = stamp.slice(0, 8);
  const dirPath = path.join(OUTPUT_ROOT, dateFolder, companySlug);
  await fs.mkdir(dirPath, { recursive: true });

  const fileName = `${stamp}_${companySlug}_${stageLabel}.md`;
  const filePath = path.join(dirPath, fileName);
  await fs.writeFile(filePath, responseText, 'utf8');
  return filePath;
}

// Stage → (context.status value, context.stageN key) the workflow expects.
function stageMeta(stage) {
  if (stage === 'research') return { key: 'stage1', status: 'Stage1_Done' };
  if (stage === 'review') return { key: 'stage2', status: 'Stage2_Done' };
  if (stage === 'final_email') return { key: 'stage3', status: 'Stage3_Done' };
  return null;
}

module.exports = {
  REPO_ROOT,
  OUTPUT_ROOT,
  slug,
  nowStamp,
  sanitizeLead,
  loadPromptTemplate,
  buildPrompt,
  saveMarkdown,
  stageMeta,
};
