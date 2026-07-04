# AI Lead Generation Pipeline
## Portfolio Project Documentation

**Built by Agnel J N (agnel18)** | AI Automation Engineer  
**June 2026** | v1.0 — multi-backend edition (ChatGPT / Grok · browser or API)

---

> **Architecture update:** the AI step now runs through a local worker with **three
> interchangeable backends** — Browser–ChatGPT (verified), Browser–Grok, and an
> OpenAI-compatible **API worker** (Grok/OpenAI, with live web search). All share one HTTP
> contract, so the workflow is backend-agnostic. The 3-stage prompt chain
> (research → review → final email) and draft-only Gmail output are unchanged. "Grok 4.3"
> below is one supported option, not a requirement. See `README.md` and `SETUP.md`.

---

## Project Overview

| Field              | Value                                      |
|--------------------|--------------------------------------------|
| **Project Name**   | AI Lead Generation Pipeline                |
| **Version**        | v1.0 (Agnel J N Fork)                      |
| **Built By**       | Agnel J N (agnel18)                        |
| **GitHub**         | https://github.com/agnel18                 |
| **Date**           | June 2026                                  |
| **Tool Stack**     | n8n (Docker) • Apollo.io • **xAI Grok 4.3** • Gmail • Google Sheets |
| **Deployment**     | Local (Docker) — n8n on `localhost:5678`   |
| **Use Case**       | Automated B2B outreach for Amazon FBA founders & brand owners |

---

## Problem Statement

Manual B2B lead generation is **time-consuming, inconsistent, and risky at scale**.

Founders and sales teams waste hours on repetitive tasks with high chance of duplicate outreach or off-brand messaging. This project solves that by building a reliable, AI-powered outreach system that I (Agnel) can control, audit, and improve.

I chose **Grok 4.3** over OpenAI models because it offers better price/performance for this workload and produces very natural email copy.

---

## Solution Architecture

The pipeline handles **6 stages** end-to-end:

| # | Stage                  | Description |
|---|------------------------|-----------|
| 1 | **Lead Sourcing**      | Apollo.io `contacts/search` (30 leads per run) |
| 2 | **Data Extraction & Split** | Set + Split Out nodes turn API response into individual lead items |
| 3 | **Deduplication**      | Merge node against Google Sheets history |
| 4 | **AI Personalization** | Grok 4.3 generates personalized cold email |
| 5 | **CRM Logging**        | Log to Google Sheets before sending (full audit) |
| 6 | **Email Delivery**     | Gmail sends the email |

**Key Design Decisions (Agnel’s version):**
- Human-in-the-loop approval recommended before Gmail step
- Dry-run mode for safe testing
- Configurable personalization variables (your name, offer, CTA)
- Grok 4.3 connected via OpenAI-compatible endpoint in n8n

---

## Tech Stack

### Core Tools
- **n8n (Docker)** — Visual automation backbone
- **Apollo.io** — Lead database (free plan compatible)
- **xAI Grok 4.3** — AI for natural, high-quality email copy (cheaper + excellent reasoning)
- **Gmail + Google Sheets** — Delivery + lightweight CRM

### Why Grok 4.3?
- Significantly lower cost than GPT-4o / o1 class models
- Strong at context-aware, non-salesy writing
- OpenAI-compatible API → easy drop-in replacement in n8n
- Low hallucination rate — important for outreach

---

## Key Features & My Additions

- Fully automated pipeline with manual trigger (or Schedule)
- **Grok 4.3** personalized emails
- Strong deduplication
- Complete audit trail
- **Manual approval workflow** ready (protects reputation)
- **Dry-run mode**
- Easy to customize prompt variables
- Clean, documented, portfolio-ready

---

## Challenges & Solutions (Same as Original + My Notes)

1. **Apollo Free Plan** — Use `contacts/search` + manually save contacts in Apollo UI (documented in SETUP.md)
2. **Missing Emails on Free Plan** — Fallback + recommendation to add enrichment later
3. **Data Path Issues** — Use explicit node references (`$('Node Name').item.json...`)
4. **Quality Control** — Added recommendation for manual approval step (see Recommendations below)

---

## Portfolio Value & Skills Demonstrated

- End-to-end API + AI automation thinking
- Practical use of **Grok 4.3** via OpenAI-compatible integration
- Data transformation & deduplication patterns in n8n
- Production awareness (approvals, dry-run, audit logs)
- Clear documentation and setup instructions
- Forward-looking architecture (easy to evolve beyond n8n)

---

## Recommendations & Future Improvements (My Take)

As the builder (Agnel), here’s what I consider high-value next steps:

### Immediate (High Impact)
- **Manual Approval Gate** — Best practice for cold email. Implement via Google Sheet status or n8n Form + webhook.
- **Dry Run Mode** — Boolean flag that skips the Gmail node.
- **Configurable Prompt Variables** — Move `your_name`, `value_prop`, `cta` into a Set node.
- **Lead Quality Filter** — Only process Founders/CEOs or relevant titles.

### Short Term
- Scheduled daily runs
- Better error handling + notifications (Slack/Email)
- Store generated email body in the tracker sheet before sending
- Token usage / cost tracking per run

### Longer Term (When Volume Grows)
- Move state to a real database (Supabase / Postgres)
- Build a simple web dashboard for approvals and analytics
- Add reply detection + follow-up automation
- Multi-channel (LinkedIn + Email)

This n8n version is the perfect fast, visual prototype. When I need more control or scale, I can evolve it into a custom backend while keeping the core logic.

---

## Example Output

Personalized emails generated by **Grok 4.3** feel natural and relevant — exactly what you want in cold outreach.

---

## Conclusion

This project shows how to build a practical, controllable AI outreach system quickly using n8n + Grok 4.3. It’s production-usable for moderate volume and an excellent portfolio piece demonstrating real automation skills.

**Built with intention by Agnel J N (agnel18)**

GitHub: https://github.com/agnel18

---

*Full setup instructions → `SETUP.md`*  
*Build prompt for future improvements → `claude.md`*