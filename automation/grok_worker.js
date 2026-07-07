const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.GROK_WORKER_PORT || 8787;
const GROK_URL = process.env.GROK_URL || 'https://grok.com/';
const PROFILE_DIR = process.env.GROK_PROFILE_DIR || path.join(process.cwd(), '.grok-profile');
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(process.cwd(), '..');
const OUTPUT_ROOT = process.env.OUTPUT_ROOT || path.join(REPO_ROOT, 'docs', 'output');

// Human-like pacing: wait a random delay in this range before sending each
// prompt so the activity looks less like a bot. Bounds are env-configurable.
const MIN_DELAY_MS = Number(process.env.GROK_MIN_DELAY_MS || 5000);
const MAX_DELAY_MS = Number(process.env.GROK_MAX_DELAY_MS || 20000);

// Keep selector config centralized to limit blast radius when UI changes.
// `inputs` is tried in order; first match wins. This Grok build uses a
// ProseMirror contenteditable, so that selector leads.
const SELECTORS = {
  inputs: [
    "div.ProseMirror[contenteditable='true']",
    "[data-testid='chat-input'] div[contenteditable='true']",
    "div[contenteditable='true'][aria-label='Ask Grok anything']",
    "div[contenteditable='true'][role='textbox']",
  ],
  // The Copy button only renders on the latest response once generation is
  // complete — we use its appearance as the "done" signal and read the text
  // it copies straight from the clipboard.
  lastResponseCopy: ".action-buttons.last-response button[aria-label='Copy']",
  actionBars: ".action-buttons",
  // This Grok build does not submit on Enter — the prompt must be sent by
  // clicking the submit button. Tried in order; first match wins.
  submitButtons: [
    "button[data-testid='chat-submit']",
    "button[type='submit'][aria-label='Submit']",
    "button[aria-label='Submit']",
  ],
};

let context;
let page;

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

async function ensureBrowser() {
  if (page && !page.isClosed()) return;

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    // clipboard-read lets us pull the response text via the Copy button.
    permissions: ['clipboard-read', 'clipboard-write'],
    args: ['--disable-blink-features=AutomationControlled'],
  });

  page = context.pages()[0] || (await context.newPage());
  await page.goto(GROK_URL, { waitUntil: 'domcontentloaded' });
}

async function findInput() {
  for (const sel of SELECTORS.inputs) {
    const loc = page.locator(sel).first();
    if (await loc.count()) return loc;
  }
  return null;
}

// The site can sometimes fail to mount the ProseMirror input until the
// viewport reflows (manually reproducible by toggling mobile/desktop in
// devtools). If the input isn't there, nudge the viewport to force a re-render
// and retry, mimicking that toggle.
async function nudgeViewport() {
  try {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
  } catch (_) {
    // viewport changes can fail if the page is navigating; ignore
  }
}

// Wait until the chat input exists AND is visible — the Grok SPA can take a
// few seconds to mount the ProseMirror editor after a navigation, so polling
// (with a viewport nudge midway) is far more reliable than a one-shot check.
async function resolveInput(timeoutMs = 25000) {
  await ensureBrowser();

  const start = Date.now();
  let nudged = false;
  while (Date.now() - start < timeoutMs) {
    const input = await findInput();
    if (input) {
      try {
        await input.waitFor({ state: 'visible', timeout: 2500 });
        return input;
      } catch (_) {
        // present in DOM but not visible yet — keep waiting
      }
    }
    // After a few seconds with no usable input, force a reflow once.
    if (!nudged && Date.now() - start > 3500) {
      await nudgeViewport();
      nudged = true;
    }
    await page.waitForTimeout(700);
  }

  return await findInput();
}

async function isSessionReady() {
  try {
    const input = await resolveInput();
    if (!input) return { ready: false, reason: 'Chat input not found. Log in and open Grok chat main page.' };

    const disabled = await input.getAttribute('aria-disabled');
    if (disabled === 'true') {
      return { ready: false, reason: 'Chat input is disabled. Complete login/challenge first.' };
    }

    return { ready: true, reason: 'Grok chat input detected.' };
  } catch (err) {
    return { ready: false, reason: `Session check failed: ${err.message}` };
  }
}

async function tryEnableExpertMode() {
  // Best-effort only; UI can change. We expose warning but do not hard-fail.
  try {
    const modelButton = page.locator('#model-select-trigger').first();
    if (!(await modelButton.count())) {
      return { attempted: false, enabled: false, reason: 'Model selector not found.' };
    }

    await modelButton.click({ timeout: 4000 });
    const expertOption = page.locator("text=Expert").first();
    if (await expertOption.count()) {
      await expertOption.click({ timeout: 4000 });
      return { attempted: true, enabled: true, reason: 'Expert mode selected.' };
    }

    await page.keyboard.press('Escape').catch(() => {});
    return { attempted: true, enabled: false, reason: 'Expert option not present in current UI.' };
  } catch (err) {
    return { attempted: true, enabled: false, reason: `Expert mode toggle failed: ${err.message}` };
  }
}

