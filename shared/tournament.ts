/**
 * The shape of a night: how many teams, how big the squads, who plays whom and
 * whether the whole thing fits the slot.
 *
 * Pure and dependency-free so the Cloud Function that builds teams and the
 * screen that renders them can never disagree about what a 13-player Tuesday
 * looks like.
 */

import type { TournamentMatch } from './types';

/** Fewer than this and there is no tournament — the same floor a game has. */
export const MIN_TOURNAMENT_PLAYERS = 8;

/**
 * Hours after kickoff at which an unconfirmed night confirms itself.
 *
 * Lives here rather than in the function that acts on it because the screen has
 * to promise it — "nothing counts until this is confirmed" is only reassuring
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
 * How many teams a headcount splits into. `0` means "not enough for a
 * tournament" rather than throwing, because this is read on every render of a
 * game that may only have two people in it so far.
 */
export const getTeamCount = (playing: number): number => {
	if (playing < MIN_TOURNAMENT_PLAYERS) return 0;
	if (playing < 12) return 2;
	if (playing <= 15) return 3;

	return MAX_TEAMS;
};

/**
 * Squad sizes, largest first, never differing by more than one.
 *
 * Uneven totals put the spare body in the earlier squads rather than leaving
 * anyone unattached — a player outside a squad has no team to be rated with.
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
 * two, with the bigger squad rotating somebody through.
 *
 * This is what makes "equal sides, nobody rests permanently" work on an odd
 * headcount. Eleven players are squads of six and five playing 5v5, and the six
 * take turns sitting out rather than one person watching all night.
 */
export const getSideSize = (squadA: number, squadB: number): number => Math.min(squadA, squadB);

export interface Fixture {
	/** Position in the running order, from 0. */
	order: number;
	/** Indices into `TournamentTeams.teams`. */
	teamA: number;
	teamB: number;
}

/**
 * Who plays whom, in the order they play it.
 *
 * Two teams play three matches; three play a double round robin; four play a
 * single one. All land on six matches, which is what keeps a night the same
 * length whatever the turnout.
 *
 * The orders are hand-picked for rest on a single pitch. Four teams manage all
 * but two changeovers without a team playing twice in a row. Three teams
 * cannot: every match sits out exactly one of them, so somebody always doubles
 * up — the rotation at least spreads it evenly.
 */
const ROTATIONS: Record<number, [number, number][]> = {
	2: [
		[0, 1],
		[0, 1],
		[0, 1],
	],
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

export const getFixtures = (teamCount: number): Fixture[] =>
	(ROTATIONS[teamCount] ?? []).map(([teamA, teamB], order) => ({ order, teamA, teamB }));

/**
 * The matches that actually belong to this night.
 *
 * The scoreboard is the one thing in the app anybody at the pitch may write, so
 * what comes back from it is not automatically part of the night. A document at
 * an `order` no rotation reaches, or between two teams that fixture never puts
 * together, describes a match that was never on the card — and because the
 * screen only ever draws `getFixtures`, such a document counted towards the
 * table and towards everyone's rating without appearing anywhere that could
 * explain why.
 *
 * Security rules bind a match's document id to its `order`, which is what stops
 * two documents claiming one fixture. They cannot do the rest: a rule has no
 * cheap way to know how many teams a night split into, let alone which pairs
 * that split's rotation produces. So this is the real check, and both the screen
 * and the function that turns a scoreboard into ratings run it before reading a
 * single score.
 *
 * It also drops what a reshuffle stranded. Re-picking the teams rewrites the
 * rotation under any score already entered, and a match against a pairing that
 * no longer exists is a record of a lineup that doesn't either — the same
 * reasoning that already made `getStandings` ignore a match naming a team that
 * has gone, carried to the subtler case where both teams still exist but never
 * met.
 */
export const selectPlayedMatches = (teamCount: number, matches: TournamentMatch[]): TournamentMatch[] => {
	const fixtures = new Map(getFixtures(teamCount).map(fixture => [fixture.order, fixture]));
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

export interface ScheduleFit {
	matchCount: number;
	totalMinutes: number;
	slotMinutes: number;
	/** Minutes past the end of the slot, `0` when it fits. */
	overrunMinutes: number;
}

/**
 * Whether the night fits the season's slot.
 *
 * Reported rather than enforced: the fixture list is generated at the requested
 * match length either way, and an overrun is surfaced as a warning. Changeovers
 * are deliberately not modelled — `matchMinutes` is the admin's number and they
 * know whether theirs includes picking the bibs back up.
 */
export const getScheduleFit = (teamCount: number, matchMinutes: number, slotMinutes: number): ScheduleFit => {
	const matchCount = getFixtures(teamCount).length;
	const totalMinutes = matchCount * matchMinutes;

	return {
		matchCount,
		totalMinutes,
		slotMinutes,
		overrunMinutes: Math.max(0, totalMinutes - slotMinutes),
	};
};

/**
 * How the night reads on a badge, e.g. `5v5` or `3 teams · 4–5 a side`.
 *
 * Two teams keep the familiar `NvN` because that is what people call it. Three
 * or four say how many squads, since the side size alone stops describing the
 * evening.
 */
export const describeSquads = (sizes: number[]): string | null => {
	if (sizes.length === 0) return null;

	const smallest = Math.min(...sizes);
	const largest = Math.max(...sizes);

	if (sizes.length === 2) return `${smallest}v${smallest}`;

	const side = smallest === largest ? `${smallest}` : `${smallest}–${largest}`;

	return `${sizes.length} teams · ${side} a side`;
};
