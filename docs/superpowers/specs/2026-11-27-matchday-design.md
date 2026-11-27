# Matchday: the programme before the game and the full-time card after it

## Why

Game day is the reason the app exists, and on game day it looks like any other day. The teams appear the moment there are eight players and change quietly as answers come in, the result is confirmed, and the rating moves on a table somebody may or may not open. The season recap showed the group what the app can do with the ledger once a season. This does it once a week.

Two pieces, built in this order:

1. **The matchday programme.** On game day, a screen in the spirit of a printed programme: tonight's odds, everybody's form, the rivalry of the night and a storyline or two. It is what makes opening the app on a Tuesday different from opening it on a Thursday.
2. **The full-time card.** When a result is confirmed, each player who played gets a card of their own night: where their team finished, their record, their rating moving, a streak or a jump on the table. It takes over the season home the first time they open the app afterwards, and it can be shared as an image.

The surprise is in what they notice. The facts change every week, so the screens do too.

## Goals

- A programme at `/s/{seasonId}/g/{gameId}/programme`, reachable on game day from the season home and from the game screen.
- A full-time card at `/s/{seasonId}/g/{gameId}/full-time`, which takes over the season home once per game per device after the result is confirmed, for anybody with an appearance in that game.
- A Share button on the card that draws it to a PNG and hands it to the phone's share sheet, falling back to a download.
- Every number computed in the browser from documents any signed-in user can already read. Nothing new stored, so a corrected score or a rating replay fixes both screens without anybody doing anything.

## Non-goals

- **No push for either.** People find the programme by opening the app on game day, and the card by opening it after the result. A game-day push was considered and dropped, because the existing reminder only reaches members who have not answered and usually lands the day before.
- **No man of the match on the card.** The vote opens when the result is confirmed, which is the moment the card appears.
- **No new backend, rules or stored fields.** No Cloud Function, no `firestore.rules` change, no field on the user document.
- **No banter.** That belongs to the recap. Both screens are factual and never mock anybody.
- **No individual goals.** The app does not record scorers.
- **No money.** Dues never appear on either screen.

## Anti-goals

- **A number that disagrees with the screen beside it.** Rating movement uses the rounding the rest of the app uses (`RatingMovement`, `toDisplayRating`), the season table place comes from `getSeasonTable`, the record from the result document's standings. If the card says `+2`, the team sheet says `+2`.
- **A takeover nobody can escape.** Back from the card must not land on a season home that sends them straight back.
- **A stale card.** Somebody who opens the app for the first time in a month is not greeted by a game from three weeks ago.
- **Two takeovers fighting.** The live-game redirect and the recap takeover already exist; the card defers to both.
- **A storyline that does not mean anything.** Every storyline has a floor, so "Rui has won 1 in a row" never appears.

## Approaches

**Where the numbers are computed.**

- **A. In the browser from the ledger, as the recap does it.** Chosen. Nothing stored, so replays and corrected scores fix every past programme and card for free. Costs one read of the career ledger when the programme opens, a few hundred small documents for this group, the same kind of read the profile and head-to-head screens already make.
- B. A Cloud Function writes a preview document when teams settle and a card per player at confirmation. Faster to open, and a push could quote the odds. Rejected because every rating replay would have to rewrite them, the is the drift the recap was designed to avoid.

**How the card becomes an image.**

- **A. Draw it on a `<canvas>` in the browser and pass the PNG to `navigator.share({ files })`, downloading where file sharing is not supported.** Chosen. No dependency, nothing server-side.
- B. A DOM-to-image library. Rejected as a new dependency that tends to break on web fonts and on the CSP.
- C. A `next/og` route. Rejected because the server would have to read Firestore, and that is the API layer the architecture leaves out on purpose.

**Announcing the programme.** A game-day push folded into the reminder was the first idea. The reminder goes only to members who have not answered and at the season's `reminderHours`, 72 and 24 by default, so nothing goes out on game day and the people who said In never hear it. A separate noon push was offered and declined. The programme has no push.