// Transient dialogs (login nudges, "continue" popups) on this Grok page put a
// full-screen backdrop over the page so that <html> intercepts pointer events
// and clicks on the editor time out. Press Escape to clear what we can.
async function dismissOverlays() {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

// Wait a random MIN..MAX ms to mimic a human pausing before they hit send.
async function humanDelay() {
  const span = Math.max(0, MAX_DELAY_MS - MIN_DELAY_MS);
  const ms = MIN_DELAY_MS + Math.floor(Math.random() * (span + 1));
  await page.waitForTimeout(ms);
  return ms;
}

// Reset to a clean Grok conversation so the next lead does not inherit the
// previous lead's context. Per operator preference we re-open the start URL.
// The SPA frequently cancels a Playwright-driven goto to its own origin
// (net::ERR_ABORTED), so we try a tolerant goto first and fall back to an
// in-page navigation that the app performs itself.
async function startNewChat() {
  await ensureBrowser();
  await dismissOverlays();

  let method = 'goto GROK_URL';
  try {
    // `commit` resolves as soon as the navigation is committed, avoiding the
    // load-event aborts the SPA triggers.
    await page.goto(GROK_URL, { waitUntil: 'commit', timeout: 30000 });
  } catch (err) {
    if (!/ERR_ABORTED/i.test(err.message)) throw err;
    // Let the app navigate itself; this isn't tracked as a Playwright nav so
    // it doesn't get aborted.
    method = 'in-page nav GROK_URL';
    await page.evaluate((url) => { window.location.href = url; }, GROK_URL).catch(() => {});
  }

  // Let the SPA finish booting before we look for the editor. `commit` returns
  // very early, so wait for the DOM/network to settle, then poll for the input.
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const input = await resolveInput();
  return input
    ? { ok: true, method }
    : { ok: false, reason: 'New chat opened but chat input not found.' };
}

async function submitPrompt(promptText) {
  const input = await resolveInput();
  if (!input) {
    return { ok: false, reason: 'Cannot find chat input. Log in to Grok and retry.' };
  }

  await dismissOverlays();

  // Click to focus the editor, but don't let an overlay-intercepted click be
  // fatal — fall back to focusing the element directly via JS. fill() sets the
  // value through the DOM and works even when pointer events are blocked.
  // Retry the fill: a freshly-mounted ProseMirror editor sometimes drops the
  // first fill before it is fully interactive.
  let typed = 0;
  for (let attempt = 0; attempt < 3 && typed < 10; attempt++) {
    if (attempt > 0) await page.waitForTimeout(1000);
    try {
      await input.click({ timeout: 5000 });
    } catch (_) {
      await input.evaluate((el) => el.focus()).catch(() => {});
    }
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    try {
      await input.fill(promptText);
    } catch (_) {
      // fall through; we re-check the content below
    }
    typed = ((await input.textContent()) || '').trim().length;
  }

  if (typed < 10) {
    return { ok: false, reason: 'Prompt text did not appear in the editor reliably.' };
  }

  // Human-like pause before sending so the cadence doesn't look automated.
  await humanDelay();

  // This Grok build does not send on Enter — click the submit button. The
  // button is only enabled once text is present, so we wait for it. Fall back
  // to Enter only if no submit button can be found.
  const sent = await clickSubmit();
  if (!sent) {
    await page.keyboard.press('Enter');
  }
  return { ok: true };
}

async function clickSubmit() {
  for (const sel of SELECTORS.submitButtons) {
    const btn = page.locator(sel).first();
    try {
      if (!(await btn.count())) continue;
      // Wait until the button is enabled (Grok disables it while empty).
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      const disabled = await btn.getAttribute('disabled');
      const ariaDisabled = await btn.getAttribute('aria-disabled');
      if (disabled !== null || ariaDisabled === 'true') {
        await page.waitForTimeout(300);
      }
      await btn.click({ timeout: 5000 });
      return true;
    } catch (_) {
      // try next selector
    }
  }
  return false;
}

async function countActionBars() {
  return page.locator(SELECTORS.actionBars).count().catch(() => 0);
}

// Click the latest response's Copy button and read the copied text from the
// clipboard. This returns Grok's exact response markdown, not scraped DOM text.
async function copyLatestResponse() {
  const copyBtn = page.locator(SELECTORS.lastResponseCopy).first();
  if (!(await copyBtn.count())) return '';

  try {
    await copyBtn.scrollIntoViewIfNeeded().catch(() => {});
    await copyBtn.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    return await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (_) {
        return '';
      }
    });
  } catch (_) {
    return '';
  }
}

