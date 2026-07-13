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
- A **lead list** to paste into the spreadsheet's **`Leads`** tab (Apollo.io export, Apify scraper, or your own — see §5)

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

> **File access (n8n 2.x):** the only host mount the workflow still needs is `./assets`
> (email attachments), mapped read-only to `/home/node/.n8n-files/assets`. Leads no longer
> come from a mounted file — they live in the spreadsheet's `Leads` tab. After pulling changes
> that touch the mounts, run `docker compose up -d --force-recreate n8n` once (not
> `docker restart`) so the removed CSV mount actually takes effect.

---

## 3. Google credentials (one time)

You need **two** Google credentials in n8n:

| Credential | Type | Used for |
|------------|------|----------|
| **Google Sheets** | Google API (**Service Account**, recommended) or Google Sheets OAuth2 | The status tracker |
| **Gmail** | Gmail OAuth2 | Creating the draft (never sends) |

In Google Cloud Console: create/pick a project → **enable the Google Sheets API and Gmail API**.

> **Where you enter credentials in n8n.** You don't type keys into the nodes — you create each
> credential **once** and nodes reference it. Two equivalent ways to open the credential form:
> - **Central:** left sidebar → **Overview → Credentials** tab → **Add credential** (top-right).
> - **In a node:** open any Gmail/Sheets node → **"Credential to connect with"** dropdown →
>   **"+ Create new credential"**.
> Both open the same modal. Create the two credentials below, then bind them to every node using
> *Assign a credential to every node at once* (further down).

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
creates drafts — it never sends.

#### Step-by-step: create the OAuth client in Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and select your project.
2. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
3. **Application type** — select **Web application** (not Desktop, not iOS/Android).
4. Give it any name (e.g. `n8n Gmail`).
5. Under **Authorized redirect URIs** click **+ Add URI** and paste exactly:
   ```
   http://localhost:5678/rest/oauth2-credential/callback
   ```
6. Click **Create**. A popup shows your **Client ID** and **Client Secret** — copy both.

> **OAuth consent screen (if prompted):** choose **External**, fill in App name + your email, and
> under *Test users* add the Gmail address you'll be drafting from. While the app is in
> **Testing** mode only listed test users can authorise — skip this and you'll get a 403 or
> "Access blocked" screen during the n8n Connect step.

#### Step-by-step: add the credential in n8n

1. In n8n left sidebar → **Overview → Credentials → Add credential → Gmail OAuth2**.
2. Paste the **Client ID** and **Client Secret** you copied above.
3. Click **Connect** — a Google consent screen opens in a new tab.
4. Select your Gmail account, grant access, and close the tab.
5. **Save** the credential. This one credential serves **both** Gmail nodes.

#### Troubleshooting Gmail OAuth2 errors

| Error | Cause | Fix |
|-------|-------|-----|
| **401 invalid_client** | Wrong application type or miscopied credentials | Re-check: application type must be **Web application**; re-copy Client ID + Secret with no trailing spaces |
| **401 invalid_client** | Redirect URI not registered | In Google Cloud Console open the OAuth client → *Authorized redirect URIs* → confirm `http://localhost:5678/rest/oauth2-credential/callback` is listed exactly (no trailing slash) |
| **403 / "Access blocked"** | Gmail account not added as a test user | APIs & Services → OAuth consent screen → *Test users* → add your Gmail address |
| **redirect_uri_mismatch** | URI in Google doesn't match what n8n sent | Delete the URI and re-add it by copy-pasting from step 5 above — no extra characters |
| **Consent screen loops / hangs** | Pop-up blocked by browser | Allow pop-ups for `localhost:5678` and retry **Connect** |

### Assign a credential to every node at once (no per-node clicking)

The workflow has **8** Google Sheets nodes and **2** Gmail nodes, but only **two** credentials.
You create each credential **once** — including OAuth fields like **Client ID** and **Client Secret**
for Gmail OAuth2. After that, nodes do not store those secrets; they only reference the credential
**by its ID**. In this workflow, all Sheets nodes share one placeholder ID
(`REPLACE_WITH_GOOGLE_SHEETS_CRED_ID`), and both Gmail nodes share another
(`REPLACE_WITH_GMAIL_CRED_ID`). So bind them all in one shot:

