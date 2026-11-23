# Season recap implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-of-season story of slides at `/s/{id}/recap`. It takes over the season home for anybody who played, until they reach the last slide, and a notification tells them it is ready.

**Architecture:** A pure `getSeasonRecap` in `shared/recap.ts` does every calculation. A one-shot `useSeasonRecap` hook feeds it from Firestore. The backend decides when a season is ready. `announceRecapIfReady`, run from `finaliseGame` and from a game being cancelled, stamps `season.recapReadyAt` once and sends `recapReady`. A `useRecapTakeover` hook, modelled on `useLiveGameRedirect`, reads that stamp and sends players to the route. Watching to the end writes `users/{uid}.recapsWatched`.

**Tech Stack:** Next.js 15 App Router, Firestore client SDK, StyleX, Vitest, Playwright, the Firestore rules emulator.

**Spec:** `docs/superpowers/specs/2026-11-23-season-recap-design.md`

## Global constraints

- Use tokens from `frontend/app/tokens.stylex.ts` and never hardcode hex values. Use StyleX `stylex.create` and `stylex.props`, with no class helpers. Every hover goes inside `bp.hover`.
- Components are arrow functions with a default export at the bottom and props typed inline. Use `import type` for types.
- Run the `unslop` skill over every piece of UI copy, comment and test name before committing. No em dashes, straight quotes, sentence case.
- Unpaid dues and money never appear in the recap.
- Wooden spoon floor: **3 appearances**. Last-minute Lucy window: **24 hours** before kickoff, from `updatedAt`.
- Nemesis needs **at least 2** games against each other.
- Ties are shared: an award carries every uid level on the best value. An award nobody qualifies for is `null` and its slide is skipped.
- A preview (`?preview=1`, app admins only) never writes `recapsWatched`.
- `recapReady` has no preference switch (`NOTIFICATION_PREF.recapReady = null`). Its tag is `recap-{seasonId}`, its URL is `/s/{id}/recap`, and it is not respondable. It goes to everybody in the season's ledger `positions`.
- `recapReadyAt` is written only by functions and the backfill or seed scripts, and is frozen against client writes.
- Each commit has to pass the fallow gate (`pnpm fallow`), with no function over cyclomatic 20 or cognitive 15 and zero duplication. Before each commit also run `pnpm typecheck` and `pnpm format:check`.

## Review focus

1. **Two confirmations racing for the last game.** The hourly `finaliseDueTournaments` sweep and an admin's confirm can both land at the end of a season. The stamp is a transaction that only the winner gets to write, and only the winner sends. A later rating replay rewrites ledger entries but never re-announces, because the stamp is already there. Task 4 tests a second call sending nothing.
2. **A season with zero games that count**, or one where every game was cancelled, is never finished. The backend never stamps it, so nothing redirects and nothing is sent. Task 1 tests `isSeasonFinished` for this, and Task 4 tests that cancelling every game sends nothing.
3. **Entries without a `teams` map** (from before the backfill) must not crash "Your people". `getPlayerLinks` already skips them, and `bestTeammate` and `nemesis` come out `null`. Task 3 tests this.
4. **A viewer who isn't in the table** opening `?player=` for somebody who is, or a `?player=` uid that never played, gets the club slides only, with no crash and no watched write. Task 5 tests this.
5. **Back from the recap** after the takeover must land on the season home and stay there. Use `replace` plus the `recapsWatched` check, and a once-per-session mark like `useLiveGameRedirect`'s, so closing early doesn't bounce you straight back into the recap within the same session. Task 6 tests this.

---

### Task 1: `isSeasonFinished` and the club numbers

**Files:**

- Create: `shared/recap.ts`
- Test: `shared/recap.test.ts`

**Interfaces:**

- Consumes: `getSeasonTable`, `SeasonRow` (`shared/leaderboard.ts`); `seasonExtras`, `SeasonResponses` (`shared/availability.ts`); `Game`, `RatingLedgerEntry`, `TournamentMatch`, `TournamentMotm` (`shared/types.ts`).
- Produces:

