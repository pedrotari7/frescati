# Frescati

Mobile-first PWA for running a recurring football group. A **season** defines a repeating slot (e.g. every Tuesday 19:00 at Frescati IP) and a date range; **games** are generated from it; players report **In / Out** for each one.

- **Members** are the season squad — no cap, always ranked first.
- **Extras** are any other signed-in user. They can put their hand up for any game and sit below the members, unless a season admin drops them.
- The headcount flexes (10, 15, 20 — whatever turns up). A season sets a **minimum**; below it a game reads "at risk", and the app derives the format from the count (14 → 7v7).
- A season also keeps a **kit register** — which balls and vests the group owns and who currently has each. Anyone in the squad can record a handover, and a game is flagged when nobody bringing a ball or the vests has said they're playing.

## Stack

|          |                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 15 App Router, React 19, Tailwind 4 → Vercel                                                  |
| Data     | Firestore, read and written **directly from the client** — security rules are the authorization layer |
| Backend  | Firebase Cloud Functions v2 (`nodejs24`, `europe-west1`) for counters, push and reminders only        |
| Auth     | Google popup. `admin` custom claim for app admins; `adminUids` on a season for season admins          |
| Push     | FCM data-only messages rendered by our own service worker                                             |

```
shared/     plain TS, compiled into both sides — types + pure domain logic, unit tested
frontend/   Next.js app
backend/    Cloud Functions
rules/      emulator-backed Firestore security rules tests
```

## Setup

Requires Node 24 (`.nvmrc`), pnpm, and **JDK 21+** for the emulators.

```sh
nvm use
pnpm install
cp frontend/.env.local.example frontend/.env.local
```

> The shell on this machine exports an `npm_config_registry` pointing at Spotify's artifactory, and an env var beats `.npmrc`. If install hangs, prefix it: `npm_config_registry=https://registry.npmjs.org/ pnpm install`.

### Firebase console (one-off, manual)

Project: **`footballfrescati`**.