1. Create both credentials (above) and **Save** each.
2. Open each saved credential and copy its **ID** from the browser URL (`…/credentials/`**`<ID>`**).
3. In `workflow/lead_gen_xlsx_mode.json`, **find-replace** (once each):
   `REPLACE_WITH_GOOGLE_SHEETS_CRED_ID` → your Sheets credential ID, and
   `REPLACE_WITH_GMAIL_CRED_ID` → your Gmail credential ID.
4. **Then import** the edited JSON. Every node is already bound — no per-node Client ID/Secret entry.

> Prefer not to edit JSON? Import first, then pick the credential from the dropdown in each node.
> It's the same result, just slower (9 nodes). The find-replace above is the shortcut.

---

## 4. Create the spreadsheet (two tabs)

Create **one** Google Sheet (any name, e.g. **`Lead Tracker`**) with **two tabs**. One `sheet_id`,
one credential — you just paste leads into one tab and read results from the other. **Header names
are case-sensitive and must be lowercase**, exactly as listed.

**Tab `Leads`** — you own this one. Row 1 = the 25 lead columns. Paste your leads beneath and leave
the rest to the workflow. The header is identical to [`leads.sample.csv`](leads.sample.csv), so the
easiest path is to open that file and paste its header row into `Leads!A1`:
```
fullName  firstName  lastName  email  all_emails  phone_numbers  position  linkedinUrl
city  state  country  seniority  functional  organizationName  organizationWebsite
organizationLinkedinUrl  organizationFoundedYear  organizationIndustry  organizationSize
organizationDescription  organizationSpecialities  organizationCity  organizationState
organizationCountry  source
```

**Tab `Tracker`** — the workflow owns this one; you rarely edit it. Row 1 = the same 25 lead columns
**plus** the pipeline columns:
```
operator_action  status  updated_at  run_id  grok_worker_url  lead  idempotency_key
stage1  previous_output  stage2  stage3  id  message  attempts
```

The workflow keys on **`email`**, treats a lead as done when its `status` is terminal
(**`Draft_Created`**, or an operator-set `Skip` / `Do_Not_Contact` / `Unsubscribed`), and also
dedupes on **`linkedinUrl`** so a re-scrape that returns the same person under a new email is not
contacted twice. `Failed` leads retry until `attempts` reaches `max_attempts` (default 3).

> If you see **"No columns found"**, the header row is missing or misspelled. Header names are
> case-sensitive — they must be lowercase, matching the lists above.

---

## 5. Where to get leads

Any source that gives you the §4 lead columns works — an **Apollo.io** export, an **Apify** scraper
output (e.g. `leads-scraper`), or your own list. The pipeline consumes `fullName`, `position`,
`organizationName`, `email`, plus the rich `organization*` context fields. Copy those columns and
**paste them under the header in the `Leads` tab** — no file, no mount, no Apollo API call.

> **Re-scraping is safe.** Scrapers like Apify duplicate people across runs and sometimes return a
> different (guessed) email for the same person. Paste freely — dedup happens at selection time on
> both `email` and `linkedinUrl`, so already-drafted people are skipped. To keep the tab tidy, run
> **Data → Data cleanup → Remove duplicates** on `Leads` occasionally.

---

## 6. Import the workflow & set the Config node

Import **`workflow/lead_gen_xlsx_mode.json`** (the one workflow). Then open the
**Config** node (first node) and set:

| Field | Value |
|-------|-------|
| `ai_provider` | Which worker to call: `chatgpt` \| `grok` \| `api` (start the matching worker in §7) |
| `chatgpt_worker_url` | `http://host.docker.internal:8787` (default; edit only if you changed the port) |
| `grok_worker_url` | `http://host.docker.internal:8788` |
| `api_worker_url` | `http://host.docker.internal:8789` |
| `sheet_id` | Your spreadsheet ID — the `<id>` in `https://docs.google.com/spreadsheets/d/<id>/edit`. Set it **once here**; all 8 Sheets nodes read it from Config. |
| `leads_tab` | Tab holding your pasted leads (default **`Leads`**) |
| `tracker_tab` | Tab the workflow writes results to (default **`Tracker`**) |
| `batch_size` | How many fresh leads to attempt per run (start with **1–5**; see §9) |
| `max_attempts` | Stop retrying a `Failed` lead after this many tries (default **3**) |
| `email_signature` | Plain-text signature appended to each draft |
| `sender_name` | Your name |
| `attachment_dir` | `/home/node/.n8n-files/assets/attachments` (optional attachments) |
| `paused` | `false` (set `true` for a soft no-op run) |

Credentials bind to every node in one step if you did the find-replace in
[§3 → *Assign a credential to every node at once*](#assign-a-credential-to-every-node-at-once)
before importing. Otherwise, pick your Google Sheets + Gmail credentials from the dropdown in each node.

> `ai_provider` picks which of the three `*_worker_url` fields the workflow calls. Each worker has
> its own default port, so you only ever change `ai_provider` — the URLs stay as above.
>
> **Sheet ID:** you no longer edit it per node — all 8 Sheets nodes read `Config.sheet_id`, and the
> tab names come from `Config.leads_tab` / `Config.tracker_tab`. Set them once above. (No find-replace
> needed for the sheet ID; that's only for the two credential IDs in §3.)

---

## 7. Start a worker

Start the worker that matches `Config.ai_provider`. Each worker has its own default port
(chatgpt `8787`, grok `8788`, api `8789`), so you can run more than one at a time if you like.

### 7a. Browser – ChatGPT (verified, free)

```bash
cd automation
npm install
npm run start:chatgpt
```

A visible browser opens. **Log in to ChatGPT, set "high" mode, and keep a chat open.** The worker
handles site quirks automatically: prompts are sent with **Enter**, the "Too many requests"
dialog is dismissed via its **"Got it"** button, and completion is detected when the streaming
**"Stop answering"** button disappears and the reply text stabilizes.

> Set "high" mode **manually once** — the persistent `.chatgpt-profile` remembers it. (The worker no
> longer auto-toggles it, because clicking the model dropdown was stealing focus from the editor.)

Env knobs: `CHATGPT_URL`, `WORKER_PORT`, `CHATGPT_STABLE_MS`, `CHATGPT_MIN_DELAY_MS` /
`CHATGPT_MAX_DELAY_MS` (older `GROK_MIN/MAX_DELAY_MS` still work as fallbacks). See §7c if capture
ever breaks.

### 7b. API worker (most reliable — xAI Grok or OpenAI)

The API worker is a **drop-in** replacement: same endpoints, so the workflow is unchanged (just
set `Config.ai_provider = api`). It makes one OpenAI-compatible API call per stage — no browser,
no selectors, no login.

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

Confirm it's up: `curl http://localhost:8789/health` → expect `"ready": true`.

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
resume-safe**: the workflow reads the `Leads` tab and the `Tracker` tab, skips every lead that is
terminal (`Draft_Created` / `Skip` / `Do_Not_Contact` / `Unsubscribed`) or a duplicate (by `email`
or `linkedinUrl`), retries `Failed` leads until `max_attempts`, and takes the next N. A **Loop Over Items** node then runs each
lead through the full 3-stage pipeline **sequentially**.

> **⚠️ Set `Loop Over Items` → Batch Size = `1`.** The workers drive a **single** shared session, so
> two leads in flight at once collide (they submit into the same chat and capture each other's
> replies → *"1 drafted, 0 failed (of 2 leads)"*). Batch size **1** = one lead fully finishes before
> the next starts. (`Config.batch_size` is different — that's how many leads to *attempt* this run.)

- **"Only a few leads processed?"** That's the throttle working. The `Leads` tab can hold hundreds of
  leads; `Config.batch_size` caps how many run per execution, and already-drafted leads are skipped.
  Re-run to advance, or raise `batch_size` — but budget time (each lead is 3 stages).
- **Resume** is automatic — run again and it continues with the next unprocessed leads; no duplicates.
- **Pause** — click **Stop** in n8n (everything already drafted is saved), or set `Config.paused = true`.
- **Fresh context per lead** — the worker starts a new chat (`/new-chat`) so one company's research
  doesn't bleed into the next (no-op in API mode, which is stateless).
- **Resilience** — a failed lead is logged `Failed` (with its lead details preserved) and the batch
  continues; `Failed` leads retry on later runs until `attempts` reaches `max_attempts`, then they're
  left alone so a permanently-bad lead can't hog a batch slot. Clear a row's `status` to retry it manually.
- **Honest summary** — an end-of-batch check fails the run **red** with "N drafted, M failed" if any
  draft is missing, so you never get a false green.
- **Attachments (optional)** — drop files into `assets/attachments/`; each is attached to every draft.
  Empty folder = no attachment and the draft is still created. See `assets/README.md`.

> **Scaling caution (browser modes):** `batch_size = 24` means ~72 messages + 24 new chats in one run
> on browser UI mode — likely to trip login/upgrade/captcha walls. **Start with `batch_size` 5–10**,
> keep the per-prompt delays, and scale up slowly. API mode has no such limit beyond your rate limits.

---

## 9. First test run (single lead, end-to-end)

Prove the whole path works on **one** lead before scaling:

1. Start your chosen worker (§7) and confirm it's ready
   (browser: logged in + "high" mode; API: `curl /health` → `"ready": true`).
2. In the **Config** node set **`batch_size = 1`**, and in **Loop Over Items** set **Batch Size = 1**.
3. Confirm `ai_provider` (matches the worker you started), `sheet_id`, Gmail + Sheets credentials are set.
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
  (edit the Config node, the three prompt files, and the `Leads` tab).
- **Where this pipeline fits** — see **[docs/USE_CASES.md](docs/USE_CASES.md)**.
- **Production tips** — add a Schedule Trigger for daily runs, add an error workflow + notification,
  monitor your API usage, and keep the Google Sheet as the source of truth for status.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| n8n "No columns found" on a Sheets node | Header row missing/misspelled — must match the lowercase names in §4 |
| Google Sheets 404 | Wrong `sheet_id` in Config. (403 instead = share the sheet with the Service Account) |
| "Leads tab returned 0 rows" | The `Leads` tab is empty, or `Config.leads_tab` doesn't match the actual tab name (case-sensitive), or the credential can't read the sheet. Paste leads / fix the tab name. |
| API mode not working | Confirm `API_BASE_URL` + `MODEL` match your provider and `API_KEY` is set (`curl /health`) |
| API error mentioning `web_search` | Using search on a non-search OpenAI model — set `ENABLE_WEB_SEARCH=false` or use a `*-search-preview` model |
| Browser worker hangs / empty replies | The site's DOM changed — run `inspect_dom.js` and update selectors (§7c) |
| Session Check output shows `lead_csv_path` or no `lead` fields | You're running an older imported workflow. `Session Check` validates readiness only and echoes config; it does not include lead rows. Re-import the latest `workflow/lead_gen_xlsx_mode.json`, then verify `Read Leads Tab` and `Select Batch` outputs to confirm leads come from Google Sheets. |
| "1 drafted, 0 failed (of 2 leads)" | Set `Loop Over Items` → Batch Size = **1** (workers are single-session) |
| Gmail OAuth2 **401 invalid_client** | Wrong app type or missing redirect URI — see *Troubleshooting Gmail OAuth2 errors* in §3 |
| No Gmail draft created | Check the Gmail OAuth2 credential + scopes; drafts only, never sent |
| Only a few leads processed | Batch throttle — raise `Config.batch_size` or re-run (§8) |
| Credentials keep breaking on restart | Set a permanent `N8N_ENCRYPTION_KEY` and use `docker compose up -d` (§2) |

---

*Built by Agnel J N — https://github.com/agnel18. Happy automating.*