**How the card arrives.** A takeover the first time the app is opened after the result, rather than a card that waits on the game screen. Chosen because it happens once a game and it is about the person reading it. The programme is not a takeover. It is there every week, and the live-game redirect already takes over the screen at kickoff.

## The programme

### When and where

- **Game day** is the civil date of `kickoff` in the season's `slot.timezone`. The entry points show from midnight that day while the game's lifecycle (`getGameLifecycle`) is `open`, `locked` or `live`. Not for a cancelled game, and not once it is `finished`.
- **Season home:** the next-game card (`NextGameHero`) gains a programme strip on game day: a mini odds bar when teams exist ("A 41% · B 33% · C 26%"), otherwise the headline storyline. Tapping it opens the programme.
- **Game screen:** a card near the top, beside the existing teams link, opens the programme.
- **The route itself** renders for any game, any day, so a link sent around still works. Only the entry points are limited to game day. Its `backHref` is the game screen, on every loading and error branch too.

### Who is in it

The pool is whoever is In and counted as playing, the same set the team sheet is drawn from. When `tournament/teams` exists, squads come from it. Answers change the pool, so the screen subscribes and updates live. Watching the odds move through the afternoon is part of the fun.

### Sections, in order

1. **Tonight's odds**, only when teams exist (eight or more playing). Each team's chance of topping the table tonight.
    - Team strength is the team Elo the rating code uses, from each player's `rating` with unrated players at `getSeedElo` of the season's rated members, exactly as `computeGameRatings` would seed them.
    - Two teams: `getWinProbability` straight, which already counts a draw as half, so the two numbers total 1 and read as each side's chance of the night.
    - Three or four teams: a seeded simulation of the fixture list (`getFixtures` with `balance.matchMinutes` and the slot's `durationMinutes`, as the tournament screen calls it), each match drawn from `getWinProbability`, the table ranked as `getStandings` ranks it, ties at the top shared. Seeded from the game id and the lineup so the numbers do not flicker between renders and only move when the teams do. A few thousand runs is enough.
    - Shown as whole percentages that total 100, largest remainder rounding.
    - Labelled for what it is: "Chance of topping the table".
2. **Form.** Every player in the pool with their last five results in the order played, W / D / L, from their ledger entries (`getPlayerGames`). A result is the team's finish: first is W, a shared first is D, anything lower is L. Ordered by team when teams exist, by name otherwise. A player with no games shows "Debut".
3. **The rivalry.** The pair, on opposite teams tonight, with the most career meetings on opposite teams (`getHeadToHead`), at least `RIVALRY_MIN_MEETINGS = 3`. Shown as "met N times, X leads 8-6" or "level at 5-5", with the current run if `getHeadToHeadRun` gives one of two or more. Before teams exist, the pair with the most meetings among the pool, labelled as a possible meeting. Left out when no pair reaches the floor.
4. **On the line.** Up to three storylines, picked by priority, at most one per player:
    - **Winning run** of three or more consecutive wins, going into tonight.
    - **Losing run** of three or more, phrased as something to end, not to mock: "João is looking to end a run of 4".
    - **Milestone:** within one display point below a multiple of 10 on the 0 to 100 rating ("Ana is a point off 70").
    - **Debut:** first game in the ledger.
    - **Return:** last appearance 28 days or more before tonight.
    - **Man of the match run:** won the vote in each of their last two games or more.

    Every floor is a named constant in the shared module, so tests and copy agree on it.

When the pool is empty, the screen says so plainly rather than drawing empty sections.

### Logic

A pure `shared/matchday.ts` with tests: `getTeamOdds`, `getForm`, `getRivalry`, `getStorylines`, and `isGameDay`. They take ledger entries, users and the lineup, and return plain data. The screen does nothing but lay it out.

### Data

- The career ledger: one subscription to all of `ratingLedger`. The programme screen opens it, and so does the season home's strip, which needs the odds and the headline storyline, but only on game day.
- Users (ratings, names) through the existing `useUsersByUid`.
- Responses and the teams document through the hooks the game screen already uses.

## The full-time card

### What is on it

For the player reading it, from `tournament/result` and the ledger:

- The date and the team they played for, and where it finished: "Team B, 1st of 3", or "Team A, level first" on a shared place.
- Their team's record for the night: wins, draws and losses across the matches it played, from the result document's standings.
- Their rating, before and after, on the 0 to 100 scale, and the movement badge with the same sign and colour rules as `RatingMovement`. The after number counts up from the before number.
- One or two highlight lines, in priority:
    - a winning run started (two in a row), extended, or ended ("That ends a run of 5");
    - a move on the season table worth mentioning, two places or more, or into first, from `getSeasonTable` with and without this game;
    - a career-best rating;
    - a first win. None when nothing qualifies; the card still stands on the result and the rating.
- Share and Done.

Nobody can open somebody else's card. The route shows the signed-in user's own card, and a player who did not play that game gets a plain message and the back chevron.

### The takeover

- **Where:** the season home, using the arrival rules in `hooks/useArrival.ts` (the load and each return to the foreground), once per session per game, the same as the recap takeover.
- **Who:** somebody with an appearance in the game's ledger entry.
- **Which game:** the most recently confirmed game in this season, and only within seven days of its `finalisedAt`. An older one is not shown, so nobody returning after a month gets last month's card.
- **Seen:** remembered per device in `localStorage` under the game id, set when the card is closed or shared. Per device rather than on the user document so it needs no rules change; seeing it twice on two devices is an accepted cost. Storage that throws counts as seen, the same reasoning `claimOnce` gives.
- **Order:** the live-game redirect wins, then the recap takeover. When the confirmed game finished the season, the recap is the send-off and the card does not take over; it is still on the game screen.
- **Navigation:** pushes rather than replaces, like the recap, so the chevron goes back to the season home and the session mark stops it bouncing straight back.
- **Afterwards:** the game screen of a played game links to the card for anybody who played it.

### Motion

A short entrance: the card rises in, the finish and record land a beat later, the rating counts up (the recap's `CountUp`), a highlight slides in. A win gets the recap's confetti, once. With reduced motion, `globals.css` cuts the animations short as it does for the recap, and the confetti is not drawn at all.

### Sharing

- The card is drawn to a fixed 1080 × 1350 canvas, portrait, so it reads well in a chat.
- Colours come from the StyleX tokens, read off the page with `getComputedStyle` at draw time, never hardcoded hex. The font is the app's own, awaited through `document.fonts.ready` before drawing.
- `navigator.canShare({ files })` decides between the share sheet and a download. A download through an object URL; check the CSP allows it and say so in the plan if it needs a change.
- The image carries the app's name but no link and no other player's name.

### Logic

A pure `shared/fullTime.ts` with tests: `getFullTimeCard(entries, result, uid)` returns the finish, record, rating before and after, and the highlights; `pickFullTimeTakeover(games, entries, uid, now)` returns the game to show, if any. The canvas drawing is its own module in `frontend/lib/`, tested for what it can be (it draws, it calls share or download) rather than for pixels.

## Seeds and tests

- The seed scenario gains a game whose kickoff is today in a season with teams, so the programme has odds, form, a rivalry and storylines to show, and a confirmed game within the last seven days, so the card takes over. Added as a season or `pins` entry in `backend/scripts/seed/scenarios.ts`, derived from `shared/` like everything else there.
- Unit tests for every function in `shared/matchday.ts` and `shared/fullTime.ts`, including each floor and the odds totalling 100.
- Component tests for the programme sections, the strip, the card and the takeover hook.
- `e2e/matchday.spec.ts`: the programme opens from the season home on game day; the card takes over once, Back returns to the season home, and it does not take over again. Different players per viewport where the run writes anything, since the viewports share one database.

## Docs

`docs/matchday.md` covering both pieces in the style of the other feature docs, and an entry for it in the feature list in `AGENTS.md`. All prose, copy and comments go through the `unslop` skill.

## Left to the builder

- The exact visual design of both screens, within the tokens and the existing surfaces.
- The number of simulation runs and the seeding function, as long as the result is stable for a given lineup.
- Exact copy for each storyline and highlight, run through unslop.
- How the season home's strip shares the ledger subscription with the programme screen, if it does.
