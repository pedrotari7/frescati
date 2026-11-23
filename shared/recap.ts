import { getSeasonTable } from './leaderboard';
import type { SeasonRow } from './leaderboard';
import { seasonExtras } from './availability';
import type { SeasonResponses } from './availability';
import type { Game, RatingLedgerEntry, TournamentMatch, TournamentMotm } from './types';

/**
 * The end-of-season recap, worked out from what the season already stored.
 *
 * Nothing here is written anywhere. The backend only decides *when* a season is
 * over (`isSeasonFinished`, stamped as `recapReadyAt`); every number on a slide
 * is computed when the slides open, so a score corrected after the stamp shows
 * up the next time somebody watches.
 */

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

/** Everybody level on the best value. Never empty: no winner is `null` instead. */
export interface Award {
	uids: string[];
	value: number;
}

export interface MatchHighlight {
	gameId: string;
	kickoff: string;
	match: TournamentMatch;
}

export interface ClubRecap {
	gamesPlayed: number;
	totalGoals: number;
	/** Mean appearances per rated game, rounded to one decimal. */
	averageTurnout: number;
	players: number;
	extras: number;
	/** Table rows with `position <= 2`, so a tie can put more than three on it. */
	podium: SeasonRow[];
	highestScoring: MatchHighlight | null;
	biggestWin: MatchHighlight | null;
	/** Smallest non-zero margin. A level match is a draw, not a finish. */
	closestFinish: MatchHighlight | null;
	bestTurnout: { gameId: string; kickoff: string; turnout: number } | null;
}

/**
 * Whether there is nothing left in the season to happen.
 *
 * Every game still on the calendar has to have ended and been rated. A
 * cancelled one is off the calendar. A game that was played and never scored
 * holds the whole thing back, on purpose: a recap with a result missing would
 * tell a different story from the table beside it, and the fix is one score or
 * one cancellation away. A season with nothing left that counts was never
 * played, so it never finishes.
 */
export const isSeasonFinished = (
	games: Pick<Game, 'id' | 'status' | 'endsAt'>[],
	entries: Pick<RatingLedgerEntry, 'gameId'>[],
	nowIso: string
): boolean => {
	const counted = games.filter(game => game.status !== 'cancelled');
	const rated = new Set(entries.map(entry => entry.gameId));

	return counted.length > 0 && counted.every(game => game.endsAt <= nowIso && rated.has(game.id));
};

/** The largest value with every uid on it, or `null` when nobody beats `floor`. */
export const topAward = (values: Map<string, number>, floor = 0): Award | null => {
	let best = floor;
	let uids: string[] = [];

	for (const [uid, value] of values) {
		if (value > best) {
			best = value;
			uids = [uid];
		} else if (value === best && uids.length > 0) {
			uids.push(uid);
		}
	}

	return uids.length > 0 ? { uids: uids.sort(), value: best } : null;
};

/** The season's entries in kickoff order, the order every streak and journey reads them in. */
const seasonEntries = (input: Pick<RecapInput, 'entries' | 'seasonId'>): RatingLedgerEntry[] =>
	input.entries
		.filter(entry => entry.seasonId === input.seasonId)
		.sort((a, b) => a.kickoffMillis - b.kickoffMillis || (a.gameId < b.gameId ? -1 : 1));

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

/** Every scoreline, earliest game first, so a tie between two goes to the one that came first. */
const allMatches = (entries: RatingLedgerEntry[], matches: RecapInput['matches']): MatchHighlight[] =>
	entries.flatMap(entry =>
		(matches[entry.gameId] ?? []).map(match => ({ gameId: entry.gameId, kickoff: entry.kickoff, match }))
	);

/** The first highlight with the biggest score, or `null` when nothing scores above zero. */
const bestBy = (highlights: MatchHighlight[], score: (match: TournamentMatch) => number): MatchHighlight | null => {
	let best: MatchHighlight | null = null;

	for (const highlight of highlights) {
		const value = score(highlight.match);
		if (value > 0 && (!best || value > score(best.match))) best = highlight;
	}

	return best;
};

const goals = (match: TournamentMatch): number => match.scoreA + match.scoreB;
const margin = (match: TournamentMatch): number => Math.abs(match.scoreA - match.scoreB);

/** Inverted so `bestBy` finds the smallest margin. A draw scores zero and is skipped. */
const closeness = (match: TournamentMatch): number => (margin(match) === 0 ? 0 : 1 / margin(match));

const bestTurnout = (entries: RatingLedgerEntry[]): ClubRecap['bestTurnout'] => {
	let best: ClubRecap['bestTurnout'] = null;

	for (const entry of entries) {
		const turnout = Object.keys(entry.positions ?? {}).length;
		if (!best || turnout > best.turnout) best = { gameId: entry.gameId, kickoff: entry.kickoff, turnout };
	}

	return best;
};

export const getClubRecap = (input: RecapInput): ClubRecap => {
	const entries = seasonEntries(input);
	const highlights = allMatches(entries, input.matches);
	const appearances = entries.reduce((sum, entry) => sum + Object.keys(entry.positions ?? {}).length, 0);
	const players = new Set(entries.flatMap(entry => Object.keys(entry.positions ?? {})));

	return {
		gamesPlayed: entries.length,
		totalGoals: highlights.reduce((sum, { match }) => sum + goals(match), 0),
		averageTurnout: entries.length > 0 ? roundToTenth(appearances / entries.length) : 0,
		players: players.size,
		extras: seasonExtras(input.memberUids, input.responses).filter(uid => players.has(uid)).length,
		podium: getSeasonTable(entries, input.seasonId).filter(row => row.position <= 2),
		highestScoring: bestBy(highlights, goals),
		biggestWin: bestBy(highlights, margin),
		closestFinish: bestBy(highlights, closeness),
		bestTurnout: bestTurnout(entries),
	};
};