1. Enable **Firestore**, **Authentication → Google**, and **Cloud Messaging**.
2. Upgrade to the **Blaze** plan — Cloud Functions v2 and scheduled functions require it.
3. **Cloud Messaging → Web Push certificates** → generate a key pair, put it in `frontend/.env.local` as `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
4. **Authentication → Settings → Authorized domains** → add `localhost` and your Vercel domain.
5. Deploy rules and indexes: `pnpm deploy:rules && firebase deploy --only firestore:indexes`.
6. Sign into the app once so a Firebase Auth user exists for you.
7. Make yourself an app admin (nothing in the app can grant this — that's the point):

    ```sh
    gcloud auth application-default login   # once, if you have no ADC yet
    pnpm --filter backend set-admin you@example.com
    ```

    Check it landed with `pnpm --filter backend whoami you@example.com` — custom claims aren't visible in the Firebase console. The claim reaches the browser on the next token refresh, which the app forces every 10 minutes; signing out and back in is instant.

    A service account key works too, via `GOOGLE_APPLICATION_CREDENTIALS`, but ADC avoids putting a key file on disk.

8. **Create the `RESEND_API_KEY` secret.** Required before any functions deploy, whether or not you want the email fallback — the functions declare the secret, and a deploy that can't find it fails outright.

    ```sh
    firebase functions:secrets:set RESEND_API_KEY
    ```

    If you're not using email yet, give it any placeholder. Nothing is sent until `EMAIL_FROM` and `APP_URL` are filled in too, and in `backend/.env` they start empty.

    Nothing local needs it. The functions emulator resolves every declared secret when it starts a runtime worker, and `backend/.secret.local` — committed, a placeholder — is what it reads instead of going to Secret Manager for a value no emulated run can use. Without it a seed logs a lookup per worker, and in CI, which has no credential and no business having one, each of those is an access failure printed beside a trigger that worked.

    **Then, to actually turn the fallback on:** push reaches nobody on an iPhone that was never added to the home screen, which in practice is most of the people who say they never get the reminders. Sign up at [resend.com](https://resend.com), verify the domain you'll send from, set the real key above, and fill in `backend/.env`:

    ```sh
    EMAIL_FROM=Frescati <notifications@your-domain.com>
    APP_URL=https://your-vercel-domain.com
    ```

    Both are `defineString` parameters rather than secrets, which is why they are committed — see the comments in that file. Deploy the functions afterwards; a secret is only bound into a function at deploy time.

    Check it by opening **You → Push debug** as an app admin on a device with notifications switched off: the send should report that it went to your email instead. **You → Notification status** says up front if no sender is configured.

9. Wire up GitHub Actions — without this, the deploy jobs in `ci.yml` fail on your first push to `main`:
    - **Repo variables** (Settings → Secrets and variables → Actions → **Variables**): the same `NEXT_PUBLIC_FIREBASE_*` keys as `frontend/.env.local` (all except `VAPID_KEY`) — `frontend.yml` needs them to build the frontend in CI.
    - **Repo secret** (Settings → Secrets and variables → Actions → **Secrets**): `GCP_SA_KEY`, the JSON key of a service account that can deploy functions and rules:

        ```sh
        PROJECT=footballfrescati
        SA_NAME=github-actions-deploy
        SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

        gcloud iam service-accounts create $SA_NAME --project=$PROJECT \
          --display-name="GitHub Actions deploy"

        for ROLE in roles/firebase.admin roles/cloudfunctions.admin roles/run.admin \
          roles/cloudbuild.builds.editor roles/artifactregistry.writer \
          roles/iam.serviceAccountUser roles/storage.admin \
          roles/cloudtasks.admin roles/cloudscheduler.admin \
          roles/secretmanager.admin
        do
          gcloud projects add-iam-policy-binding $PROJECT \
            --member="serviceAccount:${SA_EMAIL}" --role="$ROLE"
        done

        gcloud iam service-accounts keys create sa-key.json --project=$PROJECT \
          --iam-account=$SA_EMAIL
        ```

        Paste `sa-key.json`'s contents into the `GCP_SA_KEY` secret, then delete the local file — gen2 functions deploy through Cloud Build, Artifact Registry and Cloud Run, so `firebase.admin` alone isn't enough. `cloudtasks.admin` and `cloudscheduler.admin` are needed too: `rebuildTeams` upserts its Cloud Tasks queue and `finaliseDueTournaments`/`sendReminders` upsert their Cloud Scheduler jobs on every deploy. `secretmanager.admin` is what lets the deploy read `RESEND_API_KEY` and grant the runtime service account access to it.

    - **Three more repo secrets** for `deploy-frontend`, which is what puts the frontend into production (see "Deployment"): `VERCEL_TOKEN` from **Vercel → Account Settings → Tokens**, scoped to the team that owns the project, and `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`, which `vercel link` writes into the gitignored `.vercel/project.json` as `orgId` and `projectId`. Only the token is really a secret — the two ids appear in every deployment URL — but they are kept together so all three are rotated in one place.

10. **Set up App Check**, which is what keeps a script holding this project's public config out of a database every read of which is a plain signed-in read. See "Who can see the group" for what it does and doesn't cover.
    1. **Project settings → App Check → Apps →** your web app **→ reCAPTCHA Enterprise.** Register it, and put the **site key** in `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` — in `frontend/.env.local`, in Vercel's environment variables, and as a repo variable for CI. It is public, like every other `NEXT_PUBLIC_` value.
    2. Deploy the frontend and leave it alone for a few days. App Check starts in **monitoring** mode: tokens are collected and nothing is rejected. **Project settings → App Check → APIs** then shows the share of verified requests per service.
    3. Only once Firestore reads **and** Cloud Functions calls are showing ~100% verified, switch **Enforce** on, one service at a time.

    > Enforcing before that number is where it should be locks the live app out of Firestore, and the fix is a console change with no deploy behind it. Waiting costs nothing.

    For `pnpm dev:live` — a localhost dev server against the real project — reCAPTCHA has no domain it recognises, so requests go out unattested and will be rejected once enforcement is on. Run it once with the site key set, take the debug token the SDK logs to the browser console, register it under **App Check → Apps → Manage debug tokens**, and put it in `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN`. It is a standing exemption from the check, so it belongs in `.env.local` and nowhere near production.

    `pnpm dev:seeded` needs none of this: the emulators don't verify App Check tokens, and the client skips it entirely when pointed at them.

11. **Set up Sentry**, which is how a crash on somebody's phone reaches you at all. Almost every screen talks to Firestore directly from the browser, so most of what can go wrong never touches a server log — before this, the only way it surfaced was somebody mentioning at the pitch that the app "wasn't working".

    Sign up at [sentry.io](https://sentry.io) and create **one** project (platform: Next.js). The functions report into the same project on purpose — a failed write and the trigger that should have followed it belong in one place.

    > **Pick the EU data region when you create the organisation.** It cannot be changed afterwards, and this is a Swedish group whose reports carry uids and stack traces. Same reasoning as keeping addresses out of Firestore.

    Then, from **Settings → Client Keys (DSN)**, take the DSN and put it in:
    - `frontend/.env.local` as `NEXT_PUBLIC_SENTRY_DSN`
    - Vercel's environment variables, same name
    - the repo variables for CI, same name
    - `backend/.env` as `SENTRY_DSN`, then redeploy the functions

    It is public, like the Firebase config — a DSN authorizes writing an event to one project and reads nothing back. Left blank everywhere, the SDK is inert and nothing changes.

    For readable stack traces, add three more to **Vercel only** (they are build-time only, and CI deliberately does without them so its throwaway builds don't claim releases): `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` — the last from **Settings → Auth Tokens**, scoped to `project:releases`. Without them the build still succeeds; every trace just stays minified, which on a phone is most of the value gone.

    **Check it works** from **You → Debug → Break something on purpose**, which fails deliberately in seven different ways and is safe to fire in production — nothing there touches a game, a rating or anybody's data. Six should appear in Sentry within a few seconds; the seventh, `HttpsError`, must **not**, since that is the filter keeping the authorization layer out of the inbox. Worth doing once on a phone as well as a laptop: it is the only way to find out whether a content blocker is eating the reports, and the tunnel exists precisely because they do.

    **Then set up an issue alert**, because none of the above tells you anything by itself — Sentry collects silently until something is configured to speak. **Alerts → Create Alert → Issues**, fire on *a new issue is created*, deliver wherever you'll actually see it. Without this the inbox is a thing you have to remember to visit, which is the same failure as reading logs.

    ### Knowing a scheduled sweep has stopped

    `sendReminders` and `finaliseDueTournaments` run hourly and unattended, and they fail in two quite different ways. One throws — that reports an error like anything else. The other simply **stops running**: a scheduler job deleted, a deploy that dropped the function. That produces no error, no log line, and looks exactly like a week where nothing needed doing. It is the failure you find out about when somebody mentions they've stopped getting reminders.

    So both check in. Each run reports that it started and that it finished, and Sentry raises an issue when an expected check-in doesn't arrive — absence becomes the signal instead of the blind spot. The monitors create themselves on the first run after deploy (`instrumentSchedule` upserts the config), so there is nothing to set up here beyond the alert rule above. The expected schedule lives in the code next to the `onSchedule` that implements it, deliberately, so the two can't drift apart.

    They differ in how eagerly they complain, which is worth knowing before you tune it: reminders raise on the **first** miss, because a missed nudge is an hour closer to a kickoff nobody was told about. Confirmations raise on the **second**, because a game confirmed an hour late rates exactly the same.

    > Two cron monitors are created. Check what your Sentry plan allows — the free tier's allowance is small, and monitors beyond it are rejected rather than billed.

    What is deliberately **not** switched on: performance tracing and Session Replay. Replay records the DOM, which here is a roster of real names and who is playing where — a much bigger collection than a stack trace, and not one to make before there's a privacy notice saying so. Tracing is tree-shaken out entirely (`webpack.treeshake.removeTracing` in `next.config.js`), which is worth 28 kB gzipped on a phone-first bundle.

## Commands

|  |  |
| --- | --- |
| `pnpm dev:seeded` | **the whole local stack in one command** — emulators, seeded data, dev server |
| `pnpm dev:live` | dev server against the real Firebase project |
| `pnpm dev` | dev server against whatever `frontend/.env.local` says |
| `pnpm test` | pure domain tests (`shared/`) — **this is not all the tests**, see `test:all` |
| `pnpm test:all` | all four suites: shared, frontend, rules, backend. Needs ports 8080/9099 free, so stop `dev:seeded` first |
| `pnpm test:frontend` | components and hooks (jsdom, no emulator) |
| `pnpm test:rules` | security rules against the Firestore emulator — **run after any `firestore.rules` change** |
| `pnpm test:backend` | the Cloud Functions against the Firestore + Auth emulators |
| `pnpm emulators` | Auth + Firestore + Functions emulators, on their own |
| `pnpm seed` | fill already-running emulators with a scenario — see below |
| `pnpm build` / `pnpm lint` | both workspaces |
| `pnpm deploy:functions` | deploy Cloud Functions |
| `pnpm --filter backend set-admin <email>` | grant the app-admin claim (`--revoke` to remove) |
| `pnpm --filter backend whoami <email>` | print a user's uid and custom claims |

### One-off maintenance

Each takes `--dry-run` (except `recount-games`) and is safe to run twice.

|  |  |
| --- | --- |
| `pnpm --filter backend backfill-kickoff-millis` | fill in `kickoffMillis` on games written before it existed — **the response deadline is not enforced on a game without it** |
| `pnpm --filter backend strip-user-emails` | remove `email` from profiles written before it moved out of Firestore |
| `pnpm --filter backend recount-games` | recompute `counts` and repair drifted `role`s across every game |
| `pnpm --filter backend prune-orphans` | delete responses and games left behind by deletions that predate the cascade triggers |
| `pnpm --filter backend forget-player <uid\|email>` | remove somebody who has asked to be taken off — see below |

Anything touching the emulators needs a JDK 21+, which `scripts/emulators.sh` goes and finds — no `JAVA_HOME` prefix required.

Every command above is a **root** script: run it from the repo root, or `pnpm -w <script>` from anywhere in the workspace. From inside `frontend/` or `backend/` you get `Command "dev:seeded" not found`.

## Local development against seeded data

Nothing is mocked. The emulators run the real rules and the real triggers; the seed just gives them a past — thirty players, a few seasons, a season's worth of confirmed results, and a fixture list that reaches every state a game screen can be in. A screen that works against a seed works against production.

```sh
pnpm dev:seeded                 # emulators + seed + dev server, one terminal
SCENARIO=big pnpm dev:seeded    # a different scenario
```

Ctrl-C stops the lot. Nothing to configure: `dev:seeded` sets `NEXT_PUBLIC_USE_EMULATORS` for the dev server it starts, so `frontend/.env.local` does not need touching and the flag is not left switched on afterwards — which matters, because an app pointed at emulators that aren't running looks broken in a way that takes a minute to spot. `pnpm dev:live` is the same guarantee in the other direction.

The two-terminal form is still there when you want the emulators to outlive the dev server, or to re-seed without restarting anything:

```sh
pnpm emulators                  # one terminal, leave it running
pnpm seed                       # another, as often as you like
NEXT_PUBLIC_USE_EMULATORS=1 pnpm dev
```

Then tap the flask in the bottom-right of the app and pick somebody. That switcher only exists when `NEXT_PUBLIC_USE_EMULATORS=1`, and it signs in without Google: the Auth emulator accepts an unsigned identity, and the seeder imports a matching provider link for every player, so you land on the uid the seeded data is actually about. Two taps to go from app admin to season admin to a member to a stranger who has never signed in.

|                              |                                                                      |
| ---------------------------- | -------------------------------------------------------------------- |
| `pnpm seed`                  | the `full` scenario — three seasons, a full ladder, every game state |
| `pnpm seed --scenario=big`   | 26 members, four-team games, a season of history                     |
| `pnpm seed --scenario=fresh` | day one: no history, no ratings, every empty state                   |
| `pnpm seed --list`           | what else is there                                                   |
| `pnpm seed --keep`           | seed alongside what's already there instead of wiping                |
| `pnpm seed --origin=…`       | if the app isn't on `localhost:3000` (avatars are served from it)    |

Scenarios live in `backend/scripts/seed/scenarios.ts` and are declarative — a season is an entry in a list, and a game that should be cancelled, at risk, played-but-unconfirmed or answered by nobody is a line in its `pins`. Everything is positioned relative to today, so a seed is as useful in six months as it is now.

The seeder never invents anything the app could work out for itself: counts come from `tallyResponses`, lineups from `pickTeams`, tables from `getStandings` and ratings from `getRatingChanges` — the same code the Cloud Functions run. Only the scorelines are made up, rolled from a hidden per-player strength that never reaches Firestore. So the seeded ladder is one the app could genuinely have produced, and replaying it reproduces it exactly.

`pnpm seed` writes `frontend/public/dev-users.json` and `frontend/public/dev-avatars/`; both are gitignored.

### What the emulators can't do

- **Cloud Tasks has no emulator.** `rebuildTeams` is normally queued; locally the same work runs in-process a couple of seconds after a response instead, so teams really do rebuild when you answer. See `enqueueTeamRebuild`.
- **Scheduled functions never fire** — the emulator skips them without pubsub. `finaliseDueTournaments` and `sendReminders` therefore do nothing locally; confirming a game by hand still works, since that path is a callable.
- **Push goes nowhere.** FCM is not emulated.
- **Email goes nowhere either** — deliberately, in this case. `sendEmail` logs what it would have sent rather than calling Resend, so a `pnpm dev:seeded` run doesn't mail the entire seeded roster. The honest end-to-end test is **You → Push debug** in production.
- Seeding while the Functions emulator is up sets off a few hundred triggers. The seeder waits them out and has the last word — which is why `pnpm seed` takes about thirty seconds with functions running and about five without.

Set `NEXT_PUBLIC_USE_EMULATORS=1` in `.env.local` to point the app at the local emulators.

## Who can see the group

**Anyone with a Google account and the URL can sign in and read everything** — every season, its venue and street address, every kick-off time, the full squad, who has said they're playing, every score and every rating. There is no allowlist and no approval step. (Firebase Auth's _Authorized domains_ setting controls which domains may host the sign-in flow. It does not control who may sign in.)

That is a deliberate choice, not an oversight. Extras are the point: anyone in the group can forward the link to somebody to fill a gap, and that person has to be able to find the game and put their hand up without an admin being awake. An approval queue for a group this size costs more than it buys.

What it means in practice, so it can be reconsidered on purpose rather than discovered:

- The venue address and the exact time a named group of people will be standing there are visible to anyone signed in.
- A stranger signing in for the first time pushes every app admin — which is the intended alarm, and the reason `onUserCreated` exists.
- An extra still **cannot** affect a headcount. `isConfirmed` requires a season admin's nod, so nobody can push a game over its minimum and silence the "short of players" nudge.
- Nobody can read another person's contact details or push tokens. Addresses live in Firebase Auth and never touch Firestore; tokens are private to their owner. Those are the two things kept back, and the reasons are in `firestore.rules`.
- A season's subscribable calendar link (`getCalendarLink` in `backend/src/calendarLink.ts`) goes one step further than everything else on this list: it needs **no sign-in at all**. A calendar app polls it with a plain `GET`, so a 32-byte random token in the URL is the entire access check — whoever holds the link can read that season's kick-off times, venue and cancellations, same as anyone signed in can from the app itself, just without the Google sign-in first. Nothing else is in it: no roster, no scores, no ratings. A season admin can rotate the link from the admin screen, which invalidates every copy already handed out.

If this ever needs closing, the cheap version is an `approved` custom claim gating reads, mirroring how `admin` already works — free at the rules layer, because a claim is already in the token and costs no document read to check.

### Taking somebody off

There is no self-serve deletion, and `users/{uid}` is `allow delete: if false` on purpose — every roster renders names and avatars from those documents, so a missing one turns a squad list into a wall of "Unknown player". When somebody asks to be removed, run:

```sh
pnpm --filter backend forget-player alex@example.com --dry-run   # see the plan
pnpm --filter backend forget-player alex@example.com             # do it
```

It draws a line between data that is **about a person** and data that is a **shared record**:

- **Erased** — the Firebase Auth account and the address in it, their display name, avatar and device notes, every registered push token, and the free-text note on every response they wrote.
- **Kept** — the uid itself, wherever it appears in something more than one person took part in: `ratingLedger`, the generated lineups, the scoreboard's `updatedBy`, and the in/out of each response.
- **Reported, not touched** — any kit still recorded as theirs. Coming off the roster strands it, which the season's kit screen then flags; the script names it so somebody chases the ball, because reassigning it here would be guessing who has it and quietly guessing wrong is worse than a register that admits it doesn't know.

That second list is not stubbornness. The ledger is the undo history for the **whole** ladder — `replayRatingsFrom` rebuilds each game from the state the one before it left — so deleting one player's entries wouldn't only lose their history, it would corrupt every replay for everybody who ever played alongside them. What survives is an opaque id with nothing attached to it, which is the most that can be taken away without rewriting other people's results.

Idempotent, so a half-finished run can just be repeated, and it accepts a uid as well as an email for the case where the Auth account is already gone. If they were the only admin of a season it says so and leaves them on `adminUids` rather than orphaning it — appoint somebody else and re-run.

**App Check** is the separate half of this and _is_ enabled: it attests that a request came from this app rather than from a script holding the same public config. It restricts software, not people, so it changes none of the above — see setup step 10.

## Backups

Enabled on `footballfrescati` and needing nothing further day to day. Written down because the restore is the half nobody thinks about until they need it, and it does not work the way people assume.

|  |  |
| --- | --- |
| **Point-in-time recovery** | 7-day continuous window. Read the database as it was at any timestamp inside it. |
| **Daily backup** | kept 7 days |
| **Weekly backup** (Sunday) | kept 14 weeks |

The two cover different failures, which is why both are on. PITR is for *"I deleted a season an hour ago"* — precise, immediate, and useless once the week is up. The weekly is for *"`ratingLedger` has been quietly wrong since some point last month"*, which is the failure this database is genuinely exposed to: a replay bug corrupts history rather than losing it, nothing alarms, and by the time the table looks wrong every backup inside a 7-day window contains the same corruption. Fourteen weeks is how far back there is still something clean to compare against.

`ratingLedger` is the reason any of this exists. It is the undo history for the **whole** ladder — `replayRatingsFrom` rebuilds each game from the state the one before it left — so it cannot be reconstructed from the games, only the other way round.

### Restoring

**A restore creates a new database. It never writes over the live one.** There is no in-place rollback, so the shape of every recovery is: restore beside production, look at it, then move what's needed.

```sh
# What is there to restore from
gcloud firestore backups list --location=eur3 --project=footballfrescati

