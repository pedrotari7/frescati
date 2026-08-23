---
name: fix-sentry-issue
description: Investigate a Sentry issue (by URL or short ID) using the connected Sentry MCP server — pull the full event, stack trace and metadata, correlate it with this repo, and propose or implement a fix. Use when the user pastes a Sentry issue link/ID or asks to look into a Sentry error.
---

# Fix a Sentry issue

Frescati reports both halves (frontend and backend) to **one** Sentry project — see
`docs/error-reporting.md` before touching anything here. That file
explains what's deliberate (e.g. `HttpsError` never reaches Sentry, `instrument()` always
rethrows, the frontend's `ignoreErrors` list in `frontend/lib/sentry.ts` already filters known
non-bugs) versus what's a genuine defect worth fixing.

## Step 1 — Resolve the issue

Accept whatever the user gave you: a full `https://<org>.sentry.io/issues/<id>/` URL, a short
ID (e.g. `FRESCATI-12`), or a bare numeric ID. The `sentry` MCP server is already connected
(`.mcp.json`) — if its tools aren't showing up yet, tell the user to run `/mcp` in Claude Code
to approve/authenticate it first; you cannot complete that OAuth step yourself.

Tool names on the Sentry MCP server can shift between versions, so introspect what's actually
available rather than assuming — look for something like `find_organizations`/`find_projects`
for discovery, `get_issue_details`/`search_issues` for the issue itself, `search_events` or an
event-fetch tool for individual occurrences, and (if present) a Seer root-cause tool such as
`begin_seer_issue_fix`. There is only one Sentry project here (both frontend and backend share
a DSN — see `frontend/.env.local` / `backend/.env`), so you shouldn't need to disambiguate
projects, only pick the org from the issue URL if asked for one.

## Step 2 — Pull full context

Fetch, at minimum:

- The issue's title, culprit, first/last seen, event count, and status.
- The **latest event**, including full stack trace (all frames, not just the top), tags
  (`environment`, `release`, `server_name`/runtime), and any `extra` context.
- A second or third event if the issue spans more than one release or environment — a bug that
  only fires in `preview` vs `production` (see `sentry.ts`'s `ENVIRONMENT` comment) or only for
  one platform is a different fix than one that fires everywhere.

Remember what's *not* there by design: no email, no name, no IP, no session replay — `extra`
identity is a bare uid at most (`setSentryUser`). Don't treat the absence of PII as a bug in
the report; that's `sendDefaultPii: false` working as intended.

If a Seer/root-cause tool is available, use its output as one input, not the verdict — cross-
check it against the actual stack trace and this repo's conventions before trusting it.

## Step 3 — Correlate with the codebase

- Map the stack trace frames to real files (`frontend/...` or `backend/src/...`) and read the
  surrounding code, not just the flagged line.
- Check whether the failing path already goes through `instrument()` (backend) or `captureError`
  (frontend) — if so, this issue *is* the reporting path working correctly, and the fix is in
  the failing operation, not in error handling.
- Check `git log -p` / `git blame` on the flagged lines for recent related changes — a fresh
  regression usually traces to a specific commit.
- Cross-reference the relevant domain rules before proposing a fix: the third-state pattern (no
  doc = no response / not played), `counts`/`atRisk`/teams being function-owned and rejected
  from client writes, the members-vs-extras sort and cap rules, rating/ledger replay semantics,
  and the push/email fallback rules in "Notifications" — a fix that looks locally correct but
  breaks one of these is worse than the original bug.

## Step 4 — Diagnose before patching

State plainly: what's failing, why (root cause, not just symptom), how often/who's affected
(from the event count and tags), and whether it's one of the two "not a bug" categories above.
If the evidence is ambiguous (e.g. only one event, no clear repro), say so rather than guessing.

## Step 5 — Propose or implement the fix

Follow existing conventions (see root `CLAUDE.md`): pure logic changes belong in `shared/` with
tests; a swallowed error that should be visible goes through `reportError`/`captureError` rather
than a bare `catch`; don't compute function-owned fields on the client. Run the narrowest test
suite for what you touched (`pnpm test:backend` after `backend/src` changes, `pnpm test:rules`
after `firestore.rules`) — don't start a dev server yourself.

Don't resolve/comment on the Sentry issue itself unless the user asks — that's a call for
whoever triages the inbox, not an automatic side effect of investigating it.
