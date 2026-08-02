# Frescati

Mobile-first PWA for running a recurring football group. A **season** defines a repeating slot (e.g. every Tuesday 19:00 at Frescati IP) and a date range; **games** are generated from it; players report **In / Out** for each game.

## UI Changes

- Mobile is the primary target. Design for a phone first, then make sure it still works on desktop.
- All UI changes must be responsive — always consider both mobile and desktop layouts across multiple screen dimensions.
- The app is permanently dark. Colours come from the CSS variables declared in `frontend/app/globals.css` (`@theme`) — never hardcode hex values in components.

## Running the app

- Do not start a dev server or run the app yourself. If you need to verify behavior, ask the user to check it (the user typically already has it running locally).

## Local environment gotchas

- The shell exports an `npm_config_registry` pointing at Spotify's artifactory, which overrides `.npmrc`. Prefix installs with `npm_config_registry=https://registry.npmjs.org/`.
- `firebase-tools` needs **JDK 21+** for the emulators, but the default `java` on this machine is 17. Run emulator commands with `JAVA_HOME=/usr/local/opt/openjdk@21`.
- `pnpm test` runs the pure `shared/` suites. `pnpm test:rules` runs the Firestore rules suite against the emulator — run it after **any** change to `firestore.rules`.

## Architecture

- **pnpm workspace**, one lockfile at the root. Packages: `frontend`, `backend`. `shared/` is a plain TS directory (no `package.json`) compiled into both — imported as `@shared/*` in the frontend and `../../shared/*` in the backend.
- **Frontend**: Next.js 15 App Router on Vercel. Reads and writes Firestore **directly** from the client; security rules are the authorization layer. Realtime everywhere via `onSnapshot`.
- **Backend**: Firebase Cloud Functions v2 (`nodejs24`, `europe-west1`). Only privileged work lives here — response counters, push notifications, scheduled reminders, admin claims. There is **no API layer**; do not add one without a reason.
- **Auth**: Google popup only. `admin` is a Firebase custom claim (global app admin). Per-season admins are `adminUids` on the season doc.

## Data model

```
users/{uid}                                  profile + notificationPrefs + rating (function-owned)
users/{uid}/pushTokens/{token}               FCM registration tokens
seasons/{seasonId}                           slot, venue, minPlayers, balance, memberUids[], adminUids[]
seasons/{seasonId}/games/{gameId}            kickoff, status, counts (function-owned), atRisk
seasons/{seasonId}/games/{gameId}/responses/{uid}   status: 'in'|'out', role: 'member'|'extra'
seasons/{seasonId}/games/{gameId}/tournament/teams  generated lineup (function-owned)
seasons/{seasonId}/games/{gameId}/tournament/result confirmed table + rating deltas (function-owned)
seasons/{seasonId}/games/{gameId}/matches/{order}   one scoreline; doc id is the fixture order
ratingLedger/{gameId}                        one entry per rated night (function-owned)
```

**No response document at all means "no response"** — that is a real third state, not a default. Never write a placeholder response doc.

`counts` and `atRisk` on the game doc are written **only** by the `onResponseWrite` Cloud Function. Security rules reject client writes to them. Don't compute them on the client.

## Tournaments

Nights of 8+ split into 2, 3 or 4 teams (`shared/tournament.ts`) and play a generated round robin. Squads differ by at most one player; the on-pitch side size is the smaller of the two squads meeting, with the larger rotating a sub through.

- **Ratings** are a global career Elo on `users/{uid}.rating`, shown as 0–100 via a fixed mapping (`shared/rating.ts`). A rating moves on how a team finished *versus how it was expected to*, not on raw position — with a working balancer, raw position is nearly noise. Unrated players seed at the live average of the season's rated members.
- **Teams** are picked by the pure, seeded `pickTeams` in `shared/optimizer.ts` and written **only** by the `rebuildTeams` function. Rules reject every client write to the teams doc — an admin reshuffles by bumping `reshuffleCount` on the game, never by writing a lineup.
- Rebuilds are **debounced through Cloud Tasks**: a response write bumps `teamsGeneration`, queues a task carrying it, and the handler drops itself if the generation has moved on. Kept out of `onResponseWrite` deliberately — the optimizer is the one part of the app whose cost grows with turnout.
- **Scores** live at `matches/{order}` where the id is the fixture's place in the running order, so two people scoring the same match write the same document. **No match document means "not played"** — same third state as a response, and for the same reason.
- Anyone holding a response on the game can write a score. Confirming the night (`resultFinalisedAt`) closes it to everyone but a season admin, whose correction triggers a **replay**: `replayRatingsFrom` rewinds the ledger latest-first and replays it in kickoff order. Adjusting only the corrected game would be wrong, because every game after it was rated against the ratings that game produced.
- Ratings apply on an admin's Confirm, or automatically `AUTO_FINALISE_HOURS` after kickoff via `finaliseDueTournaments`.

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
