/**
 * The shape of a game: how many teams, how big the squads, who plays whom and
 * whether the whole thing fits the slot.
 *
 * Pure and dependency-free so the Cloud Function that builds teams and the
 * screen that renders them can never disagree about what a 13-player Tuesday
 * looks like.
 */

import type { TournamentMatch } from './types';

/** Fewer than this and there is no tournament, the same floor a game has. */
export const MIN_TOURNAMENT_PLAYERS = 8;

/**
 * Hours after kickoff at which an unconfirmed game confirms itself.
 *
 * Lives here rather than in the function that acts on it because the screen has
 * to promise it. "Nothing counts until this is confirmed" is only reassuring
 * if the app can say when that happens, and a number that drifted between the
 * promise and the sweep would be worse than not mentioning it.
 */
export const AUTO_FINALISE_HOURS = 24;

/**
 * Never more than four teams, however many turn up. Above sixteen the squads
 * just get deeper: a fifth team would mean ten round-robin matches, which does
 * not fit inside ninety minutes on one pitch.
 */
export const MAX_TEAMS = 4;

/**
 * However long the slot, a rotation does not repeat forever. Past this many
 * matches the scoreboard is more grinding than the football, so this is the
 * ceiling regardless of how much room `getScheduleFit` finds. Firestore rules
 * mirror it on `matches/{order}.order` the same way they mirror `MAX_TEAMS`.
 * A rule cannot read the season and the lineup to recompute it, so it bounds
 * the worst case and `selectPlayedMatches` does the exact check on the way
 * back out.
 */
export const MAX_MATCHES = 30;

/**
 * The most anybody plays a side, however deep the squads get.
 *
 * The pitch does not grow with the turnout: a twelfth player does not make the
 * game 6v6, it makes it two squads of six playing five a side with a sub each.
 * Below twelve this never bites, because no band produces a squad of more than
 * five, so it reads as a cap only from the headcount that first needs one.
 */
export const MAX_SIDE = 5;

/**
 * How many teams a headcount splits into. `0` means "not enough for a
 * tournament" rather than throwing, because this is read on every render of a
 * game that may only have two people in it so far.
 *
 * Twelve is two teams rather than three. Three squads of four is a smaller
 * game than the pitch holds, and the twelfth player arriving should deepen the
 * bench rather than shrink the football, so twelve is the last headcount that
 * plays the slot out as one match, six a squad with a sub rotating through
 * each. Thirteen is where a third team starts paying for itself.
 */
export const getTeamCount = (playing: number): number => {
	if (playing < MIN_TOURNAMENT_PLAYERS) return 0;
	if (playing <= 12) return 2;
	if (playing <= 15) return 3;

	return MAX_TEAMS;
};

/**
 * Squad sizes, largest first, never differing by more than one.
 *
 * Uneven totals put the spare body in the earlier squads rather than leaving
 * anyone unattached. A player outside a squad has no team to be rated with.
 * The imbalance is absorbed on the pitch instead, by `getSideSize`.
 */
export const getSquadSizes = (playing: number, teamCount: number): number[] => {
	if (teamCount <= 0) return [];

	const base = Math.floor(playing / teamCount);
	const spare = playing % teamCount;

	return Array.from({ length: teamCount }, (_, index) => base + (index < spare ? 1 : 0));
};

/**
 * How many a side actually play when these two squads meet: the smaller of the
 * two, and never more than the pitch holds. Whatever is left over on either
 * side rotates through.
 *
 * This is what makes "equal sides, nobody rests permanently" work on an odd
 * headcount. Eleven players are squads of six and five playing 5v5, and the six
 * take turns sitting out rather than one person watching the whole game. Twelve
 * are squads of six and six, and `MAX_SIDE` is what stops that reading as 6v6:
 * both squads keep a sub instead.
 */
export const getSideSize = (squadA: number, squadB: number): number => Math.min(squadA, squadB, MAX_SIDE);

export interface Fixture {
	/** Position in the running order, from 0. */
	order: number;
	/** Indices into `TournamentTeams.teams`. */
	teamA: number;
	teamB: number;
}

/**
 * One lap: who plays whom, in the order they play it, before the rotation
 * repeats, for the team counts where it repeats at all.
 *
 * Two teams have nobody else to rotate in, so there is only the one game
 * between them, ever: replaying that same fixture a second time would not be
 * a round robin recurring, only that one result counted twice over, so
 * `getFixtures` never laps it however long the slot runs. Three teams play a
 * double round robin per lap; four play a single one. Both land on six
 * matches, so a lap is the same length whichever of the two it is.
 *
 * The orders within a lap are hand-picked so that nobody plays, or waits,
 * more than two matches running. Three teams get this for free, since only
 * one team ever sits out a match, so the two playing can never both be new,
 * and whoever just sat out never sits out twice running either. Four teams
 * cannot have both. Forcing a team to stay on for *every* changeover, so
 * that neither side is ever a full swap, proves out to strand some other
 * team on the sideline for three matches straight, which is worse than the
 * changeover it was avoiding. So this order takes the changeover on the chin
 * instead: `[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]` swaps both teams three
 * times out of five, but nobody, playing or waiting, ever goes three deep.
 */