```ts
export const SPOON_MIN_APPEARANCES = 3;
export const LAST_MINUTE_HOURS = 24;
export const NEMESIS_MIN_GAMES = 2;

export interface RecapInput {
	seasonId: string;
	memberUids: string[];
	games: Game[];
	entries: RatingLedgerEntry[];
	responses: SeasonResponses;
	/** Counted votes by game id. A game whose vote isn't counted has no key. */
	motm: Record<string, TournamentMotm>;
	/** Scorelines by game id. */
	matches: Record<string, TournamentMatch[]>;
}

export interface Award { uids: string[]; value: number }
export interface MatchHighlight { gameId: string; kickoff: string; match: TournamentMatch }

export interface ClubRecap {
	gamesPlayed: number;
	totalGoals: number;
	/** Mean appearances per rated game, rounded to one decimal. */
	averageTurnout: number;
	players: number;
	extras: number;
	/** Table rows with `position <= 2`. */
	podium: SeasonRow[];
	highestScoring: MatchHighlight | null;
	biggestWin: MatchHighlight | null;
	/** Smallest non-zero margin. */
	closestFinish: MatchHighlight | null;
	bestTurnout: { gameId: string; kickoff: string; turnout: number } | null;
}

export const isSeasonFinished = (games: Pick<Game, 'id' | 'status' | 'endsAt'>[], entries: Pick<RatingLedgerEntry, 'gameId'>[], nowIso: string): boolean;
export const getClubRecap = (input: RecapInput): ClubRecap;
/** Helper shared by tasks 2 and 3: the award for the largest value, with ties shared, or null when no value is above `floor`. */
export const topAward = (values: Map<string, number>, floor?: number): Award | null;
```

- [ ] **Step 1: Write the failing tests** in `shared/recap.test.ts`. Build fixtures with a small local `entry(gameId, kickoffMillis, positions, teams?)` builder and a `game(id, status, endsAt)` builder.
    - `isSeasonFinished`: it is true when every non-cancelled game has `endsAt <= now` and a ledger entry. It is false when one game has ended without an entry, and false when a game is still to come. A cancelled game with no entry still counts as finished. It is false with `[]` games, and false when every game is cancelled.
    - `getClubRecap`:
        - `gamesPlayed` equals the entry count.
        - `totalGoals` sums `scoreA + scoreB` across every match.
        - `players` is the distinct uids across `positions`.
        - `extras` equals `seasonExtras(memberUids, responses).filter(uid => appeared)`.
        - `podium` keeps tied rows. With two rows at `position: 0`, it returns both plus the next row at `position: 2`.
        - `closestFinish` skips 2–2 and picks 3–2 over 4–1.
        - Everything is `null` and zeroed for empty input.
    - `topAward`: ties give both uids, an empty map gives `null`, and values `<= floor` (default `0`) give `null`.
