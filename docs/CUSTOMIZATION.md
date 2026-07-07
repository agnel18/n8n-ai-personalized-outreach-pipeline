# Customization Guide

How to adapt the pipeline to **your** offer, audience, and voice. This is a "change X → edit Y" map.
Most changes need **no code** — they live in the n8n **Config** node, the three **prompt files**, and
your **`leads.csv`**.

| I want to change… | Edit this |
|-------------------|-----------|
| Which AI / model | `automation/.env` (API mode) or which worker you run |
| Run settings (batch size, signature, sender) | The **Config** node in n8n |
| **Who** I contact | `leads.csv` |
| **What** the AI writes (offer, audience, tone, CTA) | `system_prompt_01/02/03.md` |
| Attachments | `assets/attachments/` |
| Draft vs. send, web search, output location | See §5–§7 below |

---

## 1. Choose your AI backend & model

Start the worker you want, then set `Config.ai_provider` (`chatgpt` | `grok` | `api`) to match — no
other workflow change is needed. Each worker has its own default port (chatgpt `8787`, grok `8788`,
api `8789`), so they can run side by side.

- **Browser modes:** run `npm run start:chatgpt` (ChatGPT) or `npm start` (Grok) and log in.
- **API mode:** edit `automation/.env` (copy from `.env.example`):

  ```ini
  # OpenAI
  API_BASE_URL=https://api.openai.com/v1
  API_KEY=sk-...
  MODEL=gpt-4o                 # or gpt-4o-mini (cheaper), gpt-4o-search-preview (web search), etc.
  API_PROVIDER=openai
  ENABLE_WEB_SEARCH=false      # true only on a search-capable model

  # — or — xAI Grok
  # API_BASE_URL=https://api.x.ai/v1
  # API_KEY=xai-...
  # MODEL=grok-4.3
  # API_PROVIDER=xai
  # ENABLE_WEB_SEARCH=true     # xAI Live Search (research stage only)
  ```

  Any OpenAI-compatible endpoint works — set `API_PROVIDER=generic` for providers without a standard
  web-search parameter. Restart the worker after editing `.env`.

**Cost vs. quality knobs:** a smaller model (`gpt-4o-mini`) is cheaper for the research/review stages;
`ENABLE_WEB_SEARCH` trades cost/latency for grounded research. Timeout is `API_TIMEOUT_MS`.

---

## 2. Tune the run without code — the Config node

Open the **Config** node (first node in `workflow/lead_gen_xlsx_mode.json`). Edit values live in the
n8n UI — no restart:

| Field | What it does |
|-------|--------------|
| `batch_size` | How many fresh leads to attempt per run. Start small (1–5). |
| `email_signature` | Plain-text signature appended to every draft. |
| `sender_name` | Your name, used in the email. |
| `ai_provider` | Which worker to call: `chatgpt` \| `grok` \| `api`. The workflow maps each to its `*_worker_url` (ports 8787/8788/8789). |
| `sheet_id` | Your tracker spreadsheet ID. |
| `lead_csv_path` | `/home/node/.n8n-files/leads.csv`. |
| `attachment_dir` | Folder scanned for attachments (`/home/node/.n8n-files/assets/attachments`). |
| `paused` | `true` = soft no-op run (useful to stage a change safely). |

---

## 3. Change WHO you target — `leads.csv`

Swap in your own list at the repo root as `leads.csv` (mounted into n8n at
`/home/node/.n8n-files/leads.csv`). The pipeline consumes these columns per lead — the more context
you provide, the better the research stage performs:

- **Core:** `fullName`, `email`, `position`, `organizationName`
- **Rich context (recommended):** `organizationWebsite`, `organizationIndustry`, `organizationSize`,
  `organizationDescription`, `organizationSpecialities`, `city`/`country`, `linkedinUrl`,
  `organizationLinkedinUrl`, `seniority`, `functional`

Mapping a different export? Rename its columns to match the names above (an Apollo.io or Apify export
is already close). Then make sure your **tracker sheet header row** contains the same columns plus the
pipeline columns — see [SETUP.md §4](../SETUP.md).

---

## 4. Change WHAT the AI writes — the three prompts

This is where you make the outreach *yours*. Each stage is a separate file in the repo root; the
worker reads the file **fresh on every run**, so edits apply on the next run **without restarting the
worker**.

| File | Stage | What to change here |
|------|-------|---------------------|
| `system_prompt_01.md` | Research | Your **ideal customer profile** (industries, company size, region) and what "a good angle" means for your service. |
| `system_prompt_02.md` | Review / strategy | Your **offer / value proposition**, the **commercial intent**, and how the email should be scored/shaped. |
| `system_prompt_03.md` | Final email | **Tone / voice**, length, structure, and the **call to action** (e.g. a reply, a short call, a link). |

The default prompts target **B2B distributors / manufacturers / FMCG brands** and pitch **freelance
workflow-automation services**. To repurpose:

1. **Audience** → edit the ROLE / ICP language in `system_prompt_01.md`.
2. **Offer** → edit the "commercial intent" and value proposition in `system_prompt_02.md`.
3. **Voice & CTA** → edit the drafting rules in `system_prompt_03.md`.

Keep the claim-discipline rules (Fact / Strong Inference / Operating Hypothesis) unless you have a
reason not to — they're what keep the emails credible and low-hallucination.

> Tip: change one prompt at a time and re-run a **single lead** (SETUP.md §9) to see the effect before
> a batch.

---

## 5. Attachments

Drop any files into `assets/attachments/`. Every file there is attached to each draft; an empty folder
means no attachment and the draft is still created. Controlled by `Config.attachment_dir`. See
`assets/README.md`.

---

## 6. Draft-only vs. sending

By design the Gmail node **only creates a draft** — a human reviews and sends. This protects your
sender reputation and is the recommended default. If you ever want to auto-send (not recommended for
cold outreach), change the **Create Gmail Draft** node's operation from *create draft* to *send*, and
add a real approval gate first (e.g. only send rows a human marked `Approved` in the tracker).

---

## 7. Web search & output location

- **Web search** (API mode) runs on the **research stage only**. Toggle `ENABLE_WEB_SEARCH` in `.env`;
  it's fully supported on xAI Grok and best-effort on a search-capable OpenAI model.
- **Output location** defaults to `docs/output/<date>/<company>/`. Override with `OUTPUT_ROOT` (and
  `REPO_ROOT` for where the prompt files live) in the worker's environment.

---

*See [USE_CASES.md](USE_CASES.md) for worked examples of repurposing the prompts for different goals.*