const ROTATIONS: Record<number, [number, number][]> = {
	2: [[0, 1]],
	3: [
		[0, 1],
		[1, 2],
		[2, 0],
		[0, 1],
		[1, 2],
		[2, 0],
	],
	4: [
		[0, 1],
		[2, 3],
		[0, 2],
		[1, 3],
		[0, 3],
		[1, 2],
	],
};

/**
 * Who plays whom, in the order they play it: as many laps of `ROTATIONS` as
 * fit `slotMinutes` at `matchMinutes` each, so a fifty-minute five-a-side and
 * a two-hour tournament are the same shape run a different number of times,
 * not two different rotations.
 *
 * Two teams are the one shape this doesn't apply to. A lap of one fixture has
 * no pattern to repeat, since replaying it is just the same match again
 * rather than another round of anything, so it never does. Two teams always
 * play the single game `ROTATIONS` gives them, whatever `matchMinutes` and
 * `slotMinutes` say.
 *
 * For everyone else, floored at one full lap and capped at `MAX_MATCHES` so a
 * long slot with short matches doesn't turn the scoreboard into a chore. A
 * slot too short for even one lap is an overrun `getScheduleFit` reports, not
 * a reason to serve half a round robin.
 */
export const getFixtures = (teamCount: number, matchMinutes: number, slotMinutes: number): Fixture[] => {
	const lap = ROTATIONS[teamCount];
	if (!lap) return [];
	if (lap.length === 1) return [{ order: 0, teamA: lap[0][0], teamB: lap[0][1] }];

	const matchSlots = matchMinutes > 0 ? Math.floor(slotMinutes / matchMinutes) : 0;
	const matchCount = Math.min(MAX_MATCHES, Math.max(lap.length, matchSlots));

	return Array.from({ length: matchCount }, (_, order) => {
		const [teamA, teamB] = lap[order % lap.length];
		return { order, teamA, teamB };
	});
};

/**
 * How many fixtures make up one round: every pair meeting once, so every team
 * comes away with one more game played. The stride a screen groups its fixture
 * list into rounds by. `0` for a team count with no rotation at all.
 *
 * Pointedly **not** the lap length, which is what a screen grouping by "where
 * the rotation repeats" would use. The two coincide for four teams and come
 * apart for three, whose lap is a *double* round robin, so grouping by the lap
 * drew a single "Round 1" of six matches, the entire evening under one heading,
 * when a round is the three fixtures that get each side one game. Two teams
 * divide into rounds of one, which is why the caller decides whether a divider
 * is worth drawing at all rather than this returning something clever: their
 * one fixture is a round, it is just not one worth announcing.
 *
 * Derived rather than tabulated, because a round robin's length is arithmetic,
 * every pair of `teamCount`, and a second hand-kept table is a second thing to
 * get out of step with `ROTATIONS`. What the table *does* have to promise is
 * that its laps divide into whole rounds, which the suite pins.
 */
export const getRoundLength = (teamCount: number): number =>
	ROTATIONS[teamCount] ? (teamCount * (teamCount - 1)) / 2 : 0;

/**
 * The matches that actually belong to this game.
 *
 * The scoreboard is the one thing in the app anybody at the pitch may write, so
 * what comes back from it is not automatically part of the game. A document at
 * an `order` no rotation reaches, or between two teams that fixture never puts
 * together, describes a match that was never on the card. And because the
 * screen only ever draws `getFixtures`, such a document counted towards the
 * table and towards everyone's rating without appearing anywhere that could
 * explain why.
 *
 * Security rules bind a match's document id to its `order`, which is what stops
 * two documents claiming one fixture. They cannot do the rest: a rule has no
 * cheap way to know how many teams a game split into, let alone which pairs
 * that split's rotation produces. So this is the real check, and both the screen
 * and the function that turns a scoreboard into ratings run it before reading a
 * single score.
 *
 * It also drops what a reshuffle stranded. Re-picking the teams rewrites the
 * rotation under any score already entered, and a match against a pairing that
 * no longer exists is a record of a lineup that doesn't either. It is the same
 * reasoning that already made `getStandings` ignore a match naming a team that
 * has gone, carried to the subtler case where both teams still exist but never
 * met.
 *
 * `matchMinutes` and `slotMinutes` are part of the same check now that a
 * rotation can run more than one lap: a document at an order only a longer
 * slot would reach is exactly the same kind of match that was never on the
 * card.
 */