- [ ] **Step 2: Run `pnpm vitest run shared/recap.test.ts`.** Expected: FAIL, because the module isn't found.
- [ ] **Step 3: Implement the four exports in `shared/recap.ts`.** `podium` comes from `getSeasonTable(entries, seasonId)` with `position <= 2`. Each highlight is its own small function over a flattened `{gameId, kickoff, match}[]`, sorted by kickoff so ties break on the earliest.
- [ ] **Step 4: Run `pnpm vitest run shared/recap.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit:** `git add shared/recap.* && git commit -m "Work out when a season is over and what the club did in it"`

### Task 2: Awards and banter

**Files:**

- Modify: `shared/recap.ts`, `shared/recap.test.ts`

**Interfaces:**

- Consumes: `RecapInput`, `Award`, `topAward`, the constants (Task 1); `getSeasonTable`.
- Produces:

```ts
export interface AwardsRecap {
	motm: Award | null;           // count of games each uid is in `winners`
	ironMan: Award | null;        // most appearances
	perfectAttendance: string[];  // appearances === gamesPlayed, sorted by uid
	climber: Award | null;        // largest positive `movement`
	streak: Award | null;         // longest run of `position === 0`, in kickoff order
}
export interface BanterRecap {
	noShows: Award | null;        // responses with `absent: true`
	lastMinute: Award | null;     // responses whose updatedAt is within LAST_MINUTE_HOURS before that game's kickoff, and not after it
	woodenSpoon: Award | null;    // bottom position among rows with appearances >= SPOON_MIN_APPEARANCES; value is that row's wins
}
export const getAwards = (input: RecapInput): AwardsRecap;
export const getBanter = (input: RecapInput): BanterRecap;
```

- [ ] **Step 1: Write the failing tests.**
    - `motm`: two games, `winners: ['a','b']` and `['a']`, give `{uids:['a'], value:2}`.
    - `streak`: results W W L W W W for `a` give a value of 3, and a tie on 3 with `b` gives both.
    - `climber` is `null` when every movement is `<= 0`.
    - `perfectAttendance` lists only players in every entry.
    - `lastMinute` counts an answer at exactly 24 hours before kickoff, but not one at 24h plus 1ms, and not one after kickoff. It only counts responses to games that have entries.
    - `woodenSpoon`: a player with 2 appearances at the bottom is skipped in favour of the lowest player with 3 or more, and it is `null` when nobody has 3.
    - `noShows` is `null` when nobody is `absent`.
- [ ] **Step 2: Run `pnpm vitest run shared/recap.test.ts`.** Expected: the new cases FAIL.
- [ ] **Step 3: Implement `getAwards` and `getBanter`, one private function per award**, each building a `Map<string, number>` and handing it to `topAward`. The wooden spoon is the one award that is not a maximum. It takes the highest `position` among the qualifying rows of `getSeasonTable`, and ties are shared.
- [ ] **Step 4: Run `pnpm vitest run shared/recap.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -am "Hand out the season's awards, and the banter ones"`

### Task 3: The personal recap

**Files:**

- Modify: `shared/recap.ts`, `shared/recap.test.ts`

**Interfaces:**

- Consumes: `RecapInput`, `NEMESIS_MIN_GAMES`; `getSeasonTable`, `SeasonRow`; `getPlayerLinks`, `PlayerLink` (`shared/player.ts`).
- Produces:

```ts
export interface PersonalRecap {
	row: SeasonRow;
	/** wins / appearances, 0..1. */
	winRate: number;
	/** Elo before their first game, then after each game they played, in kickoff order. Starts from `before[uid]?.elo ?? seedElo`. */
	journey: number[];
	/** Highest `wonTogether`, ties broken by `together` and then by uid. */
	bestTeammate: { uid: string; wonTogether: number } | null;
	/** Highest `lostTo` among links with `against >= NEMESIS_MIN_GAMES` and `lostTo > beat`. */
	nemesis: { uid: string; beat: number; lostTo: number } | null;
	motmVotes: number;
	motmWins: number;
	bestGame: { gameId: string; kickoff: string; gain: number } | null;
}
/** Null when `uid` has no appearance in this season. */
export const getPersonalRecap = (input: RecapInput, uid: string): PersonalRecap | null;
```

- [ ] **Step 1: Write the failing tests.**
    - It returns `null` for a uid that never appears.
    - With one game, `journey` has length 2 and `winRate` is 0 or 1.
    - An arrival with no rating starts `journey` at `seedElo`.
    - It returns no `nemesis` when the only opponent met once, and returns one at two meetings with `lostTo: 2, beat: 0`.
    - It returns no `nemesis` when `lostTo <= beat`.
    - Entries with no `teams` give `bestTeammate: null` and `nemesis: null`, without throwing.
    - `motmVotes` sums `counts[].votes` for the uid.
    - `bestGame` is the largest positive `after - before` and is `null` when every game lost rating.
- [ ] **Step 2: Run `pnpm vitest run shared/recap.test.ts`.** Expected: the new cases FAIL.
- [ ] **Step 3: Implement `getPersonalRecap`.** It filters entries to `seasonId` before `getPlayerLinks`, because that function is career-wide.
- [ ] **Step 4: Run `pnpm vitest run shared/recap.test.ts && pnpm fallow health`.** Expected: PASS, and nothing in `shared/recap.ts` above the ceilings.
- [ ] **Step 5: Commit:** `git commit -am "Give each player their own season in numbers"`

### Task 4: The ready stamp and the notification

**Files:**

- Modify: `shared/types.ts` (add `recapReadyAt?: string` to `Season`, with a JSDoc line saying it is function-owned)
- Modify: `shared/notifications.ts`, `shared/notifications.test.ts` (add `'recapReady'` to `SeasonNotification` and `SEASON_NOTIFICATIONS`, set `NOTIFICATION_PREF.recapReady: null`, add `buildRecapReadyPush`)
- Modify: `shared/debug.ts` and `frontend/app/(app)/debug/page.tsx` (`recapReady` joins the season kinds with a sample, and gets its debug description line, because the debug copy is a `Record` over every kind)
- Modify: `backend/src/lib/push.ts` (add `sendRecapReady`)
- Create: `backend/src/lib/recap.ts`, `backend/tests/recap.test.ts`
- Modify: `backend/src/lib/finalise.ts` (in `finaliseGame`'s `outcome === 'finalised'` block, after `openMotmVoting`, add `await announceRecapIfReady(seasonId).catch(error => reportError('Could not announce the season recap', { seasonId }, error))`)
- Modify: `backend/src/onGameWrite.ts` (in the `before.status !== 'cancelled' && after.status === 'cancelled'` branch, after the cancellation push, the same swallowed call)
- Modify: `firestore.rules` (in `seasonShapeOk`, add `'recapReadyAt'` to `hasOnly` as a string of at most 128 characters. Freeze it beside `confirmedAt` at line ~433, and refuse it on create beside line ~507), `rules/firestore.test.ts`
- Create: `backend/scripts/backfillRecapReady.ts`, and add a `backfill-recap-ready` script to `backend/package.json` in the same shape as `backfill-ledger-seed`

**Interfaces:**

- Consumes: `isSeasonFinished` (Task 1); `sendPush` and `NOTIFICATION_PREF` (`backend/src/lib/push.ts`); `getSeason` and `db` as `finalise.ts` imports them.
- Produces:

```ts
// shared/notifications.ts
export interface RecapReadyContext { seasonId: string; seasonName: string }
export const buildRecapReadyPush = (context: RecapReadyContext): PushPayload;
// title `${seasonName} is over`, body 'Your season recap is ready.', url `/s/${seasonId}/recap`, tag `recap-${seasonId}`

