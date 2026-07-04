# Use Cases

Where this pipeline applies — organized with a **MECE** framework so the scenarios are *mutually
exclusive* (no overlap) and *collectively exhaustive* (they span the space).

## The MECE cut: by outreach objective

There are many ways to slice "who could use this." The clean, non-overlapping axis is the **objective
of the outreach** — *what a reply is supposed to lead to*. Every personalized 1:1 email has exactly
**one** primary objective (→ mutually exclusive), and the six objectives below cover the full span of
personalized B2B relationship-building outreach (→ collectively exhaustive).

| # | Objective | The reply leads to… |
|---|-----------|---------------------|
| 1 | **Demand generation / sales** | A buying conversation |
| 2 | **Talent acquisition / recruiting** | A hiring conversation |
| 3 | **Partnerships & business development** | A mutual-value deal |
| 4 | **Capital & investor relations** | A funding conversation |
| 5 | **Community & event mobilization** | An RSVP / signup |
| 6 | **Retention & lifecycle** | A renewed / expanded relationship |

Each maps onto the *same* three-stage engine — **research → strategy → email** — you only change the
**lead list**, the **three prompts**, and a couple of **Config** fields. What to change is in
[CUSTOMIZATION.md](CUSTOMIZATION.md).

> **Not part of the MECE cut (orthogonal filters):** *industry* (FBA, SaaS, manufacturing…),
> *region* (UAE, EU, US…), and *channel* (email, LinkedIn) describe **who/where**, not the objective.
> They combine freely with any of the six and would double-count if used as the primary axis, so treat
> them as filters on top of an objective — e.g. "sales × manufacturing × UAE."

---

## 1. Demand generation / sales — *the built-in default*

Win new customers by leading with a specific, credible reason to talk.

- **Lead source:** prospects who fit your ICP (Apollo/Apify export by title + industry).
- **Prompt tuning:** *Research* finds a concrete pain the buyer likely has; *Strategy* frames your
  offer as the fix; *Email* makes one clear ask (reply / short call).
- **Config:** `email_signature`, `sender_name`; `batch_size` modest to protect deliverability.
- **Example (shipped):** freelance workflow-automation services to Amazon FBA founders & brand owners
  — the research stage surfaces an operational friction, the email proposes a small automation fix.

## 2. Talent acquisition / recruiting

Reach passive candidates or referral sources with a personalized, non-generic approach.

- **Lead source:** candidate list (title, seniority, current company, LinkedIn).
- **Prompt tuning:** *Research* on the person's role/company and likely motivators; *Strategy* on why
  this role is a credible next step; *Email* warm, role-specific, low-pressure CTA ("open to a chat?").
- **Example:** an agency sourcing senior automation engineers, or a founder recruiting a first hire.

## 3. Partnerships & business development

Open channel, integration, reseller, or co-marketing relationships.

- **Lead source:** target partner companies + the right contact (BD/partnerships/product).
- **Prompt tuning:** *Research* on the partner's model and where you're complementary; *Strategy* on
  the **mutual** value (not a sale); *Email* proposes a specific first step (intro call, pilot).
- **Example:** a SaaS tool reaching agencies to become an implementation partner.

## 4. Capital & investor relations

Founders raising, or funds sourcing — personalized, warm-ish investor outreach.

- **Lead source:** investors matching stage/sector/thesis (or LPs for a fund).
- **Prompt tuning:** *Research* on the investor's thesis and portfolio fit; *Strategy* on the sharpest
  traction/edge to lead with; *Email* concise, specific, one ask (deck / 15-min call).
- **Example:** a seed-stage founder emailing thesis-aligned angels and micro-VCs.
- **Note:** keep claims strictly factual — the prompts' Fact / Inference / Hypothesis discipline matters
  most here.

## 5. Community & event mobilization

Fill a webinar, event, cohort, waitlist, or beta with the *right* people, personally invited.

- **Lead source:** target attendees / community members by role and interest.
- **Prompt tuning:** *Research* on why this person specifically would care; *Strategy* on the single
  most relevant reason to attend; *Email* short, with a clear RSVP/signup CTA and a deadline.
- **Example:** inviting operations leaders in a region to a practical automation webinar.

## 6. Retention & lifecycle

Re-engage dormant/churned customers, or expand existing accounts (upsell / renewal).

- **Lead source:** your CRM export of at-risk, lapsed, or expansion-ready accounts.
- **Prompt tuning:** *Research* on what changed / what they'd value now; *Strategy* on the win-back or
  expansion angle; *Email* acknowledges the relationship and makes a low-friction next step.
- **Example:** a services firm re-opening conversations with clients who went quiet last quarter.
- **Safety:** these go to people who know you — still keep the **draft-only** gate on.

---

## Choosing and combining

1. **Pick one objective** (this doc) — it sets the prompts and the CTA.
2. **Apply orthogonal filters** — industry, region, channel — via your `leads.csv` and ICP language.
3. **Adapt** the three prompts + Config per [CUSTOMIZATION.md](CUSTOMIZATION.md).
4. **Test one lead** end-to-end ([SETUP.md §9](../SETUP.md)) before running a batch.

Whatever the objective, the guardrails don't change: **research-grounded personalization**, an
**honest offer**, and a **draft a human approves** before anything is sent.
