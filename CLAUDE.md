# Frescati

Mobile-first PWA for running a recurring football group. A **season** defines a repeating slot (e.g. every Tuesday 19:00 at Frescati IP) and a date range; **games** are generated from it; players report **In / Out** for each game.

## UI Changes

- Mobile is the primary target. Design for a phone first, then make sure it still works on desktop.
- All UI changes must be responsive — always consider both mobile and desktop layouts across multiple screen dimensions.
- The app is permanently dark. Colours come from the CSS variables declared in `frontend/app/globals.css` (`@theme`) — never hardcode hex values in components.

## Running the app

- Do not start a dev server or run the app yourself. If you need to verify behavior, ask the user to check it (the user typically already has it running locally).
- `pnpm dev:seeded` is the whole local stack in one command (emulators + seed + dev server); `pnpm dev:live` is the same against the real project. Both set `NEXT_PUBLIC_USE_EMULATORS` themselves, so `frontend/.env.local` should be left alone.
- Local data comes from `pnpm seed`, which fills the running emulators from a scenario in `backend/scripts/seed/scenarios.ts`. Nothing is mocked — real rules, real triggers. Adding a case worth looking at means adding a season or a `pins` entry there, not writing Firestore by hand.
- The seeder derives everything it can from `shared/` (`tallyResponses`, `pickTeams`, `getStandings`, `getRatingChanges`) so seeded data is exactly what the functions would have produced. Only scorelines are invented. Keep it that way — a hand-written rating column disagrees with the first replay.
- Seeded seasons carry a per-run id suffix. Deleting a season fires a cascade that can still be running a minute later, and stable ids meant it deleted the next seed's data.
- `NEXT_PUBLIC_USE_EMULATORS=1` also turns on the dev user switcher (`DevUserSwitcher`), which signs in as any seeded player without Google.

## Local environment gotchas

- The shell exports an `npm_config_registry` pointing at Spotify's artifactory, which overrides `.npmrc`. Prefix installs with `npm_config_registry=https://registry.npmjs.org/`.
- `firebase-tools` needs **JDK 21+** and the default `java` here is 17. `scripts/emulators.sh` finds a newer one, and every emulator script goes through it — so no `JAVA_HOME` prefix is needed. A raw `firebase emulators:*` still does.
- `pnpm test` runs the pure `shared/` suites **and nothing else** — green there says nothing about the frontend, the rules or the functions. `pnpm test:all` runs all four; it needs ports 8080/9099, so stop `dev:seeded` first. `pnpm test:rules` after **any** change to `firestore.rules`, `pnpm test:backend` after any change under `backend/src`.

## Architecture

- **pnpm workspace**, one lockfile at the root. Packages: `frontend`, `backend`. `shared/` is a plain TS directory (no `package.json`) compiled into both — imported as `@shared/*` in the frontend and `../../shared/*` in the backend.
- **Frontend**: Next.js 15 App Router on Vercel. Reads and writes Firestore **directly** from the client; security rules are the authorization layer. Realtime everywhere via `onSnapshot`.
- **Backend**: Firebase Cloud Functions v2 (`nodejs24`, `europe-west1`). Only privileged work lives here — response counters, push notifications, scheduled reminders, admin claims. There is **no API layer**; do not add one without a reason. The single route handler, `app/api/csp-report`, is not one: it logs a browser's CSP violation report and answers 204, reading and authorizing nothing.
- **Auth**: Google popup only. `admin` is a Firebase custom claim (global app admin). Per-season admins are `adminUids` on the season doc.
- **Anyone signed in can read everything** — there is no allowlist and no approval step, deliberately, because extras have to be able to find a game and put their hand up. Don't "fix" it without reading "Who can see the group" in the README first; the trade-offs are written down there. Two things are held back regardless: email addresses (Firebase Auth only) and push tokens (private to their owner).
- **App Check** attests requests come from the real app rather than a script holding the same public config. Every route into Firebase goes through `frontend/lib/firebaseClient.ts`, which starts it lazily — that is why `app` is not exported and `getFirebaseApp()` is, so nothing can reach a service without it.

## Data model

```
users/{uid}                                  profile + notificationPrefs + client + rating (function-owned)
users/{uid}/pushTokens/{token}               FCM registration tokens — private to their owner
seasons/{seasonId}                           slot, venue, minPlayers, balance, memberUids[], adminUids[]
seasons/{seasonId}/games/{gameId}            kickoff, status, counts (function-owned), atRisk
seasons/{seasonId}/games/{gameId}/responses/{uid}   status: 'in'|'out', role: 'member'|'extra'
seasons/{seasonId}/games/{gameId}/tournament/teams  generated lineup (function-owned)
seasons/{seasonId}/games/{gameId}/tournament/result confirmed table + rating deltas (function-owned)
seasons/{seasonId}/games/{gameId}/matches/{order}   one scoreline; doc id is the fixture order
ratingLedger/{gameId}                        one entry per rated game (function-owned)
```

**No response document at all means "no response"** — that is a real third state, not a default. Never write a placeholder response doc.

`counts` and `atRisk` on the game doc are written **only** by the `onResponseWrite` Cloud Function. Security rules reject client writes to them. Don't compute them on the client.

## Tournaments

Games of 8+ split into 2, 3 or 4 teams (`shared/tournament.ts`) and play a generated round robin. Squads differ by at most one player; the on-pitch side size is the smaller of the two squads meeting, with the larger rotating a sub through.

