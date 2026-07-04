// DOM inspector for the browser worker's target site (chatgpts.site by default).
//
// Browser mode depends on CSS/DOM selectors that the site can change at any time.
// When capture breaks, run this to discover the CURRENT selectors, then update the
// SELECTORS block (and isStreaming/completion signals) in chatgpt_worker.js.
// See docs/MAINTAINING_SELECTORS.md for the full walkthrough.
//
// Usage (from the automation/ folder):
//   node inspect_dom.js              # snapshot the idle page (input + buttons + message containers)
//   SEND_TEST=1 node inspect_dom.js  # also send a probe prompt and watch streaming -> complete
//
// Env:
//   TARGET_URL           default https://chatgpts.site/
//   CHATGPT_PROFILE_DIR  default ./.chatgpt-profile   (reuses your logged-in session)
//   SEND_TEST=1          send a test prompt and sample the response lifecycle
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.TARGET_URL || 'https://chatgpts.site/';
const PROFILE_DIR = process.env.CHATGPT_PROFILE_DIR || path.join(process.cwd(), '.chatgpt-profile');
const SEND_TEST = /^(1|true|yes|on)$/i.test(String(process.env.SEND_TEST || ''));

const j = (o) => JSON.stringify(o, null, 2);

// Serialize the "interesting" bits of the page: the input element, buttons that
// carry an aria-label / data-testid / svg (send, stop, copy, model switch), and
// counts for common message-container selectors.
async function snapshot(page, label) {
  const data = await page.evaluate(() => {
    const brief = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      cls: typeof el.className === 'string' ? el.className.slice(0, 100) || undefined : undefined,
      role: el.getAttribute('role') || undefined,
      contenteditable: el.getAttribute('contenteditable') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      testid: el.getAttribute('data-testid') || undefined,
      text: (el.innerText || '').trim().slice(0, 60) || undefined,
    });
    const inputs = [
      ...document.querySelectorAll("[contenteditable='true'], textarea, div[role='textbox']"),
    ].map(brief);
    const buttons = [...document.querySelectorAll('button')]
      .filter((b) => b.getAttribute('aria-label') || b.getAttribute('data-testid') || b.querySelector('svg'))
      .map(brief)
      .slice(0, 40);
    const msgSelectors = [
      '[data-message-author-role]',
      "[data-testid^='conversation-turn']",
      '.markdown',
      '.prose',
      '.markdown.prose',
    ];
    const msgCounts = {};
    for (const s of msgSelectors) {
      try { msgCounts[s] = document.querySelectorAll(s).length; } catch (_) { msgCounts[s] = 'err'; }
    }
    const authorRoles = [...document.querySelectorAll('[data-message-author-role]')].map((el) =>
      el.getAttribute('data-message-author-role'));
    return { inputs, buttons, authorRoles, msgCounts };
  });
  console.log(`\n================ SNAPSHOT: ${label} ================`);
  console.log('INPUTS:', j(data.inputs));
  console.log('BUTTONS (aria-label / data-testid):', j(data.buttons));
  console.log('author-role values:', j(data.authorRoles));
  console.log('message-container counts:', j(data.msgCounts));
  return data;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000); // let the SPA mount / allow manual login

  await snapshot(page, 'idle (before send)');

  if (SEND_TEST) {
    const input = page.locator("[contenteditable='true'], div[role='textbox'], textarea").first();
    await input.click().catch(() => {});
    const probe = 'Reply with exactly: PONG-12345 and nothing else.';
    await input.fill(probe).catch(async () => { await input.type(probe).catch(() => {}); });
    await page.waitForTimeout(500);
    await input.evaluate((el) => el.focus()).catch(() => {});
    await page.keyboard.press('Enter');
    console.log('\n>>> pressed Enter; sampling the response lifecycle for ~30s...');

    let lastLen = -1;
    for (let i = 0; i < 30; i++) {
      const s = await page.evaluate(() => {
        const stop = [...document.querySelectorAll('button')]
          .map((b) => b.getAttribute('aria-label'))
          .filter((a) => a && /stop/i.test(a));
        const copy = [...document.querySelectorAll('button')]
          .map((b) => b.getAttribute('aria-label'))
          .filter((a) => a && /copy/i.test(a));
        const cands = [
          "[data-message-author-role='assistant']",
          "[data-testid^='conversation-turn'] .markdown",
          '.markdown.prose',
          '.markdown',
        ];
        let text = '', used = '';
        for (const c of cands) {
          const els = document.querySelectorAll(c);
          if (els.length) { text = (els[els.length - 1].innerText || '').trim(); used = c; break; }
        }
        return { stop, copy, sel: used, textLen: text.length, tail: text.slice(-60) };
      });
      if (s.textLen !== lastLen || i % 5 === 0) {
        console.log(`t=${i}s stop=${j(s.stop)} copy=${j(s.copy)} sel=${s.sel} textLen=${s.textLen} tail="${s.tail}"`);
        lastLen = s.textLen;
      }
      await page.waitForTimeout(1000);
    }
    await snapshot(page, 'after reply');
  }

  console.log('\nDone. Interpreting the output:');
  console.log('  - INPUTS  -> update SELECTORS.inputs (the contenteditable/textarea you type into).');
  console.log('  - the button whose aria-label contains "stop" -> SELECTORS.stopButtons (streaming signal).');
  console.log('  - the "Copy response" button (appears only when DONE) -> SELECTORS.copyButtons.');
  console.log('  - the message-container selector with a nonzero count -> SELECTORS.assistant.');
  console.log('\nLeaving the browser open 15s for manual inspection...');
  await page.waitForTimeout(15000);
  await ctx.close();
})().catch((e) => { console.error('INSPECTOR ERROR:', e); process.exit(1); });
