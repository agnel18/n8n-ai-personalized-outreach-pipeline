# 🤖 AI Lead Generation Pipeline

> Automated B2B outreach pipeline built with **n8n**, an **AI writer of your choice** (ChatGPT / xAI Grok — browser or API), a **Google Sheets lead list**, and **Gmail**

![n8n](https://img.shields.io/badge/n8n-Automation-orange)
![AI](https://img.shields.io/badge/AI-ChatGPT%20%7C%20Grok%20%7C%20OpenAI-black)
![Leads](https://img.shields.io/badge/Leads-Google%20Sheets-purple)
![Gmail](https://img.shields.io/badge/Gmail-Drafts-red)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Tracker-green)

**Built by Agnel J N (agnel18)**

> 👉 **New here / not a coder?** Start with **[GETTING_STARTED.md](GETTING_STARTED.md)** — a from-scratch,
> copy-paste walkthrough that gets you to your first email drafts in ~30 minutes.

---

# 🎥 Demo

[![Watch the demo](https://img.youtube.com/vi/40CX6arPbSM/maxresdefault.jpg)](https://youtu.be/40CX6arPbSM)

> 📺 **Watch the complete walkthrough on YouTube**
>
> https://youtu.be/40CX6arPbSM

This demo covers:

- Complete n8n workflow
- Google Sheets lead tracking
- AI research pipeline
- Automated Gmail draft creation
- ChatGPT / Grok browser workers
- API mode
- End-to-end execution

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
the AI is called. A small local "worker" (Node/Express) does the AI step; the n8n workflow
talks to it over HTTP. Pick the worker in the workflow's **Config** node via `ai_provider`
(`chatgpt` | `grok` | `api`) — each worker has its own default port, so you just start the
matching one.

| Mode | `ai_provider` | Command | Port | Cost | Web-grounded research | Reliability | Best for |
|------|---------------|---------|------|------|-----------------------|-------------|----------|
| **Browser – ChatGPT** ✅ verified | `chatgpt` | `npm run start:chatgpt` | `8787` | Free (uses a ChatGPT session) | ✅ high-mode web search | Fragile — depends on site DOM | No API budget |
| **Browser – Grok** | `grok` | `npm start` | `8788` | Free (uses a Grok session) | ✅ | Fragile — depends on site DOM | Grok fans, no API budget |
| **API** (Grok / OpenAI) | `api` | `npm run start:api` | `8789` | Paid API usage | ✅ (xAI Live Search; OpenAI best-effort) | Robust — stable API contract | Anyone with an API key |

Browser modes are $0 but break when the site's HTML changes — see
[docs/MAINTAINING_SELECTORS.md](docs/MAINTAINING_SELECTORS.md). API mode costs a little but
never breaks on UI changes.

---

## 🛠️ Tech Stack

- **Automation:** n8n (Docker, `localhost:5678`)
- **AI writer:** ChatGPT or **xAI Grok 4.3** — browser session *or* OpenAI-compatible API (`api.x.ai/v1` or `api.openai.com/v1`)
- **Lead source:** paste an Apollo.io export or any scraped list (e.g. Apify `leads-scraper`) into the spreadsheet's **`Leads`** tab
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
│   ├── chatgpt_worker.js         # Browser worker → https://chatgpt.com/
│   ├── grok_worker.js            # Browser worker → https://grok.com/
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
    └── lead_gen_xlsx_mode.json   # CSV/XLSX batch mode — the one workflow
```

---

## 🚀 Quick Start (sheet batch mode)

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
Import `workflow/lead_gen_xlsx_mode.json`, connect Gmail + Google Sheets, set
`Config.ai_provider` to the worker you started (`chatgpt` | `grok` | `api`), put your
spreadsheet ID in **`Config.sheet_id`** (set once — all 8 Sheets nodes read it from Config), and
paste your leads into the spreadsheet's **`Leads`** tab. To bind both credentials to every node without opening each one,
see [SETUP → *Assign a credential to every node at once*](SETUP.md#assign-a-credential-to-every-node-at-once).
Full steps — including API keys and Google OAuth — are in **[SETUP.md](SETUP.md)**.

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
| **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)** | Adapt it to your offer, audience, and voice — Config node, the 3 prompts, the `Leads` tab |
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