// backend/src/lib/push.ts
export const sendRecapReady = (uids: string[], context: RecapReadyContext): Promise<SendResult>;

// backend/src/lib/recap.ts
export type RecapAnnouncement = 'announced' | 'already' | 'not-finished' | 'missing';
export const announceRecapIfReady = (seasonId: string, nowIso?: string): Promise<RecapAnnouncement>;
```

`announceRecapIfReady` reads the games and the `ratingLedger` entries where `seasonId == id`, outside the transaction. If `isSeasonFinished` is false, it returns `'not-finished'`. If it is true, it runs a transaction that re-reads the season and returns `'already'` when `recapReadyAt` is set, and otherwise writes `recapReadyAt: nowIso`. Only after the commit does it send to the distinct uids across the entries' `positions`, and then it returns `'announced'`.

- [ ] **Step 1: Write the failing shared test.** `buildRecapReadyPush` gives the title, body, URL and tag above, `respondable` is false, and `NOTIFICATION_PREF.recapReady` is `null`.
- [ ] **Step 2: Write the failing rules tests.** A season admin's update that sets `recapReadyAt` fails. A season admin's update that keeps an existing `recapReadyAt` and edits `name` succeeds. A create carrying `recapReadyAt` fails.
- [ ] **Step 3: Write the failing backend tests** in `backend/tests/recap.test.ts`, following `backend/tests/onGameWrite.test.ts` for emulator setup and push mocking.
    - Two games both rated, both ended: the result is `'announced'`, `recapReadyAt` is set, and `sendRecapReady` is called once with exactly the ledger uids.
    - A second call gives `'already'` and doesn't send.
    - One game ended and unrated gives `'not-finished'`, with no stamp.
    - Cancelling that unrated game through `onGameWrite` announces.
    - Every game cancelled gives `'not-finished'`.
- [ ] **Step 4: Run `pnpm vitest run shared/notifications.test.ts`, `pnpm test:rules` and `pnpm test:backend`.** Expected: the new cases FAIL. Use the alternate-port scratch config if 8080 is taken.
- [ ] **Step 5: Implement it**: the type, the kind and builder, the debug rows, `sendRecapReady`, `announceRecapIfReady`, the two call sites and the rules.
- [ ] **Step 6: Write `backfillRecapReady.ts`.** For each season with no `recapReadyAt` that `isSeasonFinished` passes, it stamps the season with the current time. Then, for each uid in that season's ledger `positions`, it does `recapsWatched: arrayUnion(seasonId)`. It sends nothing. `--dry-run` prints the seasons and player counts and writes nothing. Run `pnpm --filter backend typecheck:scripts`.
- [ ] **Step 7: Run the three suites again, plus `pnpm typecheck` and `pnpm fallow`.** Expected: PASS.
- [ ] **Step 8: Run unslop over the push copy and comments, then commit:** `git commit -m "Tell everybody who played when their season's recap is ready"`

### Task 5: Watched state, the data hook and the story route

**Files:**

- Modify: `shared/types.ts` (add `recapsWatched?: string[]` to `AppUser`, with a JSDoc line)
- Modify: `firestore.rules` (`userShapeOk`: add `'recapsWatched'` to the `hasOnly` list, and add `&& (request.resource.data.get('recapsWatched', []) is list && request.resource.data.get('recapsWatched', []).size() <= 200)`)
- Modify: `rules/firestore.test.ts` (in `describe('users')`)
- Modify: `frontend/lib/db/users.ts` (add `markRecapWatched`)
- Modify: `frontend/lib/db/motm.ts`, `frontend/lib/db/tournament.ts` (add one-shot `fetchMotm(seasonId, gameId)` and `fetchMatches(seasonId, gameId)` beside the existing subscribers, as `getDoc`/`getDocs` over the same paths)
- Create: `frontend/hooks/useSeasonRecap.ts`
- Create: `frontend/app/(app)/s/[seasonId]/recap/page.tsx`, `Story.tsx`, `slides/*.tsx` (one file per slide group: `Intro`, `ClubNumbers`, `Podium`, `GamesToRemember`, `AwardSlide`, `PersonalLine`, `RatingJourney`, `YourPeople`, `YourMotm`, `Outro`)
- Test: `frontend/app/(app)/s/[seasonId]/recap/page.test.tsx`

**Interfaces:**

- Consumes: Tasks 1 to 3; `useSeason`, `useGames`, `useSeasonLedger`, `useUser`, `useUsersByUid` (`frontend/hooks/useData.ts`); `fetchSeasonResponses` (`frontend/lib/db/responses.ts`); `useAuth` (`frontend/lib/auth.tsx`).
- Produces:

```ts
// frontend/lib/db/users.ts
export const markRecapWatched = (uid: string, seasonId: string) =>
	updateDoc(userDoc(uid), { recapsWatched: arrayUnion(seasonId) });

// frontend/hooks/useSeasonRecap.ts
export const useSeasonRecap = (seasonId: string) => ({
	input: RecapInput | null, finished: boolean, ratedCount: number, gameCount: number,
	loading: boolean, error: Error | null, retry: () => void,
});
```

Route behaviour:

- `?player=` falls back to the viewer's uid.
- `?preview=1` counts only when `user.isAppAdmin`.
- When the season has no `recapReadyAt` and it isn't a preview, the route shows an `EmptyState`: "The recap opens once every game this season has been rated."
- Slide order: `Intro`, then `ClubNumbers`, `Podium`, `GamesToRemember`, then each non-null award, then each non-null banter award, then the personal slides when `getPersonalRecap` isn't null, then `Outro`.
- Every branch has `backHref` `/s/{id}`, and there is a close button to the same place.
- On reaching the last slide, it calls `markRecapWatched(user.uid, seasonId)` only when `!preview && player === user.uid` and the season isn't already in `recapsWatched`.
- `Intro` shows "Preview, {ratedCount} of {gameCount} games" when it is a preview.

`Story` props: `{ slides: ReactNode[]; onLast: () => void; onClose: () => void }`. It owns the index, the progress segments, tap halves (left goes back, right goes forward), horizontal swipe over 40px, and the arrow keys. Counting up and transitions are off under `prefers-reduced-motion`. The column is held at a phone width with `maxWidth` on desktop.

- [ ] **Step 1: Write the failing rules tests.**
    - The owner can `updateDoc` `{ recapsWatched: arrayUnion('s1') }`.
    - Another signed-in user can't write it on somebody else's doc.
    - A non-list value fails.
    - A list of 201 fails.
- [ ] **Step 2: Run `pnpm test:rules`.** Expected: the new cases FAIL. Use the alternate-port scratch `firebase.json` if 8080 is taken; see the memory note on emulator ports.
- [ ] **Step 3: Change `firestore.rules` and `AppUser` as listed above.**
- [ ] **Step 4: Run `pnpm test:rules`.** Expected: PASS.
- [ ] **Step 5: Write the failing page tests**, mocking `useSeasonRecap`, `useAuth`, `useUser` and `markRecapWatched`, following the mocking style of the nearest existing page test.
    - A season with no `recapReadyAt` shows the "opens once every game" message.
    - A season with one renders the intro.
    - Tapping right through to `Outro` calls `markRecapWatched` once.
    - `?preview=1` as an app admin renders a season with no stamp, with the badge and never calls `markRecapWatched`.
    - `?preview=1` as a non-admin still shows the message.
    - `?player=other` renders that player's line and doesn't call `markRecapWatched`.
    - `?player=` for a uid who never played renders no personal slides.
- [ ] **Step 6: Run `pnpm --filter frontend vitest run "app/(app)/s/[seasonId]/recap"`.** Expected: FAIL.
- [ ] **Step 7: Implement the fetchers, the hook, `Story`, the slides and the page.** The hook reads responses with `fetchSeasonResponses`, and reads each rated game's MOTM and matches with `Promise.all`, all one-shot and guarded by a `live` flag the way `useSeasonResponses` does it.
- [ ] **Step 8: Run `pnpm --filter frontend vitest run "app/(app)/s/[seasonId]/recap" && pnpm typecheck && pnpm fallow`.** Expected: PASS.
- [ ] **Step 9: Run unslop over the slide copy, then commit:** `git commit -m "Tell the season as a story, and remember who watched it to the end"`

### Task 6: The takeover and the replay card

**Files:**

- Create: `frontend/hooks/useRecapTakeover.ts`, `frontend/hooks/useRecapTakeover.test.tsx`
- Modify: `frontend/app/(app)/s/[seasonId]/page.tsx` (call the hook beside `useLiveGameRedirect`, above the early returns, and render a `RecapCard` linking to `/s/{id}/recap` at the top of the page when `season.recapReadyAt` is set. Subscribe to `useSeasonLedger` only then, passing `null` otherwise, so an ordinary week costs no extra listener.)

**Interfaces:**

- Consumes: `Season.recapReadyAt` (Task 4); `useSeasonLedger`, `useUser`.
- Produces:

```ts
export const useRecapTakeover = ({ seasonId, readyAt, entries, uid, watched, ready }: {
	seasonId: string; readyAt: string | undefined; entries: RatingLedgerEntry[];
	uid: string | null; watched: string[] | undefined; ready: boolean;
}) => void;
```

It redirects with `router.replace('/s/{id}/recap')` on arrival only. It is ready-latched, as in `useLiveGameRedirect`, and also fires on `visibilitychange`. It only redirects when `readyAt` is set, when `entries` has `uid` in some `positions`, and when `seasonId` isn't in `watched`. It claims a `sessionStorage` mark keyed `frescati:recap` holding the season id, so Back in the same session doesn't bounce. If storage throws, it doesn't redirect.

- [ ] **Step 1: Write the failing hook tests.**
    - It redirects when finished, played and unwatched.
    - It doesn't redirect when watched, when the viewer never played, or when `readyAt` is undefined.
    - It doesn't redirect twice in a session.
    - It doesn't redirect when `sessionStorage.setItem` throws.
    - It doesn't redirect before `ready`.
- [ ] **Step 2: Run `pnpm --filter frontend vitest run hooks/useRecapTakeover`.** Expected: FAIL.
- [ ] **Step 3: Implement the hook and wire it into the season home with the card.** The card copy is "Watch the season recap".
- [ ] **Step 4: Run `pnpm --filter frontend vitest run hooks/useRecapTakeover "app/(app)/s/\[seasonId\]/page" && pnpm typecheck && pnpm fallow`.** Expected: PASS. If `useLiveGameRedirect` and this hook now share enough code for fallow to flag duplication, pull the arrival latch into a shared `useOnArrival(ready, arrive)` hook and use it from both.
- [ ] **Step 5: Commit:** `git commit -m "A finished season opens on its recap until you have watched it"`

### Task 7: Profile link and debug preview

**Files:**

- Modify: `frontend/app/(app)/u/[uid]/page.tsx`
- Modify: `frontend/app/(app)/debug/page.tsx`
- Test: the existing profile and debug tests, if present. If not, create `frontend/app/(app)/u/[uid]/recaps.test.tsx`.

**Interfaces:**

- Consumes: `entries` and `seasonsById` from `usePlayerScreen`; `season` and `seasonId` from `useDebugTarget`.
- Produces: a `SeasonRecaps` section on the profile that lists each season in `entries` whose season has a `recapReadyAt`, newest first, linking to `/s/{id}/recap?player={uid}`. Also a `RecapCard` on `/debug`, after `TargetCard`, with a "Preview recap" link to `/s/{seasonId}/recap?preview=1`, disabled when no season is picked.

- [ ] **Step 1: Write the failing tests.**
    - The profile lists a stamped season's recap link with `?player=`, and leaves out an unstamped one.
    - The debug card's link targets `?preview=1` for the picked season.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement both.**
- [ ] **Step 4: Run the tests, `pnpm typecheck` and `pnpm fallow`.** Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Link each finished season's recap from a profile, and preview it from debug"`

### Task 8: Seed, e2e and docs

**Files:**

- Modify: `backend/scripts/seed/scenarios.ts` (add a `season-recap` plan to `full` with `status: 'archived'`, `history: 'played'`, `startWeeks: -20`, `endWeeks: -12`, about 8 members including one cast member not used by any other spec, `extraKeys` with one extra, and no kit or finances, plus a new `recapReady?: boolean` on `SeasonPlan`, set here, that makes the seeder stamp `recapReadyAt` after it writes the ledger. No other seeded season gets one, so `season-previous` never takes over.)
- Create: `e2e/recap.spec.ts`
- Modify: `e2e/locators.ts`, but only if a selector is shared with another spec
- Create: `docs/season-recap.md`
- Modify: `docs/notifications.md` (a `recapReady` bullet: no switch, for the reason `seasonConfirmed` has none, and the audience is the ledger)
- Modify: `AGENTS.md` (a line in "Feature docs": `docs/season-recap.md`, the end-of-season story: when a season counts as finished, what each award measures, the takeover and the debug preview.)

**Interfaces:**

- Consumes: `readCast`, `signInAs` (`e2e/fixtures.ts`); `openSeasonAs` (`e2e/helpers.ts`).

- [ ] **Step 1: Add the seeded season and run `pnpm --filter backend typecheck:scripts`.** Expected: PASS. Confirm the seeder rates every past game when `history: 'played'`, so the season comes out finished.
- [ ] **Step 2: Write `e2e/recap.spec.ts`.**
    - Opening `season-recap` as its cast member lands on `/s/season-recap…/recap`.
    - Tapping through to the last slide, then closing, lands on the season home with the "Watch the season recap" card.
    - Reloading the home stays on the home.
    - The card reopens the recap.
    - Click the player by name, not by row position; AGENTS.md explains why.
- [ ] **Step 3: Check that port 3000 and port 8080 are free, then run `pnpm test:e2e --project=mobile`.** Expected: every spec passes, the existing ones included.
- [ ] **Step 4: Run `pnpm test:e2e`, both viewports.** Expected: PASS.
- [ ] **Step 5: Write `docs/season-recap.md`, the `notifications.md` bullet and the `AGENTS.md` line, then run unslop over all three.** Include the deploy order: deploy the functions, then run `backfill-recap-ready` once.
- [ ] **Step 6: Run `pnpm test:all`, `pnpm typecheck`, `pnpm format:check` and `pnpm fallow`.** Expected: all green.
- [ ] **Step 7: Commit:** `git commit -m "Seed a finished season and walk its recap end to end"`
