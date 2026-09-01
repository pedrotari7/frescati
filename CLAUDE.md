# Frescati

Mobile-first PWA for running a recurring football group. A **season** defines a repeating slot (e.g. every Tuesday 19:00 at Frescati IP) and a date range; **games** are generated from it; players report **In / Out** for each game.

## UI Changes

- Mobile is the primary target. Design for a phone first, then make sure it still works on desktop.
- All UI changes must be responsive. Always consider both mobile and desktop layouts across multiple screen dimensions.
- The app is permanently dark. Colours come from the CSS variables declared in `frontend/app/globals.css` (`@theme`). Never hardcode hex values in components.
- **The back chevron goes back; `backHref` is only where it goes when there is no back.** A screen declares its parent, and `AppHistory`, a trail of the paths this document has walked, above the season route in `(app)/layout.tsx`, decides which of the two the chevron means. Up is the right answer only for an arrival with nothing behind it: a notification tap, a pasted link, the first screen of the installed app. It is the wrong answer for a screen reached from one of the several places that lead to it, which is why a player's profile opened off a game's roster used to land you back on the season page. The counting is biased on purpose: a push is counted only when `history.length` grew, so a `router.replace` counts as no step at all, and the failure mode is falling back to `backHref` rather than a `router.back()` that walks out of the app.
- **A new screen that sits below a tab needs a `backHref`, on every one of its loading and error branches too.** A tab root, the season home, Squad, `/me` in a season, has none, because the tabs are how you leave it. Everything else is somebody's child.
- **The chevron is drawn on desktop as well**, because the tabs lead to four places and none of them is the screen you came from, and an installed desktop window has no browser Back to fall back on. Above `lg` the tabs live in the top bar, so a screen without a `backHref` holds the slot open rather than letting them slide sideways. `e2e/nav.spec.ts` covers both, since a media query is invisible to a jsdom render.

## Running the app