# Restore one into a NEW database, alongside the live one
gcloud firestore databases restore \
  --source-backup=projects/footballfrescati/locations/eur3/backups/BACKUP_ID \
  --destination-database=frescati-restore --project=footballfrescati
```

For PITR the equivalent is `gcloud firestore export --snapshot-time=<RFC3339 within the last 7 days>`, then import that export into a scratch database.

Either way you now have two databases and a decision. Copying documents back into `(default)` is a **write**, so every trigger fires on it: restoring old games re-runs `onGameWrite`, and restoring responses re-runs `onResponseWrite` and re-queues team rebuilds. For anything touching ratings, correct the scores and let `replayRatingsFrom` rebuild the ledger rather than pasting an old ledger back — a restored ledger disagrees with the first replay that follows it, which is the same rule as [Tournaments](#tournaments): fix an earned rating by fixing the scores behind it.

Both were enabled through the Firestore Admin API rather than `gcloud`, because the `firestore backups` commands need a far newer SDK than the one on this machine:

```sh
TOKEN=$(gcloud auth print-access-token)
DB=https://firestore.googleapis.com/v1/projects/footballfrescati/databases/%28default%29

curl -X PATCH "$DB?updateMask=pointInTimeRecoveryEnablement" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"pointInTimeRecoveryEnablement":"POINT_IN_TIME_RECOVERY_ENABLED"}'

