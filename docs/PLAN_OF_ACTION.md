# Plan of Action: Browser-Driven Outreach Workflow

Date: 2026-06-23
Owner: Agnel J N
Status: Implemented (see update note)

> **Update:** this was the original **browser-Grok** plan. It's implemented and generalized —
> the same design now runs on three interchangeable backends (Browser–ChatGPT, Browser–Grok,
> and an OpenAI-compatible **API worker**), all behind one worker HTTP contract. Where this doc
> says "Grok web UI", read "the chosen AI backend". Current setup: `README.md` / `SETUP.md`;
> selector upkeep for browser modes: `docs/MAINTAINING_SELECTORS.md`.

## 1) Goal

Build a reliable n8n workflow that:

1. Pulls lead data from Apollo using environment API key.
2. Processes one company at a time for testing.
3. Writes lead data to Google Sheets file Apollo Tracker Sheet, tab Sheet1.
4. Runs 3 prompt stages through Grok web UI (browser mode, visible to operator).
5. Saves each stage output as markdown in the repo.
6. Creates Gmail draft only (never send automatically).
7. Stops immediately on any failure and asks operator to fix before continuing.

## 2) How n8n fits

n8n is the orchestration layer.

n8n handles:
- Scheduling and run control
- Apollo fetch and filtering
- Dedupe and state tracking
- Prompt payload construction
- Calling browser automation worker
- Saving outputs and paths
- Gmail draft creation
- Fail-fast routing and recovery gates

Grok handles:
- Research, review, and final draft content generation

Operator handles:
- Logging into Grok at run start
- Resolving popups/captcha/quota interruptions
- Resuming run after fix

## 3) Inversion pre-mortem: fail points and controls

### A. Authentication and session failures
Failure mode:
- Grok session expires mid-run, browser looks open but auth invalid.

Control:
- Preflight auth check before Stage 1.
- If auth invalid: stop run and raise operator action message.
- Do not retry blindly.

### B. Selector or UI drift
Failure mode:
- Input box, send button, or response container selector changes.

Control:
- Centralize selectors in one config object.
- Add selector health check in preflight.
- If selector fails: stop run, log failing selector name in Sheet1 status columns.

### C. Popup, captcha, rate-limit interruptions
Failure mode:
- Grok blocks generation due to too many prompts or challenge screen.

Control:
- One company per run initially.
- Add explicit detection for interruption text and modal elements.
- Stop run and require manual intervention.

### D. Prompt injection from lead fields
Failure mode:
- Malformed lead data changes prompt instructions.

Control:
- Escape and quote all Apollo text fields.
- Separate system prompt template from data payload.
- Add max length truncation for noisy fields.

### E. Duplicate outputs on rerun
Failure mode:
- Same lead creates duplicate markdown and duplicate drafts after partial failure.

Control:
- Idempotency key: normalized_email + company + run_date.
- Check existing Stage3 path or Draft ID before creating new draft.
- Resume from failed stage only.

### F. Naming collisions
Failure mode:
- Two runs create the same file name.

Control:
- Use second-level timestamp and slugged company.
- Pattern:
  YYYYMMDD_HHMMSS_Company_Name_Research.md
  YYYYMMDD_HHMMSS_Company_Name_Review.md
  YYYYMMDD_HHMMSS_Company_Name_Final_Email.md

### G. Google Sheets schema drift
Failure mode:
- Column order changes break node mappings.

Control:
- Lock headers and validate schema in preflight.
- Fail if required columns missing.

### H. Draft accidentally sent
Failure mode:
- Wrong node action sends email.

Control:
- Gmail node action fixed to Create Draft.
- No send node in workflow until explicitly approved later.

### I. Partial success treated as complete
Failure mode:
- Earlier stages succeed, later stage fails, status still appears done.

Control:
- Stage-level status updates:
  Fetched, Stage1_Done, Stage2_Done, Stage3_Done, Draft_Created, Failed.
- Updated_At timestamp on every transition.

### J. Sensitive data leakage
Failure mode:
- Lead data and generated output accidentally committed.

