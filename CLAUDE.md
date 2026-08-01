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
users/{uid}                                  profile + notificationPrefs
users/{uid}/pushTokens/{token}               FCM registration tokens
seasons/{seasonId}                           slot, venue, minPlayers, memberUids[], adminUids[]
seasons/{seasonId}/games/{gameId}            kickoff, status, counts (function-owned), atRisk
seasons/{seasonId}/games/{gameId}/responses/{uid}   status: 'in'|'out', role: 'member'|'extra'
```

**No response document at all means "no response"** — that is a real third state, not a default. Never write a placeholder response doc.

`counts` and `atRisk` on the game doc are written **only** by the `onResponseWrite` Cloud Function. Security rules reject client writes to them. Don't compute them on the client.

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
