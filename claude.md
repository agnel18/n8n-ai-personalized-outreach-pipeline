# AI Lead Generation Pipeline — Project Brief

**AI Lead Generation Pipeline** is an n8n automation that turns a list of B2B leads into
personalized, ready-to-review cold emails. For each lead it runs a **three-stage AI chain**
(research → strategy → final email) and lands the result as a **Gmail draft** — never auto-sent.

- **Built by:** Agnel J N ([agnel18](https://github.com/agnel18)) — AI Automation Engineer
- **Primary tool:** n8n (Docker, `localhost:5678`)
- **AI backend:** interchangeable — ChatGPT (browser), xAI Grok (browser), or an
  **OpenAI-compatible API** (xAI *or* OpenAI). All three are provider-neutral; pick one.
- **Integrations:** Gmail (OAuth2, draft-only), Google Sheets (OAuth2, status tracker)
- **Lead source:** any CSV export (e.g. Apollo.io or an Apify scraper) — no live Apollo call required

This document is the engineering brief: what the system does, how it's put together, and the
design decisions behind it. For usage see **[README.md](README.md)** and **[SETUP.md](SETUP.md)**.

---

## Architecture

The pipeline is a **three-stage prompt chain** executed by a small local **worker** (Node/Express
on port `8787`). n8n orchestrates; the worker does the AI step. Each stage is **stateless** — it
receives the previous stage's text via `previous_output` — so the same three calls reproduce the
pipeline regardless of backend.

| Stage | Prompt | Purpose |
|-------|--------|---------|
| 1 · Research | `system_prompt_01.md` | Evidence-based account intelligence + one credible automation angle |
| 2 · Review | `system_prompt_02.md` | Score the angle and shape the outreach into a concise email direction |
| 3 · Final email | `system_prompt_03.md` | Produce the final, ready-to-send cold email (output only) |

Every stage's output is saved as markdown under `docs/output/<date>/<company>/`, logged to a
Google Sheets tracker, and stage 3 becomes a **Gmail draft**.

### Three interchangeable execution modes

All modes run the **same workflow and the same prompts** — they differ only in how the AI is
called. Each worker exposes the identical HTTP contract (`/health`, `/session-check`, `/new-chat`,
`/run-stage`) on port `8787`, so point `Config.grok_worker_url` at whichever one you run.

| Mode | Command | File | Notes |
|------|---------|------|-------|
| **Browser – ChatGPT** ✅ verified | `npm run start:chatgpt` | `automation/chatgpt_worker.js` | Drives chatgpts.site. Free; needs a logged-in session + "high" mode. |
| **Browser – Grok** | `npm start` | `automation/grok_worker.js` | Drives grok2.testingg.in. Free. |
| **API** (Grok / OpenAI) | `npm run start:api` | `automation/api_worker.js` | OpenAI-compatible; needs a key in `automation/.env`. Most reliable. |

Browser modes cost $0 but break when a site's HTML changes (see
[docs/MAINTAINING_SELECTORS.md](docs/MAINTAINING_SELECTORS.md)). API mode costs a little but never
breaks on UI changes and adds **live web search** on the research stage (xAI Live Search;
OpenAI best-effort with a search-capable model).

---

## Repository map

```
ai-lead-generation-pipeline-agnel/
├── README.md                      # Overview + quick start
├── SETUP.md                       # Full setup (all modes, Google auth, batch behavior)
├── claude.md                      # This project brief
├── system_prompt_01/02/03.md      # The 3 stage prompts (research / review / final email)
├── leads.csv                      # Your lead list (gitignored)
├── automation/
│   ├── chatgpt_worker.js          # Browser worker → chatgpts.site (verified)
│   ├── grok_worker.js             # Browser worker → grok2.testingg.in
│   ├── api_worker.js              # API worker → OpenAI-compatible endpoint (Grok/OpenAI)
│   ├── worker_shared.js           # Shared pure helpers (prompt build, markdown save)
│   ├── inspect_dom.js             # Selector inspector for browser modes
│   ├── .env.example               # All env vars (copy to .env)
│   └── package.json
├── docs/
│   ├── CUSTOMIZATION.md           # How to adapt the pipeline to your needs
│   ├── USE_CASES.md               # Where this pipeline applies (MECE scenarios)
│   ├── PORTFOLIO.md               # Portfolio case study
│   ├── MAINTAINING_SELECTORS.md   # Fixing browser selectors when a site changes
│   ├── PLAN_OF_ACTION.md          # Original design + failure-mode controls
│   ├── HANDOFF.md                 # Current-state runbook for resuming work
│   └── output/                    # Generated stage markdown (gitignored)
└── workflow/
    ├── lead_gen_xlsx_mode.json    # CSV batch mode (primary)
    ├── lead_gen_browser_mode.json # Apollo-driven browser variant
    └── lead_gen_pipeline.json     # Original single-node demo
```

---

## Design decisions

- **Draft-only by design.** The Gmail node only ever *creates a draft*. Cold outreach can damage
  sender reputation, so a human reviews and sends. This is the primary safety gate.
- **Provider-neutral.** The AI is abstracted behind one HTTP contract. Swap ChatGPT ↔ Grok ↔ an
  API key without touching the workflow — only the worker changes.
- **Idempotent, resumable batching.** The workflow reads the tracker sheet, skips any lead already
  `Draft_Created`, and processes the next `batch_size` fresh leads. Re-run to advance; no duplicate
  outreach. A failed lead is logged and retried on the next run rather than aborting the batch.
- **One lead at a time.** `Loop Over Items` batch size is **1** — the browser workers drive a single
  shared session, so concurrent leads would collide. (Applies to API mode too, for a clean audit trail.)
- **Full audit trail.** Every stage is saved to `docs/output/` and mirrored to Google Sheets.

## Recommended improvements

**Implemented**
- Draft-only Gmail output (manual approval gate)
- Idempotent, resume-safe batching with an honest end-of-batch summary (fails red on missing drafts)
- API mode for reliability; selector-maintenance tooling for browser modes
- Configurable personalization via the **Config** node and the three prompt files

**Ready to add**
- Error notifications (Slack / email / Telegram) on failure
- Per-run cost / token logging
- Surfacing `Failed` leads more prominently in the tracker
- Lead-quality pre-filter (e.g. only Founder / CEO / Owner titles) before the AI step
- Schedule Trigger for hands-off daily runs

See **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** to adapt it and
**[docs/USE_CASES.md](docs/USE_CASES.md)** for where it applies.

---

*MIT licensed. Built and maintained by Agnel J N — https://github.com/agnel18*