Control:
- Save artifacts under output folder and keep folder ignored in git.
- Add retention cleanup policy.

## 4) Apollo search strategy (UAE, persona-first)

Start with focused search to reduce noise:

1. Person persona IDs include Manufacturing Owner / Managing Director.
2. Geography set to UAE.
3. Pull one company at a time for test phase.
4. Expand persona set only after quality pass rate is acceptable.

Recommended query order:
1. Persona ID filter
2. Country filter (UAE)
3. Company domain or industry refinements
4. Title confidence checks

## 5) Workflow stages in n8n

1. Manual Trigger
- Start run and set run_id, timestamp, mode=browser.

2. Preflight Checks
- Validate env keys and Google credentials.
- Validate Grok browser worker reachable.
- Validate Sheet1 schema.

3. Apollo Search
- Fetch candidates by persona and UAE.
- Select one company for initial run.

4. Normalize + Upsert to Sheet1
- Write normalized fields and raw JSON snapshot.
- Set status Fetched.

5. Operator Login Gate
- Pause and show action message: log in to Grok main page and confirm expert mode.

6. Stage 1 (Research)
- Build prompt from system_prompt_01 + lead payload.
- Inject into Grok input area and collect response.
- Save markdown file and path.
- Set status Stage1_Done.

7. Stage 2 (Review)
- Build prompt from system_prompt_02 + Stage 1 response + lead payload.
- Inject and collect response.
- Save markdown file and path.
- Set status Stage2_Done.

8. Stage 3 (Final Email)
- Build prompt from system_prompt_03 + Stage 2 response + lead payload.
- Inject and collect response.
- Save markdown file and path.
- Set status Stage3_Done.

9. Gmail Draft
- Create draft only.
- Recipient must be lead email.
- Save draft id/url in Sheet1.
- Set status Draft_Created.

10. Error Branch (global)
- On any node failure: set status Failed, write failure reason, stop run.
- Raise operator message to fix and rerun from failed stage.

## 6) Artifact storage

Base folder:
- docs/output/<YYYYMMDD>/<Company_Name>/

Files per lead:
- YYYYMMDD_HHMMSS_Company_Name_Research.md
- YYYYMMDD_HHMMSS_Company_Name_Review.md
- YYYYMMDD_HHMMSS_Company_Name_Final_Email.md

Sheet columns to store paths:
- Stage1_MD_Path
- Stage2_MD_Path
- Stage3_MD_Path

## 7) Operator message behavior (toast equivalent)

n8n does not provide guaranteed custom UI toast popups for all runtime paths.
Use this fail-fast pattern instead:

1. Set node composes clear operator action text.
2. Write action text to Sheet1 column Operator_Action.
3. Stop with Throw Error node including the same message.
4. Optional parallel notification: Telegram/Slack/Email node.

Required message templates:
- Login required: Log in to Grok main page, switch to expert mode, then resume.
- Popup interruption: Close popup/captcha/quota dialog, verify chat input active, rerun failed stage.
- Selector failure: UI changed. Update selector config and rerun.

## 8) Rollout plan

Phase A: Stability baseline
- One company per run.
- Validate all status transitions and markdown file writes.
- Validate draft creation only.

Phase B: Controlled scaling
- Increase to 2 to 3 companies per run.
- Add cool-down between stage executions.
- Track interruption rate and failure causes.

Phase C: Gradual production
- Increase in small steps only after two clean runs at current level.
- Keep fail-fast enabled.

## 9) Acceptance checklist

Must pass before scaling:

1. Preflight catches missing auth before Grok interaction.
2. Three markdown artifacts are created and path-logged.
3. Draft created in Gmail for lead email only.
4. Any failure sets status Failed and stops execution.
5. Rerun does not duplicate completed stages.
6. Operator action message is visible in both execution error and Sheet1.

## 10) Deferred items

- ChatGPT browser profile support (later).
- Full auto-resume queueing.
- Optional API-mode fallback routing for emergency continuity.