// A response is complete once a NEW action bar (with the Copy button) renders on
// the latest response. `priorBarCount` is the number of bars before we submitted,
// so we only accept a bar that appeared for *this* prompt.
async function captureLatestResponse(priorBarCount = 0, timeoutMs = 240000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Stop quickly if an interruption popup appears.
    const bodyText = await page.locator('main').innerText().catch(() => '');
    if (/too many requests|rate limit|captcha|verify you are human/i.test(bodyText)) {
      return {
        ok: false,
        reason: 'Grok interruption detected (quota/captcha/rate-limit). Resolve popup and retry.',
      };
    }

    const count = await countActionBars();
    if (count > priorBarCount) {
      const text = await copyLatestResponse();
      if (text && text.trim().length > 0) {
        return { ok: true, responseText: text.trim() };
      }
    }

    await page.waitForTimeout(1500);
  }

  return {
    ok: false,
    reason: 'Timed out waiting for Grok response (Copy button never appeared).',
  };
}

async function loadPromptTemplate(stage) {
  const fileMap = {
    research: 'system_prompt_01.md',
    review: 'system_prompt_02.md',
    final_email: 'system_prompt_03.md',
  };

  const fileName = fileMap[stage];
  if (!fileName) {
    throw new Error(`Unknown stage: ${stage}`);
  }

  const fullPath = path.join(REPO_ROOT, fileName);
  return fs.readFile(fullPath, 'utf8');
}

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

function buildPrompt(template, lead, previousOutput) {
  const safeLead = sanitizeLead(lead);

  const payload = {
    lead: safeLead,
    previous_output: previousOutput || '',
    instructions: 'Return only final requested output. No meta commentary.',
  };

  return `${template}\n\n---\n\nINPUT PAYLOAD (JSON)\n${JSON.stringify(payload, null, 2)}`;
}

app.get('/health', async (_req, res) => {
  const session = await isSessionReady();
  res.json({
    ok: true,
    service: 'grok-browser-worker',
    ready: session.ready,
    reason: session.reason,
    grokUrl: GROK_URL,
  });
});

app.post('/session-check', async (req, res) => {
  const contextData = req.body?.context || {};
  const session = await isSessionReady();

  res.json({
    ok: true,
    ready: session.ready,
    reason: session.reason,
    context: {
      ...contextData,
      operator_action: session.ready
        ? 'Session ready. Proceeding.'
        : 'Login required: open Grok main page and complete login/challenge before rerun.',
    },
  });
});

// Reset the Grok conversation. Call this once per lead (before stage 1) so the
// new company's research doesn't inherit the previous lead's chat context.
app.post('/new-chat', async (req, res) => {
  const contextData = req.body?.context || {};
  try {
    const result = await startNewChat();
    res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      reason: result.ok ? `New chat ready (${result.method}).` : result.reason,
      context: {
        ...contextData,
        operator_action: result.ok ? 'Fresh Grok chat started.' : result.reason,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

app.post('/run-stage', async (req, res) => {
  try {
    const stage = req.body?.stage;
    const contextData = req.body?.context || {};
    const lead = contextData.lead || req.body?.lead || {};
    const previousOutput = contextData.previous_output || req.body?.previousOutput || '';

    const session = await isSessionReady();
    if (!session.ready) {
      return res.status(409).json({
        ok: false,
        stage,
        reason: session.reason,
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: 'Login required: open Grok main page, then rerun failed stage.',
        },
      });
    }

    const expertResult = await tryEnableExpertMode();
    const template = await loadPromptTemplate(stage);
    const prompt = buildPrompt(template, lead, previousOutput);

    // Snapshot how many response action bars exist BEFORE we send, so capture
    // only accepts the bar that renders for this prompt.
    const priorBarCount = await countActionBars();

    const submit = await submitPrompt(prompt);
    if (!submit.ok) {
      return res.status(409).json({
        ok: false,
        stage,
        reason: submit.reason,
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: submit.reason,
        },
      });
    }

    const capture = await captureLatestResponse(priorBarCount);
    if (!capture.ok) {
      return res.status(409).json({
        ok: false,
        stage,
        reason: capture.reason,
        context: {
          ...contextData,
          status: 'Failed',
          operator_action: capture.reason,
        },
      });
    }

    const mdPath = await saveMarkdown({
      companyName: lead.organization_name || lead.company || 'Unknown_Company',
      stage,
      responseText: capture.responseText,
    });

    const stageKey = stage === 'research' ? 'stage1' : stage === 'review' ? 'stage2' : 'stage3';
    const status = stage === 'research' ? 'Stage1_Done' : stage === 'review' ? 'Stage2_Done' : 'Stage3_Done';

    res.json({
      ok: true,
      stage,
      reason: 'Stage completed successfully.',
      expertMode: expertResult,
      context: {
        ...contextData,
        status,
        updated_at: new Date().toISOString(),
        previous_output: capture.responseText,
        operator_action: 'Stage complete.',
        [stageKey]: {
          responseText: capture.responseText,
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

app.listen(PORT, async () => {
  await ensureBrowser();
  // Open Grok once at startup so the operator can log in interactively.
  console.log(`grok-browser-worker listening on http://localhost:${PORT}`);
  console.log(`repo root: ${REPO_ROOT}`);
  console.log('Open the visible browser window, log into Grok, and keep chat page active.');
});
