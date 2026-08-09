# Frescati

Mobile-first PWA for running a recurring football group. A **season** defines a repeating slot (e.g. every Tuesday 19:00 at Frescati IP) and a date range; **games** are generated from it; players report **In / Out** for each one.

- **Members** are the season squad — no cap, always ranked first.
- **Extras** are any other signed-in user. They can put their hand up for any game and sit below the members, unless a season admin drops them.
- The headcount flexes (10, 15, 20 — whatever turns up). A season sets a **minimum**; below it a game reads "at risk", and the app derives the format from the count (14 → 7v7).

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

    **Then, to actually turn the fallback on:** push reaches nobody on an iPhone that was never added to the home screen, which in practice is most of the people who say they never get the reminders. Sign up at [resend.com](https://resend.com), verify the domain you'll send from, set the real key above, and fill in `backend/.env`:

    ```sh
    EMAIL_FROM=Frescati <notifications@your-domain.com>
    APP_URL=https://your-vercel-domain.com
    ```

    Both are `defineString` parameters rather than secrets, which is why they are committed — see the comments in that file. Deploy the functions afterwards; a secret is only bound into a function at deploy time.

    Check it by opening **You → Push debug** as an app admin on a device with notifications switched off: the send should report that it went to your email instead. **You → Notification status** says up front if no sender is configured.

9. Wire up GitHub Actions — without this, the `deploy` job in `ci.yml` fails on your first push to `main`:
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

10. **Set up App Check**, which is what keeps a script holding this project's public config out of a database every read of which is a plain signed-in read. See "Who can see the group" for what it does and doesn't cover.

    1. **Project settings → App Check → Apps →** your web app **→ reCAPTCHA Enterprise.** Register it, and put the **site key** in `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` — in `frontend/.env.local`, in Vercel's environment variables, and as a repo variable for CI. It is public, like every other `NEXT_PUBLIC_` value.
    2. Deploy the frontend and leave it alone for a few days. App Check starts in **monitoring** mode: tokens are collected and nothing is rejected. **Project settings → App Check → APIs** then shows the share of verified requests per service.
    3. Only once Firestore reads **and** Cloud Functions calls are showing ~100% verified, switch **Enforce** on, one service at a time.

    > Enforcing before that number is where it should be locks the live app out of Firestore, and the fix is a console change with no deploy behind it. Waiting costs nothing.

    For `pnpm dev:live` — a localhost dev server against the real project — reCAPTCHA has no domain it recognises, so requests go out unattested and will be rejected once enforcement is on. Run it once with the site key set, take the debug token the SDK logs to the browser console, register it under **App Check → Apps → Manage debug tokens**, and put it in `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN`. It is a standing exemption from the check, so it belongs in `.env.local` and nowhere near production.

    `pnpm dev:seeded` needs none of this: the emulators don't verify App Check tokens, and the client skips it entirely when pointed at them.

## Commands

|  |  |
| --- | --- |
| `pnpm dev:seeded` | **the whole local stack in one command** — emulators, seeded data, dev server |
| `pnpm dev:live` | dev server against the real Firebase project |
| `pnpm dev` | dev server against whatever `frontend/.env.local` says |
| `pnpm test` | pure domain tests (`shared/`) |
| `pnpm test:rules` | security rules against the Firestore emulator — **run after any `firestore.rules` change** |
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
| `pnpm seed --scenario=big`   | 26 members, four-team nights, a season of history                    |
| `pnpm seed --scenario=fresh` | day one: no history, no ratings, every empty state                   |
| `pnpm seed --list`           | what else is there                                                   |
| `pnpm seed --keep`           | seed alongside what's already there instead of wiping                |
| `pnpm seed --origin=…`       | if the app isn't on `localhost:3000` (avatars are served from it)    |

Scenarios live in `backend/scripts/seed/scenarios.ts` and are declarative — a season is an entry in a list, and a night that should be cancelled, at risk, played-but-unconfirmed or answered by nobody is a line in its `pins`. Everything is positioned relative to today, so a seed is as useful in six months as it is now.

The seeder never invents anything the app could work out for itself: counts come from `tallyResponses`, lineups from `pickTeams`, tables from `getStandings` and ratings from `getRatingChanges` — the same code the Cloud Functions run. Only the scorelines are made up, rolled from a hidden per-player strength that never reaches Firestore. So the seeded ladder is one the app could genuinely have produced, and replaying it reproduces it exactly.

`pnpm seed` writes `frontend/public/dev-users.json` and `frontend/public/dev-avatars/`; both are gitignored.

### What the emulators can't do

- **Cloud Tasks has no emulator.** `rebuildTeams` is normally queued; locally the same work runs in-process a couple of seconds after a response instead, so teams really do rebuild when you answer. See `enqueueTeamRebuild`.
- **Scheduled functions never fire** — the emulator skips them without pubsub. `finaliseDueTournaments` and `sendReminders` therefore do nothing locally; confirming a night by hand still works, since that path is a callable.
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

If this ever needs closing, the cheap version is an `approved` custom claim gating reads, mirroring how `admin` already works — free at the rules layer, because a claim is already in the token and costs no document read to check.

**App Check** is the separate half of this and _is_ enabled: it attests that a request came from this app rather than from a script holding the same public config. It restricts software, not people, so it changes none of the above — see setup step 10.

## Deployment

- **Frontend** → Vercel git integration. Set the same `NEXT_PUBLIC_FIREBASE_*` vars (see `frontend/.env.local.example`) in the Vercel project's Environment Variables. Root directory `frontend`, install command run from the repo root.
- **Functions and rules** → GitHub Actions on push to `main` (`.github/workflows/ci.yml`) — see setup step 9 above for the repo variables and `GCP_SA_KEY` secret it needs.
- The deploy is **non-interactive**, which makes two things hard requirements rather than conveniences: every `defineSecret` must already exist in Secret Manager, and every `defineString` must have a value in `backend/.env`. Neither falls back to a default — the deploy just fails. That is why `backend/.env` is committed and why `RESEND_API_KEY` has to exist even on a project sending no email.

## Notes for future work

- **No response document means "no response"** — a real third state. Never write a placeholder.
- `counts`, `atRisk` and `remindersSent` on a game are written **only** by Cloud Functions; rules reject client writes. Don't compute them on the client.
- Extras' confirmation is _derived_ (`isConfirmed`), not stored, so no trigger has to write back to the document it fires on. A season admin's override is the only stored part.
- Kickoffs are ISO 8601 UTC strings, resolved from wall-clock time in the season's timezone so a season spanning a DST change keeps the same local start time.
- `@firebase/app` is a direct dependency of `backend` even though nothing imports it — **don't remove it as unused**. `firebase-admin`'s RTDB module loads `@firebase/database-compat`, which declares `@firebase/app` as an _optional_ peer, so npm skips it. Locally pnpm's `auto-install-peers` hides this; Cloud Build runs npm, and the deployed container dies at startup with `Cannot find module '@firebase/app'`.
