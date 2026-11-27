import { getSeasonTable } from './leaderboard';
import type { FormResult } from './matchday';
import { RUN_MIN, getResults, trailing } from './matchday';
import type { PlayerGame } from './player';
import { getPlayerGames } from './player';
import { PROVISIONAL_GAMES, toDisplayRating } from './rating';
import type { RatingLedgerEntry, TournamentResult } from './types';

/**
 * One player's own night, told the moment the result is confirmed.
 *
 * Computed on every open from the result document and the ledger, like the
 * programme and the recap, so a corrected score tells the corrected story.
 */

/** How long after a result its card still takes over the season home. */
const FULL_TIME_WINDOW_DAYS = 7;

/** The most highlight lines one card carries. */
const MAX_HIGHLIGHTS = 2;

/** A table move worth a line: this many places, or any move into first. */
const TABLE_MOVE_MIN = 2;

export type FullTimeHighlight =
	| { kind: 'runStarted' }
	| { kind: 'runExtended'; count: number }
	| { kind: 'runEnded'; count: number }
	/** 0-indexed season table places, as `SeasonRow.position` counts them. */
	| { kind: 'tableMove'; from: number; to: number }
	/** On the displayed 0 to 100 scale. */
	| { kind: 'careerBest'; rating: number }
	| { kind: 'firstWin' };

export interface FullTimeCard {
	seasonId: string;
	gameId: string;
	kickoff: string;
	finalisedAt: string;
	team: number;
	/** 0-indexed, shared on a tie. */
	position: number;
	/** Another team finished in the same place. */
	shared: boolean;
	teamCount: number;
	record: { won: number; drawn: number; lost: number };
	/** Elo, straight from the result's `RatingDelta`, so the card agrees with the team sheet. */
	before: number;
	after: number;
	delta: number;
	/** At most `MAX_HIGHLIGHTS`, the best first. */
	highlights: FullTimeHighlight[];
}

const runHighlight = (earlier: FormResult[], result: FormResult): FullTimeHighlight | null => {
	const before = trailing(earlier, previous => previous === 'W');

	if (result !== 'W') return result === 'L' && before >= RUN_MIN ? { kind: 'runEnded', count: before } : null;
	if (before + 1 >= RUN_MIN) return { kind: 'runExtended', count: before + 1 };

	return before + 1 === 2 ? { kind: 'runStarted' } : null;
};

const tableHighlight = (seasonEntries: RatingLedgerEntry[], entry: RatingLedgerEntry, uid: string) => {
	const placeIn = (entries: RatingLedgerEntry[]) =>
		getSeasonTable(entries, entry.seasonId).find(row => row.uid === uid)?.position;

	const from = placeIn(seasonEntries.filter(other => other.gameId !== entry.gameId));
	const to = placeIn(seasonEntries);

	if (from === undefined || to === undefined) return null;
	if (from - to >= TABLE_MOVE_MIN || (to === 0 && from > 0)) return { kind: 'tableMove' as const, from, to };

	return null;
};

const bestHighlight = (earlier: PlayerGame[], after: number): FullTimeHighlight | null => {
	if (earlier.length < PROVISIONAL_GAMES) return null;

	const rating = toDisplayRating(after);
	const peak = Math.max(...earlier.flatMap(game => [game.before ?? game.after, game.after]).map(toDisplayRating));

	return rating > peak ? { kind: 'careerBest', rating } : null;
};

/**
 * The card for `uid` in `gameId`, or `null` when the result did not rate them
 * or the ledger cannot say which team they were on.
 *
 * `careerEntries` is every game they have played, for runs and their best
 * rating. `seasonEntries` is the season's, for the table and the team map.
 */
export const getFullTimeCard = (
	careerEntries: RatingLedgerEntry[],
	seasonEntries: RatingLedgerEntry[],
	result: TournamentResult,
	gameId: string,
	uid: string
): FullTimeCard | null => {
	const change = result.changes.find(candidate => candidate.uid === uid);
	const entry = seasonEntries.find(candidate => candidate.gameId === gameId);
	const team = entry?.teams?.[uid];
	const standing = result.standings.find(candidate => candidate.team === team);

	if (!change || !entry || team === undefined || !standing) return null;

	const games = getPlayerGames(careerEntries, uid);
	const index = games.findIndex(game => game.gameId === gameId);
	const before = index === -1 ? games.length : index;
	const earlier = getResults(careerEntries, uid).slice(0, before);
	const shared = result.standings.some(other => other.team !== team && other.position === standing.position);
	const outcome: FormResult = standing.position !== 0 ? 'L' : shared ? 'D' : 'W';

	const highlights = [
		runHighlight(earlier, outcome),
		tableHighlight(seasonEntries, entry, uid),
		bestHighlight(games.slice(0, before), change.after),
		outcome === 'W' && !earlier.includes('W') ? ({ kind: 'firstWin' } as const) : null,
	].filter((highlight): highlight is FullTimeHighlight => highlight !== null);

	return {
		seasonId: entry.seasonId,
		gameId,
		kickoff: entry.kickoff,
		finalisedAt: entry.finalisedAt,
		team,
		position: standing.position,
		shared,
		teamCount: result.standings.length,
		record: { won: standing.won, drawn: standing.drawn, lost: standing.lost },
		before: change.before,
		after: change.after,
		delta: change.delta,
		highlights: highlights.slice(0, MAX_HIGHLIGHTS),
	};
};

/**
 * Whether a game kicked off before full-time cards began. `from` is that start,
 * or `null` where there is none, which is how the emulators run: their whole
 * history is seeded in the past, and none of it is anybody's real last game.
 */
export const isBeforeFullTime = (kickoff: string, from: string | null): boolean => from !== null && kickoff < from;

/**
 * The game whose card should take over the season home, if any: the season's
 * most recently confirmed game, if `uid` played in it, it was confirmed within
 * `FULL_TIME_WINDOW_DAYS`, and this device has not seen a card confirmed that
 * late or later.
 *
 * `seenAt` is this season's mark, a confirmation time rather than a game id,
 * so a result cleared and confirmed again, which stamps a new `finalisedAt`,
 * takes over once more. A rating replay keeps the original stamp, so it does
 * not, and the card still shows the replayed numbers whenever it is opened.
 * A game that kicked off before `from` never takes over.
 */
export const pickFullTimeTakeover = (
	seasonEntries: RatingLedgerEntry[],
	uid: string,
	now: Date,
	seenAt: string | null,
	from: string | null
): RatingLedgerEntry | null => {
	const latest = [...seasonEntries].sort(
		(a, b) => b.finalisedAt.localeCompare(a.finalisedAt) || b.gameId.localeCompare(a.gameId)
	)[0];

	if (!latest || latest.positions[uid] === undefined) return null;
	if (isBeforeFullTime(latest.kickoff, from)) return null;
	if (now.getTime() - new Date(latest.finalisedAt).getTime() > FULL_TIME_WINDOW_DAYS * 86_400_000) return null;
	if (seenAt !== null && latest.finalisedAt <= seenAt) return null;

	return latest;
};
