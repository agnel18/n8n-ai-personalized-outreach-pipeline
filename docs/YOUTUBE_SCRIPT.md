# YouTube Video Script — "AI Cold-Email Pipeline: from a lead list to ready-to-send drafts"

A record-ready script for a walkthrough video. It shows how to (1) get customer data with **Apify**,
(2) run the **3-stage AI pipeline** to generate personalized emails, and (3) **customize it** for your
own offer with minimal effort. Every email lands as a **Gmail draft** — nothing is auto-sent.

- **Target length:** 10–12 minutes
- **Format:** `[SCREEN: …]` = what's on screen · `[VOICEOVER: …]` = what you say · `[B-ROLL: …]` = overlay/cutaway
- **Tone:** practical, calm, "build-along." No hype.

> Tip while recording: keep real names, emails, API keys, and your Google Sheet ID **off screen**
> (blur or use dummy data). The pipeline is draft-only by design — say that early; it's a selling point.

---

## 0 · Cold open (0:00–0:25)

`[SCREEN: a Gmail Drafts folder with 5 personalized emails, each to a different company.]`

`[VOICEOVER:]`
"These five cold emails were each researched and written by AI — one per company — and they're sitting
in my Gmail drafts, ready for me to review and send. I didn't write any of them. In the next ten
minutes I'll show you the exact pipeline that made them: it takes a list of leads, researches each
company, and drafts a personalized email — and it never sends anything on its own. Let's build it."

`[B-ROLL: quick 3-second montage — a CSV of leads → a research doc → a finished email.]`

---

## 1 · What it is (0:25–1:30)

`[SCREEN: a simple diagram — Lead list → [Research → Strategy → Email] → Gmail draft + Google Sheet.]`

`[VOICEOVER:]`
"Here's the whole idea. You start with a list of leads — name, title, company, website. For each lead
the pipeline runs a **three-stage AI chain**:
one, **research** the company and find a credible angle;
two, **turn that into a strategy** and a concise email direction;
three, **write the final cold email**.
The result is saved as a Gmail **draft**, and every lead is tracked in a Google Sheet. A human — you —
reviews and sends. That draft-only step is deliberate: cold outreach can wreck your sender reputation,
so we keep a person in the loop."

`[VOICEOVER:]`
"The tools: **n8n** for orchestration — it runs in Docker on your machine — and an AI backend you can
pick: ChatGPT, Grok, or an OpenAI/Grok API key. Same workflow either way. Links and full setup are in
the repo's SETUP guide; today I'll focus on the flow."

---

## 2 · Get customer data with Apify (1:30–4:00)

`[SCREEN: apify.com — the Apify Store, searching for a lead / people scraper actor.]`

`[VOICEOVER:]`
"First we need leads. I use **Apify** — it's a marketplace of ready-made scrapers they call *actors*.
You don't write any code; you fill in a form and it returns structured data. Search the store for a
lead or company scraper that fits your source."

`[SCREEN: opening an actor, showing its Input form — e.g. a search URL, job titles, location, a results limit.]`

`[VOICEOVER:]`
"Open the actor and look at its **Input**. Typically you give it a search — a role like 'Founder' or
'Managing Director', an industry, a location — and a limit. Start small: twenty or thirty leads while
you're testing. Set the cap so you don't burn credits."

`[SCREEN: click Start / Run; the run progresses; then the Dataset / Output tab fills with rows.]`

`[VOICEOVER:]`
"Run it. When it finishes, open the **Dataset** — this is your output. Each row is a person plus their
company: full name, title, email, LinkedIn, and rich company context like industry, size, and a
description. That company context is gold — it's what makes the research stage specific instead of
generic."

`[SCREEN: Export → CSV; the downloaded file; renaming it to leads.csv; dropping it into the project root.]`

`[VOICEOVER:]`
"Export the dataset as **CSV**, rename it to **leads.csv**, and drop it in the project folder. The
pipeline reads these columns: fullName, email, position, organizationName, and the organization details.
If your scraper names columns differently, just rename the headers to match — that's the only mapping
you ever do."

`[B-ROLL: highlight the header row of leads.csv, boxing fullName / email / position / organizationName.]`

`[VOICEOVER:]`
"One reminder: this is real contact data — treat it like it's private. It stays on your machine and is
gitignored so it never ends up in a public repo."

---

## 3 · Set up (fast) (4:00–5:30)

`[SCREEN: a terminal in the project folder.]`

`[VOICEOVER:]`
"Setup is a one-time thing and the SETUP guide covers every click, so I'll go quickly. Three pieces:
n8n, a worker, and Google."

`[SCREEN: type `docker compose up -d`; then open http://localhost:5678 in the browser.]`

`[VOICEOVER:]`
"One — start n8n with `docker compose up -d` and open localhost:5678. It runs entirely on your machine."

`[SCREEN: terminal — `cd automation`, `npm install`, then `npm run start:api`; then `curl localhost:8787/health` showing ready:true.]`

`[VOICEOVER:]`
"Two — start a **worker**. This is the little program that actually calls the AI. I'm using **API
mode** with an OpenAI key — it's the most reliable. I drop my key into a `.env` file, run
`npm run start:api`, and check `/health` says *ready*. If you'd rather not pay for an API, there's a
free browser mode that drives a ChatGPT tab instead — same result."