export const selectPlayedMatches = (
	teamCount: number,
	matchMinutes: number,
	slotMinutes: number,
	matches: TournamentMatch[]
): TournamentMatch[] => {
	const fixtures = new Map(
		getFixtures(teamCount, matchMinutes, slotMinutes).map(fixture => [fixture.order, fixture])
	);
	const played = new Map<number, TournamentMatch>();

	for (const match of matches) {
		const fixture = fixtures.get(match.order);

		if (!fixture || fixture.teamA !== match.teamA || fixture.teamB !== match.teamB) continue;

		// Only reachable for documents written before the id was bound to the
		// order. Neither is the more authoritative, so the later one stands.
		const claimed = played.get(match.order);
		if (claimed && claimed.updatedAt > match.updatedAt) continue;

		played.set(match.order, match);
	}

	return [...played.values()].sort((a, b) => a.order - b.order);
};

/**
 * How open the scoreboard is to one person: freely, deliberately, or not at
 * all.
 *
 * Three states rather than the boolean this used to be, because a confirmed
 * game is not simply closed to an admin. It is closed to a *tap*. An
 * unconfirmed game is one tap for anybody holding a response and that is the
 * whole point of it: whoever has a free hand enters the score, and a wrong one
 * is one tap back. Confirming applies the ratings, so from then on the same tap
 * asks `replayRatingsFrom` to rewind the ledger and rate every game since
 * against a table that moved underneath it. That is a decision rather than a
 * gesture, and `locked` is what says so: the people who may still correct a
 * score keep every bit of that power and have to reach for it, instead of
 * finding it under a thumb resting on a `+` while scrolling.
 *
 * `none` covers both of its reasons, somebody signed in who never answered the
 * game and everybody who cannot correct a confirmed one, because the screen
 * says something different about each and neither can score.
 */
export type ScoreAccess = 'open' | 'locked' | 'none';

export const getScoreAccess = ({
	finalised,
	isAdmin,
	hasResponded,
}: {
	finalised: boolean;
	/** A season admin or an app admin: the people a correction is allowed from. */
	isAdmin: boolean;
	/** Whether they answered this game, which is what stands in for being at the pitch. */
	hasResponded: boolean;
}): ScoreAccess => {
	if (finalised) return isAdmin ? 'locked' : 'none';

	return isAdmin || hasResponded ? 'open' : 'none';
};

export interface ScheduleFit {
	matchCount: number;
	/** How long each match actually runs for, which is the whole slot when there is only one. */
	matchMinutes: number;
	totalMinutes: number;
	slotMinutes: number;
	/** Minutes past the end of the slot, `0` when it fits. */
	overrunMinutes: number;
}

/**
 * Whether the game fits the season's slot.
 *
 * `matchCount` already accounts for the slot for three or four teams, since
 * `getFixtures` laps the rotation to use the time available there. Two teams
 * never lap, since `matchCount` is always 1, and a single fixture is not five
 * minutes of football followed by an empty hour: the two sides play the slot
 * out. So the match runs for `slotMinutes` there, which is what the badge
 * shows and what keeps `totalMinutes` describing the evening rather than the
 * admin's rotation length, which has nothing to rotate.
 *
 * Otherwise reported rather than enforced, and the fixture list is generated
 * at the requested match length either way. Changeovers are deliberately not
 * modelled. `matchMinutes` is the admin's number and they know whether
 * theirs includes picking the bibs back up.
 */
export const getScheduleFit = (teamCount: number, matchMinutes: number, slotMinutes: number): ScheduleFit => {
	const matchCount = getFixtures(teamCount, matchMinutes, slotMinutes).length;
	const runMinutes = matchCount === 1 ? slotMinutes : matchMinutes;
	const totalMinutes = matchCount * runMinutes;

	return {
		matchCount,
		matchMinutes: runMinutes,
		totalMinutes,
		slotMinutes,
		overrunMinutes: Math.max(0, totalMinutes - slotMinutes),
	};
};

/**
 * How the game reads on a badge, e.g. `5v5` or `3 teams · 4–5 a side`.
 *
 * Two teams keep the familiar `NvN` because that is what people call it. Three
 * or four say how many squads, since the side size alone stops describing the
 * evening.
 *
 * It describes the pitch rather than the team sheet, which is why it reads the
 * squads through `MAX_SIDE` first: a squad deeper than the pitch holds is more
 * subs, not a bigger side, so twelve players say `5v5` exactly as eleven and
 * ten do. The bench is the team sheet's business, and `TeamCard` says it there.
 */
export const describeSquads = (sizes: number[]): string | null => {
	if (sizes.length === 0) return null;

	const onPitch = sizes.map(size => Math.min(size, MAX_SIDE));
	const smallest = Math.min(...onPitch);
	const largest = Math.max(...onPitch);

	if (sizes.length === 2) return `${smallest}v${smallest}`;

	const side = smallest === largest ? `${smallest}` : `${smallest}–${largest}`;

	return `${sizes.length} teams · ${side} a side`;
};
