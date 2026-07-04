// ChatGPT browser worker — a drop-in alternative to grok_worker.js for when Grok
// is down. It drives the https://chatgpts.site/ mirror and exposes the SAME HTTP
// API and response shape (/health, /session-check, /new-chat, /run-stage), so the
// n8n workflow works unchanged — just point grok_worker_url at this worker (it
// listens on the same default port 8787).
//
// Differences from the Grok worker:
//   - Input is ChatGPT's ProseMirror editor (#prompt-textarea).
//   - Prompts are sent by pressing ENTER (there is no submit button to click).
//   - The "Too many requests" dialog (which can appear at any time) is dismissed
//     by clicking its "Got it" button on every poll.
//   - Completion is detected when the turn's "Copy response" button renders; we
//     click it and read the exact text from the clipboard (DOM innerText fallback).
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.WORKER_PORT || process.env.CHATGPT_WORKER_PORT || process.env.GROK_WORKER_PORT || 8787;
const CHATGPT_URL = process.env.CHATGPT_URL || 'https://chatgpts.site/';
const PROFILE_DIR = process.env.CHATGPT_PROFILE_DIR || path.join(process.cwd(), '.chatgpt-profile');
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(process.cwd(), '..');
const OUTPUT_ROOT = process.env.OUTPUT_ROOT || path.join(REPO_ROOT, 'docs', 'output');

// Human-like pacing: wait a random delay in this range before sending each prompt.
// Prefer CHATGPT_* env vars; fall back to the older GROK_* names for compatibility.
const MIN_DELAY_MS = Number(process.env.CHATGPT_MIN_DELAY_MS || process.env.GROK_MIN_DELAY_MS || 5000);
const MAX_DELAY_MS = Number(process.env.CHATGPT_MAX_DELAY_MS || process.env.GROK_MAX_DELAY_MS || 20000);

// How long the latest assistant message must stay unchanged before we treat the
// response as complete.
const STABLE_MS = Number(process.env.CHATGPT_STABLE_MS || 3500);

const SELECTORS = {
  // The visible editor is the contenteditable div with id prompt-textarea (the
  // element named prompt-textarea is a hidden fallback textarea).
  inputs: [
    "div#prompt-textarea[contenteditable='true']",
    "#prompt-textarea[contenteditable='true']",
    "div.ProseMirror[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
  ],
  // Assistant message containers, newest last. Tried in order; first that matches
  // wins for both counting and text extraction.
  assistant: [
    "[data-message-author-role='assistant']",
    "[data-testid^='conversation-turn'] .markdown",
    "div.agent-turn .markdown",
    '.markdown.prose',
  ],
  // The "Copy response" button renders on a turn only once its response is
  // COMPLETE — we use its appearance as the "done" signal and read the exact text
  // it copies from the clipboard. NOTE: chatgpts.site ALSO shows a separate "Copy
  // message" button while streaming, so we must NOT match a loose *='Copy'; that
  // was the early-capture trap. Match "Copy response" only. Last = newest turn.
  copyButtons: [
    "button[aria-label='Copy response']",
    "button[data-testid='copy-turn-action-button']",
  ],
  // Shown while a response is streaming; its presence means "not done yet". On
  // chatgpts.site this is the "Stop answering" button (aria-label).
  stopButtons: [
    "button[aria-label='Stop answering']",
    "button[data-testid='stop-button']",
    "button[aria-label*='Stop' i]",
  ],
  // Best-effort triggers for switching the model/effort to a "high" option.
  modelTriggers: [
    "[data-testid='model-switcher-dropdown-button']",
    "button[aria-label*='model' i]",
    "button[data-testid*='model']",
  ],
};

let context;
let page;

// The worker drives ONE shared browser page, so browser-touching endpoints
// (/new-chat, /run-stage) MUST NOT overlap — n8n can fire requests for multiple
// leads concurrently, and two capture loops on the same page corrupt each other
// (both submit into the same chat and capture the same/each-other's response).
// This promise-chain mutex serializes them: a second request waits its turn.
// (Still set the n8n loop batch size to 1 so leads don't interleave in one chat.)
let workerQueue = Promise.resolve();
function enqueue(task) {
  const run = workerQueue.then(task, task);
  // Keep the chain alive regardless of this task's outcome.
  workerQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

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
    // clipboard-read/write let us pull the response text via the Copy button.
    permissions: ['clipboard-read', 'clipboard-write'],
    args: ['--disable-blink-features=AutomationControlled'],
  });

  page = context.pages()[0] || (await context.newPage());
  await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });
}

function findInput() {
  return (async () => {
    for (const sel of SELECTORS.inputs) {
      const loc = page.locator(sel).first();
      try {
        if (await loc.count()) return loc;
      } catch (_) {
        // ignore and try next
      }
    }
    return null;
  })();
}

