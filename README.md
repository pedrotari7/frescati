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

8. Wire up GitHub Actions — without this, the `deploy` job in `ci.yml` fails on your first push to `main`:
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
          roles/cloudtasks.admin roles/cloudscheduler.admin
        do
          gcloud projects add-iam-policy-binding $PROJECT \
            --member="serviceAccount:${SA_EMAIL}" --role="$ROLE"
        done

        gcloud iam service-accounts keys create sa-key.json --project=$PROJECT \
          --iam-account=$SA_EMAIL
        ```

        Paste `sa-key.json`'s contents into the `GCP_SA_KEY` secret, then delete the local file — gen2 functions deploy through Cloud Build, Artifact Registry and Cloud Run, so `firebase.admin` alone isn't enough. `cloudtasks.admin` and `cloudscheduler.admin` are needed too: `rebuildTeams` upserts its Cloud Tasks queue and `finaliseDueTournaments`/`sendReminders` upsert their Cloud Scheduler jobs on every deploy.

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
- Seeding while the Functions emulator is up sets off a few hundred triggers. The seeder waits them out and has the last word — which is why `pnpm seed` takes about thirty seconds with functions running and about five without.

Set `NEXT_PUBLIC_USE_EMULATORS=1` in `.env.local` to point the app at the local emulators.

## Deployment

- **Frontend** → Vercel git integration. Set the same `NEXT_PUBLIC_FIREBASE_*` vars (see `frontend/.env.local.example`) in the Vercel project's Environment Variables. Root directory `frontend`, install command run from the repo root.
- **Functions and rules** → GitHub Actions on push to `main` (`.github/workflows/ci.yml`) — see setup step 8 above for the repo variables and `GCP_SA_KEY` secret it needs.

## Notes for future work

- **No response document means "no response"** — a real third state. Never write a placeholder.
- `counts`, `atRisk` and `remindersSent` on a game are written **only** by Cloud Functions; rules reject client writes. Don't compute them on the client.
- Extras' confirmation is _derived_ (`isConfirmed`), not stored, so no trigger has to write back to the document it fires on. A season admin's override is the only stored part.
- Kickoffs are ISO 8601 UTC strings, resolved from wall-clock time in the season's timezone so a season spanning a DST change keeps the same local start time.
- `@firebase/app` is a direct dependency of `backend` even though nothing imports it — **don't remove it as unused**. `firebase-admin`'s RTDB module loads `@firebase/database-compat`, which declares `@firebase/app` as an _optional_ peer, so npm skips it. Locally pnpm's `auto-install-peers` hides this; Cloud Build runs npm, and the deployed container dies at startup with `Cannot find module '@firebase/app'`.