- **Ratings** are a global career Elo on `users/{uid}.rating`, shown as 0–100 via a fixed mapping (`shared/rating.ts`). A rating moves on how a team finished _versus how it was expected to_, not on raw position — with a working balancer, raw position is nearly noise. Unrated players seed at the live average of the season's rated members.
- A **starting rating** is an app admin's estimate of somebody who hasn't played yet, set from `/admin/ratings` through the `setStartingRating` callable. It stores a real rating on `games: 0`, so `hasPlayed` rather than the presence of the field is what "the ladder has had its say" means — the balancer uses it from their first game, the all-time ladder leaves them off, and the provisional K-factor still moves them fast. **Only settable before their first rated game**, and not by taste: every ledger entry records what each player carried into that game, so overwriting an earned rating would be silently undone by the next replay. Fix an earned rating by fixing the scores behind it.
- **Teams** are picked by the pure, seeded `pickTeams` in `shared/optimizer.ts` and written **only** by the `rebuildTeams` function. Rules reject every client write to the teams doc — an admin reshuffles by bumping `reshuffleCount` on the game, never by writing a lineup.
- Rebuilds are **debounced through Cloud Tasks**: a response write bumps `teamsGeneration`, queues a task carrying it, and the handler drops itself if the generation has moved on. Kept out of `onResponseWrite` deliberately — the optimizer is the one part of the app whose cost grows with turnout. Cloud Tasks has no emulator, so locally `enqueueTeamRebuild` runs `runTeamRebuild` in-process instead. A confirmed game's lineup is never rebuilt — the ledger was computed against it and a replay reads it back.
- **Scores** live at `matches/{order}` where the id is the fixture's place in the running order, so two people scoring the same match write the same document. **No match document means "not played"** — same third state as a response, and for the same reason.
- Anyone holding a response on the game can write a score. Confirming the game (`resultFinalisedAt`) closes it to everyone but a season admin, whose correction triggers a **replay**: `replayRatingsFrom` rewinds the ledger latest-first and replays it in kickoff order. Adjusting only the corrected game would be wrong, because every game after it was rated against the ratings that game produced.
- Ratings apply on an admin's Confirm, or automatically `AUTO_FINALISE_HOURS` after kickoff via `finaliseDueTournaments`.

## Notifications

- A push reaches somebody only if all three line up: a **registered device**, the **preference** for that kind switched on, and — on iPhone only — the app **installed** to the home screen, which is the one Safari allows push from at all. `getPushReach` in `shared/notifications.ts` is that rule in one place; a missing preference means opted in, matching `resolveRecipients` on the backend.
- **Email is a fallback, never a second channel.** `sendPush` emails exactly the people it reached no device for — none registered, or every token dead — and never somebody a push got to, per person rather than per token. The per-kind preferences gate it first, so an opt-out can't be routed around by turning off push; `emailFallback` on the profile switches the channel off entirely. `canEmail` is that rule in one place.
- Nothing is composed for email. `buildEmail` takes the `PushPayload` the trigger already built, so there is one wording per notification and no second copy to keep in step.
- Addresses live in **Firebase Auth only** and are read there with the Admin SDK. `users/{uid}` is readable by every signed-in player, so a mirrored address would be a group-wide address book — see `scripts/stripUserEmails.ts`. The admin screen learns whether somebody _has_ an address, never what it is.
- The transport is Resend, behind a `RESEND_API_KEY` secret with `EMAIL_FROM`/`APP_URL` in `backend/.env`. Unconfigured it is inert, and in the emulator it logs instead of sending. **The secret must exist in Secret Manager or every functions deploy fails** — CI deploys non-interactively, where a missing secret is an error rather than a prompt.
- The admin debug screen (`/debug`) has two send paths, both app-admin-only: `sendTestPush` always sends to `request.auth.uid` and nobody else — deliberately, so it can't become a way to notify somebody else. `sendTestEmail` is the one exception, emailing a chosen set of real accounts through the real `sendEmail` transport; it shares `buildTestPayload`/`buildTestContext` with `sendTestPush` so the two can't drift into testing different copy, and it skips the per-kind preference (an admin picking a person and a kind is a one-off decision, not the automated send that preference silences) while still honouring `emailFallback` and requiring a verified address.
- `users/{uid}.client` records the platform somebody last signed in on and the last time they opened it installed. Self-written on every sign-in. `lastStandaloneAt` only moves **forward** — opening a link in a browser tab must not read as an uninstall, and an uninstall can't be observed at all.
- Push tokens stay private to their owner: a token is a capability to push to that device. The admin screen gets them through the `getPushDevices` callable, which strips the token and returns platform, browser and registration date. Don't relax the rule instead — it would hand every admin a working send-anything credential for every phone in the group.

## Members vs extras

- A **member** is on `season.memberUids`. Members have no cap and always rank first.
- An **extra** is any other signed-in user. Extras can respond to any game but always sort below members and carry a `confirmed` flag (auto-set in signup order by the trigger, overridable by a season admin).
- `role` is snapshotted on the response document and validated in security rules against actual membership at write time.

## Conventions

- Arrow-function components with a `default export` at the bottom. Props typed inline in the destructuring position — no `React.FC`, no separate `Props` interface unless it's genuinely shared.
- `import type` is enforced by eslint (`@typescript-eslint/consistent-type-imports`).
- Use the `classNames(...)` helper in `frontend/lib/utils/reactHelper.ts` for conditional classes — not clsx/cva.
- Prettier: tabs, width 4, printWidth 120, single quotes (including JSX), `arrowParens: avoid`.
- Pure domain logic (dates, game state, sorting) belongs in `shared/` with unit tests — not in components.
