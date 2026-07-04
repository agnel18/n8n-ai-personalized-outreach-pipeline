# Getting Started — from zero to your first AI email drafts

**No coding experience needed.** This guide takes you from an empty computer to five personalized cold
emails sitting in your Gmail drafts, step by step. You'll copy-paste a few commands — that's it.

- ⏱️ **Time:** ~30–40 minutes the first time (mostly installing + Google sign-in).
- 💸 **Cost:** free if you use the browser mode; a few cents per lead if you use an OpenAI/Grok API key.
- 🔒 **Safe by design:** every email is created as a **draft** — nothing is ever sent automatically.

> Prefer a video? See [docs/YOUTUBE_SCRIPT.md](docs/YOUTUBE_SCRIPT.md). Want more depth on any step?
> [SETUP.md](SETUP.md) has the full reference. To adapt it to your own offer, see
> [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md).

---

## What you'll build

For each lead in a spreadsheet, the pipeline: **researches** the company → **plans** an angle → **writes**
a personalized cold email → saves it as a **Gmail draft**, and tracks everything in a **Google Sheet**.

```
leads.csv  →  [ Research → Strategy → Email ]  →  Gmail draft  +  Google Sheet row
```

---

## Step 1 — Install two free programs

1. **Docker Desktop** — runs the automation engine (n8n) on your computer.
   Download: https://www.docker.com/products/docker-desktop/ → install → **open it** and wait until it
   says "Engine running."
2. **Node.js (version 20 or newer)** — runs the small "worker" that talks to the AI.
   Download the **LTS** version: https://nodejs.org/ → install with all defaults.

✅ **Check it worked.** Open a terminal (Windows: "PowerShell"; Mac: "Terminal") and run:
```bash
docker --version
node --version
```
You should see a version number for each. If "command not found," restart your computer and try again.

---

## Step 2 — Get the project onto your computer

**Easiest (no Git needed):** on the GitHub page, click the green **Code** button → **Download ZIP** →
unzip it. Remember the folder location.

Open a terminal **in that folder**:
- Windows: open the folder, type `cmd` in the address bar, press Enter.
- Mac: drag the folder onto the Terminal icon, or `cd ` then drag the folder in.

---

## Step 3 — Set two passwords (one-time)

The project needs two secret values. There's a template file called **`.env.example`** — make a copy of
it named **`.env`** and fill in two lines.

1. Copy the template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in any text editor (Notepad works) and set:
   - `POSTGRES_PASSWORD=` → type any password (e.g. `mypipeline123`).
   - `N8N_ENCRYPTION_KEY=` → type any long random string (e.g. mash the keyboard: `k3j2h4g5f6d7s8a9`).

   > Why: these keep your saved Google logins working between restarts. Set them **once** and don't
   > change them later. The `.env` file is private and never uploaded.

---

## Step 4 — Start the engine (n8n)

In the terminal, run:
```bash
docker compose up -d
```
Wait about a minute, then open **http://localhost:5678** in your browser. Create a local n8n account
(email + password — this is just for your own machine).

✅ **You should see** the n8n dashboard.
⚠️ **If the page won't load:** make sure Docker Desktop is open and says "Engine running," then try
`docker compose up -d` again.

---

## Step 5 — Start the AI "worker"

The worker is what actually generates the text. Pick **one** option.

**Option A — API mode (most reliable; small cost).** You need an API key from
[OpenAI](https://platform.openai.com) or [xAI/Grok](https://console.x.ai).
```bash
cd automation
npm install
cp .env.example .env
```
Open `automation/.env` and set `API_KEY=` to your key (and pick the matching `API_BASE_URL`/`MODEL` —
the comments in the file show the OpenAI vs Grok values). Then:
```bash
npm run start:api
```
✅ Leave this terminal window **open and running.** In a new terminal, `curl http://localhost:8787/health`
should say `"ready": true`.

**Option B — Browser mode (free).** No API key; it drives a ChatGPT tab for you.
```bash
cd automation
npm install
npm run start:chatgpt
```
A browser window opens — **log into ChatGPT**, set the mode to "high," and leave it open.

---

## Step 6 — Connect Google (Sheets + Gmail)

1. Create a new **Google Sheet** — this is your tracker. Copy its ID from the URL
   (`docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`).
   Put the exact header row from [SETUP.md → the tracker sheet](SETUP.md) in row 1 (all lowercase).
2. In n8n, add two credentials (n8n walks you through the sign-in):
   - **Google Sheets** (a Service Account is easiest — see [SETUP.md](SETUP.md)).
   - **Gmail** (OAuth — it only ever creates drafts, never sends).

> This is the fiddliest part; SETUP.md has click-by-click instructions and screenshots-worth of detail.

---

## Step 7 — Import the workflow & fill in Config

1. In n8n: **Workflows → Import from File** → choose
   `workflow/lead_gen_xlsx_mode.json`.
2. Open the **Config** node (the first box) and set:
   - `sheet_id` → your Google Sheet ID from Step 6.
   - `email_signature` → your name/title/email.
   - `sender_name` → your name.
   - `batch_size` → `5` to start.
3. Click each Google Sheets node and each Gmail node once and pick the credentials you created.

---

## Step 8 — Add your leads

- Look at **`leads.sample.csv`** to see the format.
- Put your own leads in a file named **`leads.csv`** in the project root (same columns). Export one from
  **Apify** or **Apollo**, or fill the sample in by hand. Blank cells are fine.
- Restart the engine once so it can see the file: `docker compose up -d`.

---

## Step 9 — Run it 🎉

In n8n, open the workflow and click **Execute Workflow**. Watch the boxes light up. It will process up to
`batch_size` leads, one at a time (each takes a minute or two).

✅ **When it finishes, check three places:**
1. **Gmail → Drafts** — one personalized draft per lead.
2. Your **Google Sheet** — a row per lead with all their details and `status = Draft_Created`.
3. The **`docs/output/`** folder — the research and email saved as files.

Review each draft, edit anything you like, and send the good ones. **You** decide what goes out.

---

## Make it yours (the 5-minute version)

- **Different people to contact?** Replace `leads.csv`.
- **Different offer or wording?** Edit the three files `system_prompt_01.md`, `system_prompt_02.md`,
  `system_prompt_03.md` in plain English (audience, offer, tone, call-to-action). Save — the next run
  uses them, no restart needed.
- **Different signature / batch size?** The **Config** node.

Full guide: [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) · ideas for different goals:
[docs/USE_CASES.md](docs/USE_CASES.md).

---

## Common hiccups

| Problem | Fix |
|---|---|
| localhost:5678 won't load | Docker Desktop must be open ("Engine running"), then `docker compose up -d` |
| Worker says `ready: false` | (API mode) your `API_KEY` isn't set in `automation/.env` |
| n8n "No columns found" on a Sheets node | Your sheet's header row (row 1) doesn't match — copy it exactly from [SETUP.md](SETUP.md) |
| "1 drafted, 0 failed (of 2 leads)" | Open the **Loop Over Items** node → set Batch Size to **1** |
| Only a few leads ran | That's normal — it does `batch_size` per run and skips ones already drafted. Run again to continue. |
| No draft appeared | Re-check the Gmail credential is selected on the Gmail node |

---

*Built by Agnel J N ([agnel18](https://github.com/agnel18)). MIT licensed — use it, adapt it, make it yours.*