// The mirror can take a few seconds to mount the editor after navigation, so we
// poll (nudging the viewport once) rather than checking a single time.
async function nudgeViewport() {
  try {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
  } catch (_) {
    // viewport changes can fail mid-navigation; ignore
  }
}

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
        // present but not visible yet
      }
    }
    if (!nudged && Date.now() - start > 3500) {
      await nudgeViewport();
      nudged = true;
    }
    await page.waitForTimeout(700);
  }
  return await findInput();
}

// Close the "Too many requests" dialog by clicking its "Got it" button.
// CRITICAL: do NOT press Escape here. On ChatGPT, Escape cancels an in-progress
// generation (confirmed empirically) — pressing it on every capture poll was
// aborting the response, leaving streaming=false / textLen=0 forever. We dismiss
// known popups by clicking their button only.
async function dismissOverlays() {
  try {
    const gotIt = page.locator('button:has-text("Got it")').first();
    if (await gotIt.count()) {
      await gotIt.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  } catch (_) {
    // ignore
  }
}

async function humanDelay() {
  const span = Math.max(0, MAX_DELAY_MS - MIN_DELAY_MS);
  const ms = MIN_DELAY_MS + Math.floor(Math.random() * (span + 1));
  await page.waitForTimeout(ms);
  return ms;
}

async function isSessionReady() {
  try {
    await dismissOverlays();
    const input = await resolveInput();
    if (!input) {
      return { ready: false, reason: 'Chat input not found. Log in at chatgpts.site and open a chat.' };
    }
    const disabled = await input.getAttribute('aria-disabled');
    if (disabled === 'true') {
      return { ready: false, reason: 'Chat input is disabled. Complete login/challenge first.' };
    }
    return { ready: true, reason: 'ChatGPT chat input detected.' };
  } catch (err) {
    return { ready: false, reason: `Session check failed: ${err.message}` };
  }
}

// Best-effort switch to a "high" reasoning/model option. UI varies across
// mirrors, so this is non-fatal — if it can't find the control, set it manually
// in the browser once (the persistent profile remembers it).
async function tryEnableHighMode() {
  try {
    for (const trg of SELECTORS.modelTriggers) {
      const btn = page.locator(trg).first();
      if (!(await btn.count())) continue;
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      const opt = page.locator('text=/\\bhigh\\b/i').first();
      if (await opt.count()) {
        await opt.click({ timeout: 3000 }).catch(() => {});
        return { attempted: true, enabled: true, reason: 'Selected a "high" option.' };
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
    return {
      attempted: true,
      enabled: false,
      reason: 'High-mode control not found — set it manually in the browser (profile remembers it).',
    };
  } catch (err) {
    return { attempted: true, enabled: false, reason: `High-mode toggle failed: ${err.message}` };
  }
}

// Read the editor's current text. ProseMirror's `.textContent()` misreads as ''
// even when populated (confirmed on chatgpts.site), so we read `innerText` of the
// contenteditable and fall back to the hidden mirror <textarea>'s value.
async function editorText() {
  try {
    return await page.evaluate(() => {
      const ce = document.querySelector("div#prompt-textarea[contenteditable='true']")
        || document.querySelector("[contenteditable='true'][role='textbox']");
      const ta = document.querySelector('textarea');
      const a = ce ? (ce.innerText || '').trim() : '';
      const b = ta ? (ta.value || '').trim() : '';
      return a.length >= b.length ? a : b;
    });
  } catch (_) {
    return '';
  }
}

async function submitPrompt(promptText) {
  const input = await resolveInput();
  if (!input) {
    return { ok: false, reason: 'Cannot find chat input. Log in to ChatGPT and retry.' };
  }

  await dismissOverlays();

  // Fill the editor, retrying because a freshly-mounted ProseMirror sometimes
  // drops the first fill before it is fully interactive.
  let typed = 0;
  for (let attempt = 0; attempt < 3 && typed < 10; attempt++) {
    if (attempt > 0) await page.waitForTimeout(800);
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
      // re-checked below
    }
    typed = (await editorText()).length;
  }

  if (typed < 10) {
    return { ok: false, reason: 'Prompt text did not appear in the editor reliably.' };
  }

  // Human-like pause before sending.
  await humanDelay();

  // Physically press Enter (chatgpts.site submits on Enter — confirmed) and then
  // CONFIRM our message was actually sent. `page.keyboard.press` targets the
  // focused editor, which is more reliable than `locator.press` on ProseMirror.
  // The definitive "sent" signal is a NEW user turn appearing (or streaming
  // starting); the editor emptying alone is too weak. Retry a few times if not.
  const priorUsers = await page.evaluate(
    () => document.querySelectorAll("[data-message-author-role='user']").length,
  );
  for (let attempt = 0; attempt < 4; attempt++) {
    await input.evaluate((el) => el.focus()).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    const sent = await page
      .waitForFunction(
        (prior) => {
          const users = document.querySelectorAll("[data-message-author-role='user']").length;
          const streaming = [...document.querySelectorAll('button')].some((b) =>
            /stop/i.test(b.getAttribute('aria-label') || ''));
          return users > prior || streaming;
        },
        priorUsers,
        { timeout: 6000 },
      )
      .then(() => true)
      .catch(() => false);
    if (sent) {
      console.log('[submit] message sent (new user turn / streaming detected).');
      return { ok: true };
    }
    await page.waitForTimeout(500);
  }

  return {
    ok: false,
    reason: 'Prompt was typed but never sent (Enter did not submit).',
  };
}

async function countAssistantMessages() {
  return page
    .evaluate((sels) => {
      for (const s of sels) {
        const els = document.querySelectorAll(s);
        if (els.length) return els.length;
      }
      return 0;
    }, SELECTORS.assistant)
    .catch(() => 0);
}

async function lastAssistantText() {
  return page
    .evaluate((sels) => {
      for (const s of sels) {
        const els = document.querySelectorAll(s);
        if (els.length) return els[els.length - 1].innerText || '';
      }
      return '';
    }, SELECTORS.assistant)
    .catch(() => '');
}

async function countCopyButtons() {
  for (const s of SELECTORS.copyButtons) {
    try {
      const n = await page.locator(s).count();
      if (n) return n;
    } catch (_) {
      // try next
    }
  }
  return 0;
}

// True while ChatGPT is still generating: the "Stop" button is only present
// during streaming. If the mirror has no recognizable stop button this always
// returns false, and we fall back to text-stability alone.
async function isStreaming() {
  for (const s of SELECTORS.stopButtons) {
    try {
      if (await page.locator(s).count()) return true;
    } catch (_) {
      // try next
    }
  }
  return false;
}

// Return the newest turn's Copy button, using whichever selector actually
// matches (not just the first in the list — that was the old bug that made us
// click a non-existent button and silently fall back to partial DOM text).
async function copyButtonLocator() {
  for (const s of SELECTORS.copyButtons) {
    const loc = page.locator(s);
    try {
      if (await loc.count()) return loc.last();
    } catch (_) {
      // try next
    }
  }
  return null;
}

// Click the latest turn's "Copy response" button and read the copied text from
// the clipboard — this is ChatGPT's exact response, not scraped DOM. The action
// bar is pointer-events:none until hover, so we click via the DOM to bypass it.
async function copyLatestResponse() {
  const btn = await copyButtonLocator();
  if (!btn || !(await btn.count())) return '';
  try {
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.evaluate((el) => el.click()).catch(async () => {
      await btn.click({ force: true }).catch(() => {});
    });
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

// A response is complete only when ALL of these hold:
//   1. ChatGPT is no longer streaming (no Stop button), AND
//   2. a NEW turn has appeared since we submitted (more copy buttons OR more
//      assistant messages than the pre-submit snapshot), AND
//   3. the latest assistant text has stopped changing for STABLE_MS.
// Relying on the Copy button alone was the bug: some mirrors render it (or a
// generic copy button) the instant the assistant bubble mounts, so we captured
// partial/empty text and marched on before generation finished. `prior` is the
// {copy, assistant} snapshot taken before submit. The "Too many requests"
// dialog can pop up at any moment, so we dismiss it on every poll.
async function captureLatestResponse(prior = { copy: 0, assistant: 0 }, timeoutMs = 300000) {
  const start = Date.now();
  let lastText = '';
  let stableSince = 0;
  let lastLog = 0;

  while (Date.now() - start < timeoutMs) {
    await dismissOverlays();

    const streaming = await isStreaming();
    const copyN = await countCopyButtons();
    const assistantN = await countAssistantMessages();
    const text = streaming ? '' : (await lastAssistantText()).trim();

    // Heartbeat every ~4s so a hang is explained in the worker terminal.
    if (Date.now() - lastLog > 4000) {
      const secs = Math.round((Date.now() - start) / 1000);
      console.log(
        `[capture] t=${secs}s streaming=${streaming} copy=${copyN}/${prior.copy} ` +
          `assistant=${assistantN}/${prior.assistant} textLen=${text.length}`,
      );
      lastLog = Date.now();
    }

    // (1) Still generating — reset the stability window and keep waiting.
    if (streaming) {
      lastText = '';
      stableSince = 0;
      await page.waitForTimeout(1200);
      continue;
    }

    // (2) A response for THIS prompt must have appeared.
    const newTurn = copyN > prior.copy || assistantN > prior.assistant;
    if (!newTurn) {
      await page.waitForTimeout(1200);
      continue;
    }

    // (3) Wait for the text to settle before trusting it.
    if (text.length === 0) {
      await page.waitForTimeout(1200);
      continue;
    }
    if (text !== lastText) {
      lastText = text;
      stableSince = Date.now();
      await page.waitForTimeout(1000);
      continue;
    }
    if (Date.now() - stableSince >= STABLE_MS) {
      // Text has settled: prefer the exact clipboard copy, fall back to the DOM.
      const copied = (await copyLatestResponse()).trim();
      console.log(`[capture] done — ${copied.length ? 'clipboard' : 'DOM'} text, ${(copied || text).length} chars`);
      return { ok: true, responseText: copied.length ? copied : text };
    }

    await page.waitForTimeout(800);
  }

  return {
    ok: false,
    reason: 'Timed out waiting for ChatGPT response to finish generating.',
  };
}

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
  const payload = {
    lead: sanitizeLead(lead),
    previous_output: previousOutput || '',
    instructions: 'Return only final requested output. No meta commentary.',
  };
  return `${template}\n\n---\n\nINPUT PAYLOAD (JSON)\n${JSON.stringify(payload, null, 2)}`;
}

// Reset to a clean conversation so the next lead does not inherit the previous
// lead's chat context. Re-open the start URL (the persistent session stays
// logged in). The SPA can cancel a same-origin goto (ERR_ABORTED), so fall back
// to an in-page navigation.
async function startNewChat() {
  await ensureBrowser();
  await dismissOverlays();

  let method = 'goto CHATGPT_URL';
  try {
    await page.goto(CHATGPT_URL, { waitUntil: 'commit', timeout: 30000 });
  } catch (err) {
    if (!/ERR_ABORTED/i.test(err.message)) throw err;
    method = 'in-page nav CHATGPT_URL';
    await page.evaluate((url) => { window.location.href = url; }, CHATGPT_URL).catch(() => {});
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // High mode persists in the profile; don't toggle it here (clicking the model
  // dropdown can leave a menu open that blocks the first prompt from sending).

  const input = await resolveInput();
  return input
    ? { ok: true, method }
    : { ok: false, reason: 'New chat opened but chat input not found.' };
}

app.get('/health', async (_req, res) => {
  const session = await isSessionReady();
  res.json({
    ok: true,
    service: 'chatgpt-browser-worker',
    ready: session.ready,
    reason: session.reason,
    chatgptUrl: CHATGPT_URL,
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
        : 'Login required: open chatgpts.site and complete login/challenge before rerun.',
    },
  });
});

app.post('/new-chat', (req, res) => enqueue(async () => {
  const contextData = req.body?.context || {};
  try {
    const result = await startNewChat();
    res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      reason: result.ok ? `New chat ready (${result.method}).` : result.reason,
      context: {
        ...contextData,
        operator_action: result.ok ? 'Fresh ChatGPT chat started.' : result.reason,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
}));

app.post('/run-stage', (req, res) => enqueue(async () => {
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
          operator_action: 'Login required: open chatgpts.site, then rerun failed stage.',
        },
      });
    }

    // NOTE: high mode is NOT toggled here. It persists in the browser profile
    // (set it once manually), and clicking the model dropdown right before typing
    // was stealing focus from the editor and causing the prompt to never send.
    const template = await loadPromptTemplate(stage);
    const prompt = buildPrompt(template, lead, previousOutput);

    // Snapshot both turn signals BEFORE sending, so capture only accepts the
    // response that renders for THIS prompt.
    const prior = {
      copy: await countCopyButtons(),
      assistant: await countAssistantMessages(),
    };

    const submit = await submitPrompt(prompt);
    if (!submit.ok) {
      return res.status(409).json({
        ok: false,
        stage,
        reason: submit.reason,
        context: { ...contextData, status: 'Failed', operator_action: submit.reason },
      });
    }

    const capture = await captureLatestResponse(prior);
    if (!capture.ok) {
      return res.status(409).json({
        ok: false,
        stage,
        reason: capture.reason,
        context: { ...contextData, status: 'Failed', operator_action: capture.reason },
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
}));

app.listen(PORT, async () => {
  await ensureBrowser();
  console.log(`chatgpt-browser-worker listening on http://localhost:${PORT}`);
  console.log(`repo root: ${REPO_ROOT}`);
  console.log(`target: ${CHATGPT_URL}`);
  console.log('Open the visible browser window, log into ChatGPT, set "high" mode, keep the chat open.');
});