curl -X POST "$DB/backupSchedules" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"retention":"604800s","dailyRecurrence":{}}'

curl -X POST "$DB/backupSchedules" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"retention":"8467200s","weeklyRecurrence":{"day":"SUNDAY"}}'
```

> **Delete protection is still off.** It is the one thing none of the above covers: deleting the database takes its backup schedules with it. Turn it on with `-d '{"deleteProtectionState":"DELETE_PROTECTION_ENABLED"}'` against `$DB?updateMask=deleteProtectionState`.

## Deployment

- **Both halves go out from the same workflow**, on push to `main` (`.github/workflows/ci.yml`), and neither starts until every suite that applies has passed: `deploy-backend` ships functions and rules, then `deploy-frontend` ships the bundle. They used to run on independent triggers — Actions for the backend, Vercel's own git integration for the frontend — which meant a commit whose backend tests failed still shipped its frontend, leaving the deployed pair mismatched with nothing to say so.

    `frontend/vercel.json` is what stops that second trigger, and it disables **only `main`**. Every other branch still deploys a preview the moment it is pushed, which is what the integration is genuinely good at; `pr.yml` is what gates the merge.

- **Frontend** → `deploy-frontend` runs `vercel deploy --prod`, which uploads the source and lets **Vercel** build it. The project settings still own everything about that build — root directory `frontend`, install command run from the repo root, and the `NEXT_PUBLIC_FIREBASE_*` vars (see `frontend/.env.local.example`) in the project's Environment Variables. CI decides *when* to deploy and nothing else.

    Building in CI instead — `vercel pull && vercel build --prod && vercel deploy --prebuilt`, which is the usual recipe — **does not work on this project**, and fails in the worst available way. Every production variable here is marked **Sensitive**, and `vercel pull` returns the literal string `[SENSITIVE]` for those rather than a value. The build then succeeds, reports nothing, and ships a bundle whose Firebase api key is `[SENSITIVE]` — an app that loads and cannot reach the database. Un-marking them would fix it, since all but `SENTRY_AUTH_TOKEN` are public values inlined into the client bundle anyway, but there is nothing to gain: a remote build reads them natively, keeps the one real credential somewhere CI never sees, and leaves a single build definition rather than a second copy in the workflow.

    `VERCEL_GIT_COMMIT_SHA` survives this route because the CLI reads the checkout's `.git` and stamps the deployment with the commit. That is what `/me` and the Sentry release are named after, so it is still worth opening **`/me`** after the first deploy through this path to confirm it shows a sha rather than a blank.

- **Functions and rules** → the `deploy-backend` job, which still only runs when `backend/`, `shared/` or `firestore.rules` moved. See setup step 9 above for the repo variables and the `GCP_SA_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets the two jobs need.
- The deploy is **non-interactive**, which makes two things hard requirements rather than conveniences: every `defineSecret` must already exist in Secret Manager, and every `defineString` must have a value in `backend/.env`. Neither falls back to a default — the deploy just fails. That is why `backend/.env` is committed and why `RESEND_API_KEY` has to exist even on a project sending no email.
- The **Content-Security-Policy still ships report-only.** Violations post to `/api/csp-report` and come out in Vercel's function logs (`vercel logs`, or the Logs tab, filtered on `CSP violation`). Watch those through a few days of real use — sign-in, notifications, the tournament screen — and once nothing legitimate is being reported, switch the header key in `frontend/next.config.js` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. `frame-ancestors` already enforces in its own header, because it is ignored in report-only mode.

## Notes for future work

- **No response document means "no response"** — a real third state. Never write a placeholder.
- The player screen (`/u/[uid]`) finds somebody's games with `where('positions.<uid>', '>=', 0)` on `ratingLedger`, which needs no index of its own because Firestore indexes every subfield of a map. Adding a single-field **exemption** for `positions` would break that query with nothing in the code to point at.
- `counts`, `atRisk` and `remindersSent` on a game are written **only** by Cloud Functions; rules reject client writes. Don't compute them on the client.
- Extras' confirmation is _derived_ (`isConfirmed`), not stored, so no trigger has to write back to the document it fires on. A season admin's override is the only stored part.
- Kickoffs are ISO 8601 UTC strings, resolved from wall-clock time in the season's timezone so a season spanning a DST change keeps the same local start time.
- `@firebase/app` is a direct dependency of `backend` even though nothing imports it — **don't remove it as unused**. `firebase-admin`'s RTDB module loads `@firebase/database-compat`, which declares `@firebase/app` as an _optional_ peer, so npm skips it. Locally pnpm's `auto-install-peers` hides this; Cloud Build runs npm, and the deployed container dies at startup with `Cannot find module '@firebase/app'`.
