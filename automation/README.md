# Pipeline Workers

Local Node/Express workers that perform the AI step for the n8n lead-gen pipeline. n8n is
the orchestrator; each worker exposes the **same HTTP contract** on port `8787`, so the
workflow is identical no matter which one you run. Point `Config.grok_worker_url` in the
workflow at the worker (`http://host.docker.internal:8787`).

## The three workers

| Script | File | What it does |
|--------|------|--------------|
| `npm run start:chatgpt` | `chatgpt_worker.js` | Headed browser → chatgpts.site (verified path) |
| `npm start` | `grok_worker.js` | Headed browser → grok2.testingg.in |
| `npm run start:api` | `api_worker.js` | OpenAI-compatible API (xAI Grok / OpenAI). No browser. |

Plus `npm run inspect` (`inspect_dom.js`) — a selector inspector for the browser modes.

## Endpoints (identical across workers)

- `GET /health` — service health + readiness.
- `POST /session-check` — readiness (browser: logged in? / API: key set?), echoes context.
- `POST /new-chat` — browser: reset the chat for a fresh lead. API: no-op (stateless).
- `POST /run-stage` — runs one stage (`research` | `review` | `final_email`), captures the
  response, saves markdown under `docs/output/`, and returns the updated `context`
  (`status`, `previous_output`, `stageN.{responseText,mdPath}`, …).

## Start

**Browser worker:**
```bash
cd automation && npm install
npm run start:chatgpt      # or: npm start  (Grok)
# A visible browser opens. Log in, set "high" mode, keep a chat open.
```

**API worker:**
```bash
cd automation && npm install
cp .env.example .env       # then edit .env: set API_KEY (and API_BASE_URL/MODEL/provider)
npm run start:api
```

## Environment variables

See **`.env.example`** for the full annotated list. Highlights:

- Shared: `WORKER_PORT` (default `8787`), `REPO_ROOT`, `OUTPUT_ROOT`.
- API worker: `API_BASE_URL`, `API_KEY`, `MODEL`, `API_PROVIDER` (`xai|openai|generic`),
  `ENABLE_WEB_SEARCH`, `API_TIMEOUT_MS`.
- Browser workers: `CHATGPT_URL`, `CHATGPT_PROFILE_DIR`, `CHATGPT_STABLE_MS`,
  `CHATGPT_MIN_DELAY_MS`/`MAX` (older `GROK_*` names still work as fallbacks); `GROK_URL`, `GROK_PROFILE_DIR`.

## Notes

- **Browser selector drift is expected.** When capture breaks, see
  [../docs/MAINTAINING_SELECTORS.md](../docs/MAINTAINING_SELECTORS.md) and run
  `npm run inspect`. The API worker never has this problem.
- Run **one lead at a time** (n8n `Loop Over Items` batch size = 1): the browser workers
  drive a single shared session and can't process leads concurrently.
- Never commit `.env` or the `.chatgpt-profile/` / `.grok-profile/` folders (all gitignored).
