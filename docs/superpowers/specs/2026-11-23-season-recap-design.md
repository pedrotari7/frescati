# Season recap: the end of a season as a story

## Why

A season ends and the app has nothing to say about it. The season home keeps showing a game list with nothing left in it until somebody starts the next one. The numbers for a proper send-off are already stored: the ledger has every appearance, win and rating move, the responses have who turned up, and the MOTM documents have the votes. Nothing puts them together.

This change adds a recap told as full-screen slides. It covers the club's season, a set of awards and each player's own season. Once the season is over it takes the place of the season home for everybody who played, until they have watched it to the end.

## Goals

- A story of slides at `/s/{seasonId}/recap`: tap right or left to move between slides, swipe works too, and a progress bar runs across the top.
- It takes over the season home once the season is finished, for anybody with at least one appearance, until they reach the last slide.
- "Watched" is stored on the user document, so finishing it on a phone counts on the desktop too.
- It can be watched again from a card on the season page and from a player's profile.
- An app admin can preview it from `/debug` at any point in the season.

## Non-goals

- No sharing. A screenshot covers it for now.
- No money and no kit. Unpaid dues never appear anywhere in the recap.
- No backend change. The numbers are computed on the client, from documents anyone signed in can already read.
- No individual goals. The app doesn't record scorers, so no slide pretends to know them.
- No admin step to publish it. It starts on its own.

## Anti-goals

- **A recap that changes after you've watched it.** It doesn't start until every game has been rated, so the table and the awards are final when it first appears.
- **A preview that uses up your real one.** The debug preview never writes `recapsWatched`.
- **Back walking into a loop.** The takeover uses `router.replace`, so Back from the recap doesn't land on a season home that sends you straight back.

## When a season is finished

`isSeasonFinished(games, entries, now)` in `shared/recap.ts` decides it. Every game that isn't `cancelled` must have an `endsAt` before `now` and must have a ledger entry. A season with no games that count is never finished.

A game that was played but never scored holds the recap back until somebody scores it or cancels it. That's on purpose: a recap with a game missing would tell a different story from the table beside it.

The season stays `active` throughout. Nothing about `status` changes, and `/seasons` keeps sending people to the sole active season's home, which is where the takeover happens.

## Content

The order is: intro, club, awards, banter, then personal. The last slide is "Your season". Somebody with no appearances skips the personal slides, so their last slide is the last award.

### Club

- **Season in numbers.** Games played, total goals across all matches, average turnout, distinct players, and how many of them were extras.
- **Podium.** The top three from `getSeasonTable` in its default `won` order. Ties share a step.
- **Games to remember.** The highest-scoring match, the biggest winning margin, the closest finish and the game with the best turnout. The closest finish is the smallest margin among decided matches, since a level one is a draw, not a finish. Each one links to its game.

### Awards

- **MOTM leader.** The most man-of-the-match wins this season, from each game's counted `tournament/motm`.
- **Iron man.** The most appearances. A perfect-attendance list goes underneath if anybody played every game.
- **Biggest climber.** The largest positive `movement` in the season table.
- **Longest win streak.** The most consecutive games won, using the same `won` test as the table.

### Banter

- **Most no-shows.** The most responses marked `absent`. If nobody has one, the slide is left out rather than showing a zero.
- **Last-minute Lucy.** The most responses whose `updatedAt` falls within 24 hours before kickoff. Responses keep no history, so this counts answers last touched late, not how many times somebody changed their mind.
- **Wooden spoon.** Bottom of the season table, among players with at least 3 appearances. Left out if nobody qualifies.

Ties are shared throughout: every award names all of the players level at the top. An award with nobody to give it to is left out.

### Personal

- **Your season line.** Appearances, wins, win rate, and your place in the table.
- **Rating journey.** A sparkline of your rating through the season's ledger entries, from before your first game to after your last.
- **Your people.** The teammate you won most often with, and your nemesis, the opponent with the worst head-to-head record against you by `getHeadToHead`, among opponents you met at least twice.
- **MOTM and best game.** The MOTM votes you received, and the game with your biggest single-game rating gain.