- Do not start a dev server or run the app yourself. If you need to verify behavior, ask the user to check it (the user typically already has it running locally).
- **`pnpm test:e2e` is the exception, and it is the recommended way to check a journey end to end.** It is a test command, not a dev server: Playwright's `webServer` runs `pnpm dev:e2e`: `scripts/e2e-stack.sh`, which starts a production `next build` in the background, compiles the backend, then boots every emulator, seeds a real scenario, waits out whatever is left of that build and serves it with `next start`. The whole thing is torn down on exit. Run it rather than pushing and waiting on CI. Things to know before starting one: **check port 3000 is free first**, because `reuseExistingServer: !CI` means an already-running `dev:seeded` gets silently reused, skipping the fresh seed and pointing the tests at the user's live working data; a clean run **wipes and reseeds the emulators** and rewrites `frontend/public/dev-users.json`; and `--project=mobile` is the quick first pass. Teardown does not always take the Firestore emulator with it, the `java` process can outlive the run still holding 8080, and the next run dies with "Could not start Firestore Emulator, port taken". Check the port before blaming the change you just made.
- **It serves the built app, not `next dev`, and that is load-bearing twice over.** `next dev` compiled each route the first time a test opened it, so the suite stalled in front of every screen it visited and then re-rendered each one through webpack's eval'd modules, about as long compiling as testing. It is also the more honest thing to run: `next.config.js` says out loud that a dev server is a materially different app from the one that ships, and this is the one suite whose job is to check the halves meet. The catch is that a faster app finds races the slow one hid: the kit handover test picked a squad member **by position** out of a list that re-sorts when the profiles subscription lands, and started handing the ball to whoever sorted first. Anything reading a name out of a list and then clicking it has to click **that person**, not that row.
- **The spec files run in parallel and the two viewports do not.** `workers: 7` with `fullyParallel: false` gives each file a worker and keeps the tests inside it in order, which is what they expect, they hand state to each other on purpose. The files themselves are disjoint (responses on the next game, the kit register, the scoreline and vote on a played one, the dues of two seasons, one season's receipts, and two that write nothing at all: the admin calendar and the way back out of a screen), so they can overlap. The viewports cannot: they run the _same_ specs against the _same_ seeded database, so `desktop` declares `dependencies: ['mobile']`. Two consequences: asking for `--project=desktop` runs mobile first, and a red mobile leaves desktop reported as never run.
- **The suite is three shared files and a spec per journey.** `e2e/fixtures.ts` is who you are: the seeded cast read off `dev-users.json` and the switcher that signs you in as one of them; `e2e/locators.ts` is what a screen is made of, the selectors and URL patterns more than one spec has to agree about; `e2e/helpers.ts` is how you get from one screen to the next. Anything used by exactly one spec stays in that spec. The point of the split is that each of those locators has already been got wrong once, a duplicated one is a fix that lands in a single copy and leaves the other two stale.
- `pnpm dev:seeded` is the whole local stack in one command (emulators + seed + dev server); `pnpm dev:live` is the same against the real project. Both set `NEXT_PUBLIC_USE_EMULATORS` themselves, so `frontend/.env.local` should be left alone.
- Local data comes from `pnpm seed`, which fills the running emulators from a scenario in `backend/scripts/seed/scenarios.ts`. Nothing is mocked: real rules, real triggers. Adding a case worth looking at means adding a season or a `pins` entry there, not writing Firestore by hand.
- The seeder derives everything it can from `shared/` (`tallyResponses`, `pickTeams`, `getStandings`, `getRatingChanges`) so seeded data is exactly what the functions would have produced. Only scorelines are invented. Keep it that way, a hand-written rating column disagrees with the first replay.
- Seeded seasons carry a per-run id suffix. Deleting a season fires a cascade that can still be running a minute later, and stable ids meant it deleted the next seed's data.
- `NEXT_PUBLIC_USE_EMULATORS=1` also turns on the dev user switcher (`DevUserSwitcher`), which signs in as any seeded player without Google.

## Local environment gotchas

- The shell exports an `npm_config_registry` pointing at Spotify's artifactory, which overrides `.npmrc`. Prefix installs with `npm_config_registry=https://registry.npmjs.org/`.
- `firebase-tools` needs **JDK 21+** and the default `java` here is 17. `scripts/emulators.sh` finds a newer one, and every emulator script goes through it, so no `JAVA_HOME` prefix is needed. A raw `firebase emulators:*` still does.
- `pnpm seed` **transpiles rather than typechecks** (`ts-node --transpile-only`), because it sits in front of every `dev:seeded` and every e2e run and `backend/tsconfig.json` excludes `scripts/` from the build. `pnpm --filter backend typecheck:scripts` is where `backend/scripts` gets checked, once, in the backend CI job, the other scripts there still run through a checking `ts-node`, since nobody is waiting on a backfill.
- `pnpm test` runs the pure `shared/` suites **and nothing else**. Green there says nothing about the frontend, the rules or the functions. `pnpm test:all` runs all four; it needs ports 8080/9099, so stop `dev:seeded` first. It does **not** include `pnpm test:e2e`, which is deliberately separate because it starts and stops its own stack, see "Running the app". `pnpm test:rules` after **any** change to `firestore.rules` or `storage.rules`, it runs both rulesets against the Firestore and Storage emulators together, which is what the receipts' cross-service rule needs. `pnpm test:backend` after any change under `backend/src`.

## Architecture

- **pnpm workspace**, one lockfile at the root. Packages: `frontend`, `backend`. `shared/` is a plain TS directory (no `package.json`) compiled into both, imported as `@shared/*` in the frontend and `../../shared/*` in the backend.
- **Frontend**: Next.js 15 App Router on Vercel. Reads and writes Firestore **directly** from the client; security rules are the authorization layer. Realtime everywhere via `onSnapshot`. The one thing that is not a document is a season's receipts, which are files in Cloud Storage read and written the same way, directly, with `storage.rules` as their authorization layer.
- **Backend**: Firebase Cloud Functions v2 (`nodejs24`, `europe-west1`). Only privileged work lives here: response counters, push notifications, scheduled reminders, admin claims. There is **no API layer**; do not add one without a reason. The single route handler, `app/api/csp-report`, is not one: it logs a browser's CSP violation report and answers 204, reading and authorizing nothing.
- **Auth**: Google popup only. `admin` is a Firebase custom claim (global app admin). Per-season admins are `adminUids` on the season doc.
- **Anyone signed in can read everything**: there is no allowlist and no approval step, deliberately, because extras have to be able to find a game and put their hand up. Don't "fix" it without reading "Who can see the group" in the README first; the trade-offs are written down there. Two things are held back regardless: email addresses (Firebase Auth only) and push tokens (private to their owner).
- **App Check** attests requests come from the real app rather than a script holding the same public config. Every route into Firebase goes through `frontend/lib/firebaseClient.ts`, which starts it lazily, that is why `app` is not exported and `getFirebaseApp()` is, so nothing can reach a service without it.

## Data model

```
users/{uid}                                  profile + notificationPrefs + client + rating (function-owned)
users/{uid}/pushTokens/{token}               FCM registration tokens, private to their owner
seasons/{seasonId}                           slot, venue, minPlayers, balance, fees, memberUids[], adminUids[]
seasons/{seasonId}/kit/{itemId}              a ball, the vests: name, kind, holderUid
seasons/{seasonId}/dues/{dueId}              one charge: uid, kind, amount, status. Id is derived
seasons/{seasonId}/debtors/{uid}             owes this season money (function-owned). Existence is the test
seasons/{seasonId}/expenses/{expenseId}      what the extras' money bought
seasons/{seasonId}/receipts/{receiptId}      the season's paperwork: name, contentType, size. The file is in Cloud Storage
seasons/{seasonId}/games/{gameId}            kickoff, status, counts (function-owned), atRisk
seasons/{seasonId}/games/{gameId}/responses/{uid}   status: 'in'|'out', role: 'member'|'extra', absent?
seasons/{seasonId}/games/{gameId}/watchers/{uid}    following this game, private to its owner
seasons/{seasonId}/games/{gameId}/tournament/teams  generated lineup (function-owned)
seasons/{seasonId}/games/{gameId}/tournament/result confirmed table + rating deltas (function-owned)
seasons/{seasonId}/games/{gameId}/tournament/motm   counted man-of-the-match vote (function-owned)
seasons/{seasonId}/games/{gameId}/motmVotes/{uid}   one vote, private to its owner
seasons/{seasonId}/games/{gameId}/matches/{order}   one scoreline; doc id is the fixture order
ratingLedger/{gameId}                        one entry per rated game (function-owned)
```

**No response document at all means "no response"**, that is a real third state, not a default. Never write a placeholder response doc.

`counts` and `atRisk` on the game doc are written **only** by the `onResponseWrite` Cloud Function. Security rules reject client writes to them. Don't compute them on the client.

## Feature docs

Each of these is deep and specific to one part of the app, deliberately kept out of this file. Read the one that covers whatever the task touches; don't load them all by default.

- `docs/teams.md` — how squads are built and resized (`MAX_SIDE`, `pickTeams`), and the two hand edits an admin has (`setPlayerTeam`, `setTeamLetter`, reshuffling).
- `docs/ratings.md` — the Elo formula (`shared/rating.ts`), what a replay is and when one is needed, starting ratings, and what the ledger stores per entry.
- `docs/scoring-and-motm.md` — entering a scoreline, confirming a result and what that locks, the man-of-the-match vote.
- `docs/no-show.md` — the `absent` flag: what it means, who can set it, where it shows.
- `docs/kit.md` — the kit register (`seasons/{id}/kit`): coverage, handovers, who can edit what.
- `docs/finances.md` — the season's books (`seasons/{id}/dues`, `seasons/{id}/expenses`, `seasons/{id}/receipts`): the fees on the season, why a charge is a stored document, the sweep that raises the missing ones, paying by Swish, the lock an unpaid charge puts on signing up for another game, chasing the people it caught, and the receipts a player claims their friskvardsbidrag with, which are the one thing here that is a file in Cloud Storage rather than a document.
- `docs/notifications.md` — push/email: reach, per-kind preferences, routing a tap to an open window, the `/debug` send paths.
- `docs/error-reporting.md` — the Sentry wiring: what gets reported and from where, the scheduled-sweep monitors, `/debug`'s self-tests.
- `docs/members-vs-extras.md` — member vs extra, and what an extra's In actually does before an admin confirms it.

## Conventions

- **Run the `unslop` skill over any prose you write here, before you commit it.** That covers every kind of free text in the app: UI copy, notification and email wording, error messages, JSDoc, inline comments, test names. The house style is plain, specific and opinionated, and the one tell it keeps drifting back towards is the em dash. That mark gets used for apposition, causation, contrast and afterthought all at once, so it says nothing about which of them is meant. Use a full stop or a comma and let the sentence carry the join. Straight quotes and `&apos;`, never curly. Sentence case in headings, no decorative emoji, and no bold label that only restates the line after it.
- Arrow-function components with a `default export` at the bottom. Props typed inline in the destructuring position, no `React.FC`, no separate `Props` interface unless it's genuinely shared.
- `import type` is enforced by eslint (`@typescript-eslint/consistent-type-imports`).
- Use the `classNames(...)` helper in `frontend/lib/utils/reactHelper.ts` for conditional classes, not clsx/cva.
- Prettier: tabs, width 4, printWidth 120, single quotes (including JSX), `arrowParens: avoid`.
- Pure domain logic (dates, game state, sorting) belongs in `shared/` with unit tests, not in components.
