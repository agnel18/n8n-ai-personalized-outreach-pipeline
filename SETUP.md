# Setup Guide — AI Lead Generation Pipeline

Get from zero to your first AI-written cold-email drafts in about 30 minutes. The AI writer can be
**ChatGPT, xAI Grok, or OpenAI**, run through a **browser session** (free) or an **API key** (paid,
most reliable). All three use the same workflow and prompts — see the mode table in
**[README.md](README.md)**.

*Built & maintained by Agnel J N ([agnel18](https://github.com/agnel18)).*

> **Pick a mode first:**
> - **Browser – ChatGPT** (`npm run start:chatgpt`) — verified, free, needs a logged-in ChatGPT session.
> - **Browser – Grok** (`npm start`) — free, needs a logged-in Grok session.
> - **API** (`npm run start:api`) — paid, robust; needs an xAI or OpenAI key. See **§7 – API worker**.
>
> Browser modes need **no** API key. Only API mode needs one.

---

## 1. Prerequisites

- **Docker Desktop** running
- **Node.js 20+** (for the worker; `node --env-file` is used for API mode)
- A **Google account** (for Gmail + Sheets OAuth)
- **One AI backend**, either:
  - a logged-in **ChatGPT** or **Grok** browser session (free modes), **or**
  - an **xAI** ([console.x.ai](https://console.x.ai)) or **OpenAI** ([platform.openai.com](https://platform.openai.com)) API key (API mode)
- A **lead list** as `leads.csv` (Apollo.io export, Apify scraper, or your own — see §5)

---

## 2. Launch n8n

Use Docker Compose so credentials persist and never need re-entry:

```bash
cp .env.example .env          # then edit .env
# Set a permanent N8N_ENCRYPTION_KEY (any long random string, e.g. `openssl rand -hex 24`).
docker compose up -d
```

Open http://localhost:5678

> **Why the encryption key matters:** pinning `N8N_ENCRYPTION_KEY` means stored credentials survive
> container/volume recreation. Without it, n8n regenerates the key on a fresh container and **every
> saved credential breaks** — the usual reason you end up re-doing OAuth again and again.
>
> A bare `docker run --rm` works too but is ephemeral; prefer Compose:
> ```bash
> docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
> ```

> **File access (n8n 2.x):** the Read File node can only read from `/home/node/.n8n-files`.
> `docker-compose.yml` mounts your CSV there as `leads.csv`, and `Config.lead_csv_path` is
> `/home/node/.n8n-files/leads.csv`. After pulling changes that touch the mounts, run
> `docker compose up -d` once (not `docker restart`) so the new mounts take effect.

---

## 3. Google credentials (one time)

You need **two** Google credentials in n8n:

| Credential | Type | Used for |
|------------|------|----------|
| **Google Sheets** | Google API (**Service Account**, recommended) or Google Sheets OAuth2 | The status tracker |
| **Gmail** | Gmail OAuth2 | Creating the draft (never sends) |

In Google Cloud Console: create/pick a project → **enable the Google Sheets API and Gmail API**.

### Google Sheets via a Service Account (recommended — no repeated OAuth)

OAuth tokens expire and force re-consent. A **Service Account** has no consent screen and no token
expiry — configure it once and the Sheets nodes just work.

1. **IAM & Admin → Service Accounts → Create** → create a **JSON key** and download it.
2. Copy the `client_email` from the JSON (looks like `name@project.iam.gserviceaccount.com`).
3. Open your tracker spreadsheet → **Share** → add that `client_email` as **Editor**.
   *(Without this share the Service Account can't see the sheet.)*
4. In n8n: **Credentials → Add → Google API** → Authentication = **Service Account** → paste the JSON.
5. Assign this credential to the workflow's Google Sheets nodes.

### Gmail via OAuth2

Personal Gmail can't use a Service Account (that needs Workspace domain-wide delegation), so the
**Create Gmail Draft** node uses **Gmail OAuth2**. It's a single one-time auth and it only ever
creates drafts — it never sends. Create the OAuth 2.0 Client ID (Desktop app) in Google Cloud
Console, download the JSON, and add it as a **Gmail OAuth2** credential in n8n.

---

## 4. Create the tracker spreadsheet

Create a Google Sheet (any name, e.g. **`Lead Tracker`**). **Row 1 must contain the exact header
names below (all lowercase).** The workflow keys on **`email`** and detects completion via
**`status = Draft_Created`**; the rest are the audit trail.

The header row is your **`leads.csv` columns** followed by the **pipeline columns**. The simplest
reliable way: paste your `leads.csv` header row into A1, then append the pipeline columns after it.

**Lead columns (from `leads.csv`):**
```
fullName  firstName  lastName  email  all_emails  phone_numbers  position  linkedinUrl
city  state  country  seniority  functional  organizationName  organizationWebsite
organizationLinkedinUrl  organizationFoundedYear  organizationIndustry  organizationSize
organizationDescription  organizationSpecialities  organizationCity  organizationState
organizationCountry  source
```

**Pipeline columns (append these):**
```
operator_action  status  updated_at  run_id  grok_worker_url  lead  idempotency_key
stage1  previous_output  stage2  stage3  id  message
```

> If you see **"No columns found"**, the header row is missing or misspelled. Header names are
> case-sensitive — they must be lowercase, matching the list above.

---

## 5. Prepare your lead list (`leads.csv`)

Any CSV with the lead columns from §4 works — an **Apollo.io** export, an **Apify** scraper output,
or your own list. The pipeline consumes `fullName`, `position`, `organizationName`, `email`, plus the
rich `organization*` context fields. Put the file at the repo root as `leads.csv`; Docker Compose
mounts it into n8n at `/home/node/.n8n-files/leads.csv`.

> No Apollo API call is required for the primary (CSV batch) workflow — the list is read straight
> from the file. (An Apollo-driven variant, `workflow/lead_gen_browser_mode.json`, exists if you want
> live persona search; see §8.)

---

## 6. Import the workflow & set the Config node

Import **`workflow/lead_gen_xlsx_mode.json`** (the primary CSV batch workflow). Then open the
**Config** node (first node) and set:

| Field | Value |
|-------|-------|
| `grok_worker_url` | `http://host.docker.internal:8787` (how n8n reaches the worker on your host) |
| `sheet_id` | Your tracker spreadsheet ID — the `<id>` in `https://docs.google.com/spreadsheets/d/<id>/edit` |
| `lead_csv_path` | `/home/node/.n8n-files/leads.csv` |
| `batch_size` | How many fresh leads to attempt per run (start with **1–5**; see §9) |
| `email_signature` | Plain-text signature appended to each draft |
| `sender_name` | Your name |
| `attachment_dir` | `/home/node/.n8n-files/assets/attachments` (optional attachments) |
| `paused` | `false` (set `true` for a soft no-op run) |

Assign your Google Sheets + Gmail credentials to the relevant nodes.

> The field is named `grok_worker_url` for historical reasons — it points at **whichever** worker you
> run (ChatGPT, Grok, or API), all on port `8787`.

---

## 7. Start a worker

Run exactly **one** worker (they all share port `8787`). Point `Config.grok_worker_url` at it.

### 7a. Browser – ChatGPT (verified, free)

```bash
cd automation
npm install
npm run start:chatgpt
```

A visible browser opens. **Log in to ChatGPT, set "high" mode, and keep a chat open.** The worker
handles the mirror's quirks automatically: prompts are sent with **Enter**, the "Too many requests"
dialog is dismissed via its **"Got it"** button, and completion is detected when the streaming
**"Stop answering"** button disappears and the reply text stabilizes.

> Set "high" mode **manually once** — the persistent `.chatgpt-profile` remembers it. (The worker no
> longer auto-toggles it, because clicking the model dropdown was stealing focus from the editor.)

Env knobs: `CHATGPT_URL`, `WORKER_PORT`, `CHATGPT_STABLE_MS`, `CHATGPT_MIN_DELAY_MS` /
`CHATGPT_MAX_DELAY_MS` (older `GROK_MIN/MAX_DELAY_MS` still work as fallbacks). See §7c if capture
ever breaks.

### 7b. API worker (most reliable — xAI Grok or OpenAI)

The API worker is a **drop-in** replacement: same endpoints, same port, so the workflow is unchanged.
It makes one OpenAI-compatible API call per stage — no browser, no selectors, no login.

```bash
cd automation
npm install
cp .env.example .env       # then edit .env (see below)
npm run start:api          # or: node --env-file=.env api_worker.js
```

Edit `automation/.env`:

```ini
# OpenAI
API_BASE_URL=https://api.openai.com/v1
API_KEY=sk-your-key-here
MODEL=gpt-4o
API_PROVIDER=openai
ENABLE_WEB_SEARCH=false     # gpt-4o isn't a search model; see note below

# — or — xAI Grok
# API_BASE_URL=https://api.x.ai/v1
# API_KEY=xai-your-key-here
# MODEL=grok-4.3
# API_PROVIDER=xai
# ENABLE_WEB_SEARCH=true
```

Confirm it's up: `curl http://localhost:8787/health` → expect `"ready": true`.

> **Web search** is applied to the **research** stage only (stages 2–3 work off prior output).
> Fully supported on **xAI Grok** (Live Search). On **OpenAI** it's best-effort — it needs a
> search-capable model (e.g. a `*-search-preview`); a plain `gpt-4o` will reject the search option,
> so keep `ENABLE_WEB_SEARCH=false` unless you use a search model.

### 7c. When a browser site changes: fixing selectors

Browser modes depend on the target site's HTML, which can change without notice. When capture breaks
(worker hangs, empty replies, or wrong text), **re-discover the current elements** instead of guessing:

```bash
cd automation
node inspect_dom.js              # snapshot input + buttons + message containers
SEND_TEST=1 node inspect_dom.js  # also send a probe and watch streaming → done
```

Update the `SELECTORS` block in `chatgpt_worker.js` (input box, "Stop answering" button, "Copy
response" button, assistant message container), preferring stable attributes (`id`, `aria-label`,
`data-*`). Full walkthrough and the hard-won gotchas (e.g. **never press Escape during generation —
it cancels the reply**) are in **[docs/MAINTAINING_SELECTORS.md](docs/MAINTAINING_SELECTORS.md)**.
If a site changes too often, switch to **API mode (§7b)** — it never breaks on UI changes.

---

## 8. Batch behavior (how runs and resumes work)

Each run processes up to **`batch_size`** leads, then stops. Selection is **status-based and
resume-safe**: the workflow reads the tracker sheet, skips every lead already `Draft_Created`,
dedupes by email, and takes the next N unprocessed leads. A **Loop Over Items** node then runs each
lead through the full 3-stage pipeline **sequentially**.

> **⚠️ Set `Loop Over Items` → Batch Size = `1`.** The workers drive a **single** shared session, so
> two leads in flight at once collide (they submit into the same chat and capture each other's
> replies → *"1 drafted, 0 failed (of 2 leads)"*). Batch size **1** = one lead fully finishes before
> the next starts. (`Config.batch_size` is different — that's how many leads to *attempt* this run.)

- **"Only a few leads processed?"** That's the throttle working. `leads.csv` can hold hundreds of
  leads; `Config.batch_size` caps how many run per execution, and already-drafted leads are skipped.
  Re-run to advance, or raise `batch_size` — but budget time (each lead is 3 stages).
- **Resume** is automatic — run again and it continues with the next unprocessed leads; no duplicates.
- **Pause** — click **Stop** in n8n (everything already drafted is saved), or set `Config.paused = true`.
- **Fresh context per lead** — the worker starts a new chat (`/new-chat`) so one company's research
  doesn't bleed into the next (no-op in API mode, which is stateless).
- **Resilience** — a failed lead is logged `Failed` and the batch continues; failed leads retry next run.
- **Honest summary** — an end-of-batch check fails the run **red** with "N drafted, M failed" if any
  draft is missing, so you never get a false green.
- **Attachments (optional)** — drop files into `assets/attachments/`; each is attached to every draft.
  Empty folder = no attachment and the draft is still created. See `assets/README.md`.

> **Scaling caution (browser modes):** `batch_size = 24` means ~72 messages + 24 new chats in one run
> on the browser mirror — likely to trip login/upgrade/captcha walls. **Start with `batch_size` 5–10**,
> keep the per-prompt delays, and scale up slowly. API mode has no such limit beyond your rate limits.

### Apollo-driven browser variant (optional)

`workflow/lead_gen_browser_mode.json` pulls Apollo leads by persona + country filter instead of
reading a CSV, then runs the same 3 stages one company per run. Set `APOLLO_API_KEY`,
`APOLLO_PERSONA_IDS`, `APOLLO_COUNTRY`, and `GROK_WORKER_URL` in your environment before running.
Most users should prefer the CSV workflow above.

---

## 9. First test run (single lead, end-to-end)

Prove the whole path works on **one** lead before scaling:

1. Start your chosen worker (§7) and confirm it's ready
   (browser: logged in + "high" mode; API: `curl /health` → `"ready": true`).
2. In the **Config** node set **`batch_size = 1`**, and in **Loop Over Items** set **Batch Size = 1**.
3. Confirm `grok_worker_url`, `sheet_id`, Gmail + Sheets credentials are set.
4. **Execute workflow.**
5. Verify the results:
   - `docs/output/<date>/<company>/` has **3 markdown files** (Research, Review, Final_Email).
   - The tracker sheet has **one row** with `status = Draft_Created`.
   - Your **Gmail Drafts** folder has **one** new draft (never sent).
   - The run finishes **green** (the batch-summary check passed).

Once that's clean, raise `batch_size` and run again to advance through the list.

---

## 10. Customization & production

- **Adapt it to your offer, audience, and voice** — see **[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)**
  (edit the Config node, the three prompt files, and `leads.csv`).
- **Where this pipeline fits** — see **[docs/USE_CASES.md](docs/USE_CASES.md)**.
- **Production tips** — add a Schedule Trigger for daily runs, add an error workflow + notification,
  monitor your API usage, and keep the Google Sheet as the source of truth for status.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| n8n "No columns found" on a Sheets node | Header row missing/misspelled — must match the lowercase names in §4 |
| Google Sheets 404 | Wrong `sheet_id` in Config. (403 instead = share the sheet with the Service Account) |
| API mode not working | Confirm `API_BASE_URL` + `MODEL` match your provider and `API_KEY` is set (`curl /health`) |
| API error mentioning `web_search` | Using search on a non-search OpenAI model — set `ENABLE_WEB_SEARCH=false` or use a `*-search-preview` model |
| Browser worker hangs / empty replies | The site's DOM changed — run `inspect_dom.js` and update selectors (§7c) |
| "1 drafted, 0 failed (of 2 leads)" | Set `Loop Over Items` → Batch Size = **1** (workers are single-session) |
| No Gmail draft created | Check the Gmail OAuth2 credential + scopes; drafts only, never sent |
| Only a few leads processed | Batch throttle — raise `Config.batch_size` or re-run (§8) |
| Credentials keep breaking on restart | Set a permanent `N8N_ENCRYPTION_KEY` and use `docker compose up -d` (§2) |

---

*Built by Agnel J N — https://github.com/agnel18. Happy automating.*
