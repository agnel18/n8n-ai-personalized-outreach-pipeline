# 🤖 AI Lead Generation Pipeline

> Automated B2B outreach pipeline built with **n8n**, an **AI writer of your choice** (ChatGPT / xAI Grok — browser or API), **Apollo.io / CSV**, **Gmail** and **Google Sheets**

![n8n](https://img.shields.io/badge/n8n-Automation-orange)
![AI](https://img.shields.io/badge/AI-ChatGPT%20%7C%20Grok%20%7C%20OpenAI-black)
![Apollo.io](https://img.shields.io/badge/Apollo.io-Lead%20Sourcing-purple)
![Gmail](https://img.shields.io/badge/Gmail-Drafts-red)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Tracker-green)

**Built by Agnel J N (agnel18)**

> 👉 **New here / not a coder?** Start with **[GETTING_STARTED.md](GETTING_STARTED.md)** — a from-scratch,
> copy-paste walkthrough that gets you to your first email drafts in ~30 minutes.

---

## 📌 What It Does

For each lead, the pipeline runs a **3-stage AI chain** and lands a ready-to-review email:

1. **Research** the company for automation/outreach angles (`system_prompt_01.md`)
2. **Review / strategize** the outreach from that research (`system_prompt_02.md`)
3. **Draft the final cold email** (`system_prompt_03.md`)

Every stage's output is saved as markdown under `docs/output/`, logged to a Google Sheet
tracker, and the final email is created as a **Gmail draft** (never auto-sent — you approve).

**Target:** Amazon FBA founders, eCommerce brand owners, and growth-stage entrepreneurs.

---

## 🔀 Choose your execution mode

All three modes run the **same workflow and the same prompts** — they differ only in how
the AI is called. A small local "worker" (Node/Express on port `8787`) does the AI step;
the n8n workflow talks to it over HTTP. Point `Config.grok_worker_url` at whichever worker
you run.

| Mode | Command | Cost | Web-grounded research | Reliability | Best for |
|------|---------|------|-----------------------|-------------|----------|
| **Browser – ChatGPT** ✅ verified | `npm run start:chatgpt` | Free (uses a ChatGPT session) | ✅ high-mode web search | Fragile — depends on site DOM | No API budget |
| **Browser – Grok** | `npm start` | Free (uses a Grok session) | ✅ | Fragile — depends on site DOM | Grok fans, no API budget |
| **API** (Grok / OpenAI) | `npm run start:api` | Paid API usage | ✅ (xAI Live Search; OpenAI best-effort) | Robust — stable API contract | Anyone with an API key |

Browser modes are $0 but break when the site's HTML changes — see
[docs/MAINTAINING_SELECTORS.md](docs/MAINTAINING_SELECTORS.md). API mode costs a little but
never breaks on UI changes.

---

## 🛠️ Tech Stack

- **Automation:** n8n (Docker, `localhost:5678`)
- **AI writer:** ChatGPT or **xAI Grok 4.3** — browser session *or* OpenAI-compatible API (`api.x.ai/v1` or `api.openai.com/v1`)
- **Lead source:** Apollo.io export or any scraped **CSV** (e.g. Apify `leads-scraper`)
- **Email:** Gmail (OAuth2) — **draft-only** by design
- **Tracker:** Google Sheets (status per lead, idempotent)
- **Workers:** local Node/Express (`automation/`), no build step

---

## ⚡ Key Features

- ✅ 3-stage research → strategy → email chain, one markdown artifact per stage
- ✅ Three interchangeable AI backends (ChatGPT browser / Grok browser / API) — same contract
- ✅ **Draft-only** Gmail output (human approval gate built in)
- ✅ Idempotent batch: skips leads already `Draft_Created`, resumes across runs
- ✅ Full audit trail in Google Sheets + `docs/output/`
- ✅ Selector-maintenance tooling (`inspect_dom.js`) for when browser UIs change

---

## 📁 Repository Structure

```
ai-lead-generation-pipeline-agnel/
├── README.md
├── SETUP.md
├── system_prompt_01/02/03.md     # The 3 stage prompts (research / review / email)
├── automation/
│   ├── chatgpt_worker.js         # Browser worker → chatgpts.site (verified)
│   ├── grok_worker.js            # Browser worker → grok2.testingg.in
│   ├── api_worker.js             # API worker → OpenAI-compatible endpoint (Grok/OpenAI)
│   ├── worker_shared.js          # Shared pure helpers (prompt build, markdown save)
│   ├── inspect_dom.js            # Selector inspector for browser modes
│   ├── .env.example              # All env vars (copy to .env)
│   └── package.json
├── docs/
│   ├── CUSTOMIZATION.md          # How to adapt the pipeline to your needs
│   ├── USE_CASES.md              # Where this pipeline applies (MECE scenarios)
│   ├── PLAN_OF_ACTION.md
│   ├── MAINTAINING_SELECTORS.md  # How to fix browser selectors when a site changes
│   └── output/                   # Generated stage markdown (gitignored)
└── workflow/
    ├── lead_gen_xlsx_mode.json   # CSV/XLSX batch mode (primary)
    ├── lead_gen_browser_mode.json
    └── lead_gen_pipeline.json    # Original simple demo
```

---

## 🚀 Quick Start (CSV batch mode)

### 1. Start n8n
```bash
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

### 2. Install & run a worker
```bash
cd automation
npm install
# pick ONE:
npm run start:chatgpt   # browser (ChatGPT) — log in + set "high" mode in the window
npm run start:api       # API — fill automation/.env first (see .env.example)
```

### 3. Import the workflow & set credentials
Import `workflow/lead_gen_xlsx_mode.json`, connect Gmail + Google Sheets, point
`Config.grok_worker_url` at the worker (`http://host.docker.internal:8787`), and drop your
leads into `leads.csv`. Full steps — including API keys and Google OAuth — are in
**[SETUP.md](SETUP.md)**.

### 4. Run
Set **`Loop Over Items` batch size = 1** (one lead at a time — the workers are single-session),
then **Execute workflow**. Check `docs/output/`, the tracker sheet, and your Gmail drafts.

> **"Only a few leads processed?"** That's the batch throttle: `Config.batch_size` controls
> how many fresh leads run per execution; the rest wait for the next run and are skipped once
> drafted. Raise `batch_size` to do more per run (each lead ≈ 3 slow stages). See SETUP.md → *Batch behavior*.

---

## 🧠 Recommended Improvements (Implemented or Ready)

- **Draft-only + manual approval** — emails are created as Gmail drafts, never auto-sent
- **Idempotent batching** — safe re-runs, no duplicate outreach
- **Selector maintenance guide + inspector** for browser modes
- **API mode** for reliability when browser UIs drift
- Ready to add: error notifications, per-run cost logging, surfacing failed leads in the tracker

Details in the docs above and `SETUP.md`.

---

## 📚 Documentation

| Doc | What's in it |
|-----|--------------|
| **[SETUP.md](SETUP.md)** | Full setup: all three modes, Google auth, batch behavior, first test run, troubleshooting |
| **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** | Adapt it to your offer, audience, and voice — Config node, the 3 prompts, `leads.csv` |
| **[docs/USE_CASES.md](docs/USE_CASES.md)** | Where this pipeline applies — MECE scenarios (sales, recruiting, partnerships, and more) |
| **[docs/MAINTAINING_SELECTORS.md](docs/MAINTAINING_SELECTORS.md)** | Fix browser selectors when a site's HTML changes |

---

## 👤 Built By

**Agnel J N (agnel18)** — AI Automation Engineer, building practical AI systems with n8n.
GitHub: https://github.com/agnel18

## 📄 License

MIT — Use it, improve it, make it yours.

---

**Ready to send better outreach at scale?** Clone → follow `SETUP.md` → pick a mode → go.
