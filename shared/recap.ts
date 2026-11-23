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

/** Fewer games than this and the bottom of the table is bad luck, not a spoon. */
export const SPOON_MIN_APPEARANCES = 3;

/** How close to kickoff an answer has to be last touched to count as late. */
const LAST_MINUTE_HOURS = 24;

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

export interface AwardsRecap {
	/** Games each player was among the counted winners of. */
	motm: Award | null;
	ironMan: Award | null;
	/** Everybody who played every game, by uid. */
	perfectAttendance: string[];
	/** Largest positive rating movement, in Elo. */
	climber: Award | null;
	/** Most consecutive wins, in kickoff order. */
	streak: Award | null;
}

export interface BanterRecap {
	noShows: Award | null;
	/** Answers last touched in the `LAST_MINUTE_HOURS` before kickoff. */
	lastMinute: Award | null;
	/** Bottom of the table among players with `SPOON_MIN_APPEARANCES`. The value is their wins. */
	woodenSpoon: Award | null;
}

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

const increment = (counts: Map<string, number>, uid: string) => counts.set(uid, (counts.get(uid) ?? 0) + 1);

const motmWins = (entries: RatingLedgerEntry[], motm: RecapInput['motm']): Map<string, number> => {
	const wins = new Map<string, number>();

	for (const entry of entries) for (const uid of motm[entry.gameId]?.winners ?? []) increment(wins, uid);

	return wins;
};

const longestStreaks = (entries: RatingLedgerEntry[]): Map<string, number> => {
	const current = new Map<string, number>();
	const best = new Map<string, number>();

	for (const entry of entries) {
		for (const [uid, position] of Object.entries(entry.positions ?? {})) {
			const run = position === 0 ? (current.get(uid) ?? 0) + 1 : 0;

			current.set(uid, run);
			best.set(uid, Math.max(best.get(uid) ?? 0, run));
		}
	}

	return best;
};

export const getAwards = (input: RecapInput): AwardsRecap => {
	const entries = seasonEntries(input);
	const table = getSeasonTable(entries, input.seasonId);
	const appearances = new Map(table.map(row => [row.uid, row.appearances]));

	return {
		motm: topAward(motmWins(entries, input.motm)),
		ironMan: topAward(appearances),
		perfectAttendance: table
			.filter(row => row.appearances === entries.length)
			.map(row => row.uid)
			.sort(),
		climber: topAward(new Map(table.map(row => [row.uid, row.movement]))),
		streak: topAward(longestStreaks(entries)),
	};
};

/** Every response to a game that was played, with the kickoff it answered. */
const playedResponses = (entries: RatingLedgerEntry[], responses: SeasonResponses) =>
	entries.flatMap(entry =>
		Object.values(responses[entry.gameId] ?? {}).map(response => ({ response, kickoff: entry.kickoff }))
	);

const lastMinuteAnswers = (answers: ReturnType<typeof playedResponses>): Map<string, number> => {
	const late = new Map<string, number>();
	const window = LAST_MINUTE_HOURS * 60 * 60 * 1000;

	for (const { response, kickoff } of answers) {
		const before = Date.parse(kickoff) - Date.parse(response.updatedAt);
		if (before >= 0 && before <= window) increment(late, response.uid);
	}

	return late;
};

const noShows = (answers: ReturnType<typeof playedResponses>): Map<string, number> => {
	const absent = new Map<string, number>();

	for (const { response } of answers) if (response.absent) increment(absent, response.uid);

	return absent;
};

/** The worst place anybody with enough games finished in, shared on a tie. Not a maximum, so not `topAward`. */
const woodenSpoon = (table: SeasonRow[]): Award | null => {
	const qualified = table.filter(row => row.appearances >= SPOON_MIN_APPEARANCES);
	if (qualified.length === 0) return null;

	const worst = Math.max(...qualified.map(row => row.position));
	const bottom = qualified.filter(row => row.position === worst);

	return { uids: bottom.map(row => row.uid).sort(), value: bottom[0].wins };
};

export const getBanter = (input: RecapInput): BanterRecap => {
	const entries = seasonEntries(input);
	const answers = playedResponses(entries, input.responses);

	return {
		noShows: topAward(noShows(answers)),
		lastMinute: topAward(lastMinuteAnswers(answers)),
		woodenSpoon: woodenSpoon(getSeasonTable(entries, input.seasonId)),
	};
};
