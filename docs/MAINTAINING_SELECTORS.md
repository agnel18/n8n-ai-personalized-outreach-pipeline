# Maintaining the browser worker's DOM selectors

**Applies to browser mode only** (`automation/chatgpt_worker.js` → chatgpts.site, and
`automation/grok_worker.js` → grok2.testingg.in). The **API worker** (`api_worker.js`)
has no DOM and never needs this — if browser mode keeps breaking, switching to API mode
is the permanent fix.

Browser mode works by finding elements on a third‑party web UI. Those sites can change
their HTML at any time, and when they do, the worker can no longer type the prompt, tell
when generation finished, or read the reply. This guide shows how to **re‑discover the
current elements** and **patch the worker** in a few minutes.

---

## 1. How the worker uses the DOM (mental model)

Every run of a stage does four DOM things, each driven by a selector group in the
`SELECTORS` object near the top of `automation/chatgpt_worker.js`:

| Step | What it needs | `SELECTORS` group | Confirmed value on chatgpts.site |
|------|---------------|-------------------|----------------------------------|
| 1. Type the prompt | the chat input box | `inputs` | `div#prompt-textarea[contenteditable='true']` |
| 2. Send | press **Enter** (submits) | — (keyboard) | Enter submits; Shift+Enter = newline |
| 3. Know it's still generating | the "stop" button shown while streaming | `stopButtons` | button with `aria-label="Stop answering"` |
| 4. Know it's done + read text | the "copy" button that appears only when finished | `copyButtons` | button with `aria-label="Copy response"` |
| (read fallback) | the assistant message container | `assistant` | `[data-message-author-role='assistant']` |

Completion logic (in `captureLatestResponse`): a reply is **done** only when **all** of —
not streaming (no stop button) **AND** a new turn appeared **AND** the text stopped
changing for `CHATGPT_STABLE_MS` (default 3.5 s). If any of those signals point at the
wrong element, capture either grabs partial text or hangs.

---

## 2. Hard‑won gotchas (read before changing anything)

These are real behaviors we verified — keep them in mind so you don't "fix" the wrong thing:

- **Never press `Escape` during generation.** On ChatGPT, Escape **cancels** the response.
  `dismissOverlays()` deliberately does **not** press Escape. If you add popup handling,
  click the popup's button — don't send Escape.
- **In high mode the assistant text disappears mid‑answer.** During the reasoning/
  web‑search phase, the `assistant` element is removed and the message text is empty for
  a long time, while the **"Stop answering" button stays visible**. That's why streaming
  is detected by the **stop button**, not by "is there text yet".
- **`textContent()` lies on the ProseMirror editor** — it reads empty even when the box is
  full. Read `innerText` instead (the worker's `editorText()` does this).
- **Large prompts still send on Enter** (~13 KB prompts work fine). A "nothing sent" symptom
  is almost always a wrong `inputs` selector or focus issue, not size.
- **"Copy message" ≠ "Copy response".** chatgpts.site shows a *Copy message* button while
  streaming and a *Copy response* button only when finished. Match **"Copy response"** —
  matching a generic `*='Copy'` was an old early‑capture bug.

---

## 3. Symptom → likely selector at fault

| Symptom | Likely broken group | 
|---------|---------------------|
| "Prompt text did not appear in the editor" | `inputs` (or the editor isn't focusable) |
| Worker hangs, log shows `streaming=false` forever and `textLen=0` | `stopButtons` (never true) or the prompt never sent (`inputs`) |
| Worker hangs, log shows `streaming=true` forever | `stopButtons` matches something permanent |
| Captures partial / too‑early text | `copyButtons` matches a mid‑stream button; or `assistant` matches the wrong node |
| `[capture] done` but wrong/short text | `assistant` fallback points at the reasoning bubble, not the answer |

The worker prints a `[capture]` heartbeat every ~4 s with `streaming`, `copy`, `assistant`,
and `textLen` — read it first; it usually tells you which signal is stuck.

---

## 4. Re‑discover the current selectors with `inspect_dom.js`

A committed tool reuses your logged‑in browser profile and prints the live elements.

From the `automation/` folder:

```bash
# 1) Stop the worker first (it and the inspector can't share the profile).
# 2) Snapshot the idle page:
node inspect_dom.js
# 3) Or send a probe prompt and watch the whole streaming -> done lifecycle:
SEND_TEST=1 node inspect_dom.js
```

Point it elsewhere with env vars if needed:
```bash
TARGET_URL=https://chatgpts.site/ CHATGPT_PROFILE_DIR=./.chatgpt-profile SEND_TEST=1 node inspect_dom.js
```

What to read from the output:
- **`INPUTS`** → the `contenteditable`/`textarea` you type into → update `SELECTORS.inputs`.
  Prefer a stable attribute (`id`, `role`, `aria-label`) over hashed CSS classes.
- **`BUTTONS`** → find the one whose `aria-label` contains **"stop"** (streaming) →
  `SELECTORS.stopButtons`; and the **"Copy response"** button (appears only when done) →
  `SELECTORS.copyButtons`.
- **`message-container counts`** → whichever selector has a non‑zero count for the assistant
  reply → `SELECTORS.assistant`.
- In `SEND_TEST` mode, the per‑second samples show exactly when `stop` disappears and the
  `Copy response` button appears — that transition is your completion signal.

### Finding a selector by hand in the browser (DevTools)
1. In the worker's browser window, right‑click the element (the input, the Stop button,
   the Copy button) → **Inspect**.
2. In the Elements panel, read a **stable attribute**: prefer `id`, `data-testid`,
   `data-message-author-role`, or `aria-label`. Avoid class names full of random hashes.
3. Build a CSS selector, e.g. `button[aria-label='Stop answering']`.
4. Test it live in the DevTools **Console**:
   `document.querySelectorAll("button[aria-label='Stop answering']").length` — should be
   `1` while generating, `0` when idle.

---

## 5. Patch the worker

Open `automation/chatgpt_worker.js`, find the `SELECTORS` object near the top, and update
the relevant array. Each group is tried **in order, first match wins**, so put the new,
most‑specific selector **first** and keep the old ones below as fallbacks:

```js
const SELECTORS = {
  inputs: [
    "div#prompt-textarea[contenteditable='true']",   // <- add/replace here
    "div.ProseMirror[contenteditable='true']",
  ],
  assistant: [
    "[data-message-author-role='assistant']",
    "[data-testid^='conversation-turn'] .markdown",
  ],
  copyButtons: [
    "button[aria-label='Copy response']",            // completion signal — keep exact
  ],
  stopButtons: [
    "button[aria-label='Stop answering']",           // streaming signal — keep exact
    "button[aria-label*='Stop' i]",
  ],
};
```

If the **completion signal** itself changed (no more Copy button, or a different streaming
indicator), the logic to adjust lives in `isStreaming()` and `captureLatestResponse()` in
the same file. The stability fallback (`CHATGPT_STABLE_MS`) will still capture text even
without a copy button, as long as `assistant`/`stopButtons` are correct.

Then re‑check and restart:
```bash
node --check chatgpt_worker.js
npm run start:chatgpt
```

Run one stage (`curl` `/run-stage`, or a single‑lead n8n run) and watch the `[capture]`
heartbeat go `streaming=true … → streaming=false, textLen>0 → done`.

---

## 6. When to stop fighting the DOM

If the site changes often, run the **API worker** instead (`npm run start:api`) — it uses a
stable API contract and never breaks on UI changes. See [SETUP.md](../SETUP.md) for the API
setup. Browser mode's advantage is $0 cost and built‑in web‑grounded research; the API
worker trades a little money for reliability.