The personal slides belong to `?player={uid}` when it is set, and otherwise to the viewer. The profile link sets it.

## Units

### `shared/recap.ts`

`getSeasonRecap(input)` is pure. Its input is the season, its games, its ledger entries, every game's responses, MOTM results and matches. It returns `{ club, awards, banter }` plus `getPersonalRecap(recap, uid)`. It reuses `getSeasonTable`, `getHeadToHead` and `getStandings` instead of computing those numbers a second way. Each award is its own function, which keeps every one of them under fallow's complexity ceilings and makes each one testable on its own. `isSeasonFinished` lives here too.

### `useSeasonRecap(seasonId)`

This hook loads the ledger entries for the season, its games, and each game's responses, MOTM result and matches, then returns the recap and `finished`. These are one-shot reads rather than subscriptions, because a finished season doesn't change. The preview is the exception, but reloading the preview is fine.

### Watched state

`users/{uid}.recapsWatched: string[]` holds season ids. Reaching the last slide writes it with `arrayUnion`, and it is only written when it isn't a preview and the viewer is looking at their own personal slides. `firestore.rules` adds the field to the profile allowlist and requires a list of strings. A rules test in `rules/` covers that the owner can add to it and nobody else can, and `pnpm test:rules` runs it.

### Takeover

`/s/[seasonId]/page.tsx` checks three things: the season is finished, the viewer has an appearance in it, and the season isn't in their `recapsWatched`. When all three hold, it calls `router.replace('/s/{id}/recap')`. When the season is finished, the season home also shows a "Watch the season recap" card at the top, for everybody.

### The route

`frontend/app/(app)/s/[seasonId]/recap/` has a `backHref` of `/s/{id}`, set on its loading and error branches too, and a close button that goes to the same place. A `Story` shell handles the progress segments, tap zones, swipe and the keyboard arrows. Each slide is its own component. The numbers count up, and `prefers-reduced-motion` turns off the counting and the transitions. All styling is StyleX with tokens from `tokens.stylex.ts`, and the layout starts at phone width. On desktop the slides stay in a phone-width column in the middle of the screen.

### Profile link

A player's profile lists the seasons they have appeared in that are finished, each one linking to `/s/{id}/recap?player={uid}`.

### Debug preview

`/debug` gets a `RecapCard` under the season picker, behind the page's existing `isAppAdmin` gate. Its button opens `/s/{id}/recap?preview=1`. On the route, `preview=1` skips the finished check only when the viewer is an app admin, and anybody else gets the normal gate. A preview is built from the games rated so far, and the intro slide carries a "Preview, N of M games" badge. It never writes `recapsWatched` and doesn't touch the takeover.

## Testing

- `shared/recap.test.ts`: `isSeasonFinished`, including cancelled games and a played game nobody scored; every award, including ties, nobody qualifying, and the spoon's 3-game floor; Lucy's 24-hour edge; and the personal slides for somebody with one game.
- A jsdom test for the takeover: it redirects when unwatched, doesn't redirect when watched or when the viewer never played, and the last slide writes `recapsWatched`, except in a preview.
- `rules/`: the `recapsWatched` cases above.
- `e2e/recap.spec.ts`: a new seeded season in `scenarios.ts`, with every game played and rated, and a cast member who has played. It checks the takeover from the season home, clicking through to the last slide, that the home is back afterwards, and that the replay card works, on both viewports. The season is its own, so it stays disjoint from the other specs.
- `pnpm typecheck`, `pnpm fallow` and `pnpm format:check` before the commit.

## Docs

`docs/season-recap.md` describes when a season counts as finished, what each award measures and why the banter is there, and it gets a line in the feature-docs list in `AGENTS.md`.