`[SCREEN: n8n Credentials screen — connecting Google Sheets and Gmail.]`

`[VOICEOVER:]`
"Three — connect **Google**: Sheets for the tracker, Gmail for the drafts. Both are a one-time sign-in.
Gmail only ever creates drafts — the permission never sends mail."

`[SCREEN: the n8n workflow canvas with the Config node open.]`

`[VOICEOVER:]`
"Finally, import the workflow and open the **Config** node. This one panel is your control center —
your sheet ID, your email signature, and `batch_size`: how many leads to process per run. I'll set it
to five."

---

## 4 · Run it (5:30–8:00)

`[SCREEN: click Execute Workflow. The nodes light up one by one along the canvas.]`

`[VOICEOVER:]`
"Now the fun part — hit **Execute**. Watch it go. It reads the leads, skips anyone it's already
drafted, and takes the next five. Then, one lead at a time, it runs the three stages."

`[B-ROLL: zoom into the worker terminal showing `[api] research: ok`, `review: ok`, `final_email: ok`.]`

`[VOICEOVER:]`
"Behind the scenes the worker is calling the model three times per lead. Stage one researches the
company — with API mode you can even turn on live web search. Stage two shapes the angle. Stage three
writes the email."

`[SCREEN: open docs/output/<date>/<company>/ — three markdown files: Research, Review, Final_Email. Open the Research one briefly.]`

`[VOICEOVER:]`
"Every stage is saved as a markdown file, so you get a full paper trail. Here's the research it did on
this company — specific, sourced, not fluff. And here's the email it produced from it."

`[SCREEN: the Google Sheet tracker — five new rows, columns filled: fullName, position, organizationName, …, status = Draft_Created.]`

`[VOICEOVER:]`
"The tracker sheet fills in as it goes — every lead's details and a status. When a lead's email is
drafted, its status flips to *Draft_Created*, so if you run it again tomorrow it just continues where
it left off. No duplicates."

`[SCREEN: Gmail Drafts — five drafts; open one and read the subject + first lines.]`

`[VOICEOVER:]`
"And here's the payoff: five drafts in Gmail. Each one references something real about that specific
company. I read them, tweak anything I want, and send the good ones. The AI did the research and the
first draft; I stay in control of what actually goes out."

---

## 5 · Make it yours (8:00–10:30)

`[SCREEN: split view — leads.csv on one side, the three system_prompt files on the other.]`

`[VOICEOVER:]`
"Here's why this is worth setting up once: to point it at a completely different audience or offer, you
change **three things** — no code."

`[SCREEN: highlight leads.csv.]`

`[VOICEOVER:]`
"One — **who** you contact: swap in a different leads.csv. New industry, new region, new titles."

`[SCREEN: open system_prompt_01/02/03.md; scroll each briefly.]`

`[VOICEOVER:]`
"Two — **what** the AI says: three prompt files. The first defines your ideal customer and what a good
angle is. The second is your offer and value proposition. The third is your tone and your call to
action. Edit those in plain English. Save. The next run uses them immediately — you don't even restart
the worker."

`[SCREEN: the Config node — email_signature, sender_name, batch_size.]`

`[VOICEOVER:]`
"Three — the **Config** node: your signature, your name, how many per run."

`[SCREEN: briefly show docs/USE_CASES.md headings — Sales, Recruiting, Partnerships, Investor, Events, Retention.]`

`[VOICEOVER:]`
"Same machine, totally different jobs. Selling a service, recruiting candidates, partnership outreach,
raising a round, filling a webinar, winning back quiet customers — each is just a different lead list
and a different set of prompts. There's a use-cases doc that walks through all of them, and a
customization guide with the exact 'change this, edit that' steps."

---

## 6 · Outro (10:30–11:15)

`[SCREEN: back to the five Gmail drafts.]`

`[VOICEOVER:]`
"So that's the pipeline: Apify for the leads, a three-stage AI chain for the research and the writing,
Gmail drafts you approve before anything is sent, and a Google Sheet keeping score. It runs on your
machine, it's provider-neutral, and you can repoint it at a new audience in a few minutes."

`[VOICEOVER:]`
"Everything — the workflow, the prompts, the setup guide — is in the repo linked below. If you want the
non-coder, from-scratch walkthrough, start with GETTING_STARTED. If this helped, subscribe — I build
practical automations like this one. Thanks for watching."

`[SCREEN: end card — repo link, GETTING_STARTED.md, SETUP.md, CUSTOMIZATION.md.]`

---

## Appendix — shot checklist

- [ ] Apify: store search → actor input → run → dataset → CSV export
- [ ] `leads.csv` header row (fields the pipeline reads)
- [ ] `docker compose up -d` → localhost:5678
- [ ] `npm run start:api` → `/health` ready
- [ ] Google Sheets + Gmail credential connect (blur tokens)
- [ ] Config node (blur your real sheet ID)
- [ ] Execute → nodes animating → worker terminal logs
- [ ] `docs/output/` markdown (Research + Final_Email)
- [ ] Google Sheet rows filling with all columns + `Draft_Created`
- [ ] Gmail drafts (blur recipient addresses)
- [ ] The three `system_prompt_*.md` files + Config node for the customization section

*Companion docs: [SETUP.md](../SETUP.md) · [CUSTOMIZATION.md](CUSTOMIZATION.md) · [USE_CASES.md](USE_CASES.md).*
