import { zonedCivilDate } from './datetime';
import { getGameLifecycle } from './game';
import { getHeadToHead, getHeadToHeadRun } from './headToHead';
import { FORM_LENGTH } from './leaderboard';
import type { PlayerGame } from './player';
import { getPlayerGames } from './player';
import { BASE_ELO, getWinProbability, hasPlayed, toDisplayRating } from './rating';
import { getStandings } from './standings';
import { getFixtures } from './tournament';
import type { Game, PlayerRating, RatingLedgerEntry, Season, TournamentMatch, TournamentTeams } from './types';

/**
 * What the matchday programme says about tonight, worked out from the ledger
 * and the lineup and stored nowhere.
 *
 * Nothing here is written down because a corrected score or a rating replay
 * would leave a stored copy telling the old story. Recomputed on every open,
 * the programme always agrees with the table beside it.
 */

/** Opposite-team meetings a pair needs before they count as a rivalry. */
const RIVALRY_MIN_MEETINGS = 3;

/** Wins or losses in a row before a run is worth mentioning. */
const RUN_MIN = 3;

/** Days since the last game before a player counts as coming back. */
const RETURN_MIN_DAYS = 28;

/** Man of the match votes in a row before that is a run. */
const MOTM_RUN_MIN = 2;

/** A milestone is the next multiple of this on the 0 to 100 rating. */
const MILESTONE_STEP = 10;

/** Simulated evenings behind the odds for three or four teams. */
const ODDS_RUNS = 2000;

const DAY_MS = 86_400_000;

/**
 * Whether the programme should be offered for this game right now: the kickoff
 * date in the season's own timezone, from midnight until the final whistle.
 */
export const isGameDay = (
	game: Pick<Game, 'kickoff' | 'endsAt' | 'status'>,
	season: Pick<Season, 'responseDeadlineHours'> & { slot: Pick<Season['slot'], 'timezone'> },
	now: Date
): boolean => {
	const lifecycle = getGameLifecycle(game, season, now);
	if (lifecycle === 'cancelled' || lifecycle === 'finished') return false;

	const timezone = season.slot.timezone;

	return zonedCivilDate(now.toISOString(), timezone) === zonedCivilDate(game.kickoff, timezone);
};

export interface TeamOdds {
	team: number;
	percent: number;
}

/** A string to a 32-bit seed, so the same lineup always draws the same evenings. */
const hashSeed = (seed: string): number => {
	let hash = 2166136261;

	for (let index = 0; index < seed.length; index++) {
		hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
	}

	return hash >>> 0;
};

/** mulberry32: small, fast and good enough to roll a few thousand football matches. */
const createRandom = (seed: string): (() => number) => {
	let state = hashSeed(seed);

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

/**
 * Shares of 1 to whole percentages that add up to exactly 100, by giving the
 * leftover points to the largest remainders. Rounding each on its own can come
 * to 99 or 101, which reads as a bug on a screen full of percentages.
 */
const toWholePercents = (shares: number[]): number[] => {
	const raw = shares.map(share => share * 100);
	const whole = raw.map(Math.floor);
	let left = 100 - whole.reduce((total, value) => total + value, 0);

	const byRemainder = raw
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder || a.index - b.index);

	for (const { index } of byRemainder) {
		if (left <= 0) break;
		whole[index]++;
		left--;
	}

	return whole;
};

/** One simulated evening: every fixture won 1-0 by a side drawn from the Elo odds. */
const playEvening = (
	fixtures: ReturnType<typeof getFixtures>,
	teamElos: number[],
	random: () => number
): TournamentMatch[] =>
	fixtures.map(({ order, teamA, teamB }) => {
		const aWins = random() < getWinProbability(teamElos[teamA], teamElos[teamB]);

		return { order, teamA, teamB, scoreA: aWins ? 1 : 0, scoreB: aWins ? 0 : 1, updatedBy: '', updatedAt: '' };
	});

/**
 * Each team's chance of topping the table tonight, as whole percentages that
 * total 100.
 *
 * Team strength is the squad's average of the Elos the lineup was built from,
 * which already holds a seed for anybody unrated. Two teams play one match, so
 * the Elo win probability is the answer. Three or four play a round robin, so
 * the fixture list is played out `ODDS_RUNS` times and a shared top spot splits
 * that evening between the teams on it. Seeded, so the numbers only move when
 * the lineup does.
 */
export const getTeamOdds = (
	lineup: Pick<TournamentTeams, 'teams' | 'elos' | 'settings'>,
	slotMinutes: number,
	seed: string
): TeamOdds[] => {
	const teamElos = lineup.teams.map(team =>
		team.uids.length === 0
			? BASE_ELO
			: team.uids.reduce((total, uid) => total + (lineup.elos[uid] ?? BASE_ELO), 0) / team.uids.length
	);

	if (teamElos.length === 2) {
		const first = getWinProbability(teamElos[0], teamElos[1]);

		return toWholePercents([first, 1 - first]).map((percent, team) => ({ team, percent }));
	}

	const fixtures = getFixtures(teamElos.length, lineup.settings.matchMinutes, slotMinutes);
	const random = createRandom(seed);
	const tops = teamElos.map(() => 0);

	for (let run = 0; run < ODDS_RUNS; run++) {
		const leaders = getStandings(teamElos.length, playEvening(fixtures, teamElos, random)).filter(
			standing => standing.position === 0
		);

		for (const leader of leaders) tops[leader.team] += 1 / leaders.length;
	}

	return toWholePercents(tops.map(top => top / ODDS_RUNS)).map((percent, team) => ({ team, percent }));
};

export type FormResult = 'W' | 'D' | 'L';

export interface FormLine {
	uid: string;
	/** Oldest first, at most `FORM_LENGTH`. Empty for somebody who has never played. */
	results: FormResult[];
}

/**
 * Whether the top of this game's table was shared between teams. Needs the team
 * map: without it two players level on 0 could be teammates, so an old entry
 * reads as an outright win, which is what the season table counts it as.
 */
const isSharedTop = (entry: RatingLedgerEntry): boolean => {
	if (!entry.teams) return false;

	const topTeams = new Set(
		Object.entries(entry.positions)
			.filter(([, position]) => position === 0)
			.map(([uid]) => entry.teams?.[uid])
	);

	return topTeams.size > 1;
};

/** Everybody's last few results, W for an outright first, D for a shared one, L for anything else. */
export const getForm = (entries: RatingLedgerEntry[], uids: string[]): FormLine[] => {
	const byGame = new Map(entries.map(entry => [entry.gameId, entry]));

	return uids.map(uid => ({
		uid,
		results: getPlayerGames(entries, uid)
			.slice(-FORM_LENGTH)
			.map(game => {
				if (!game.won) return 'L';

				return isSharedTop(byGame.get(game.gameId)!) ? 'D' : 'W';
			}),
	}));
};

export interface Rivalry {
	/** The pair, `a` before `b` by uid so the same two always read the same way round. */
	a: string;
	b: string;
	/** Games on opposite teams. Same-team games settle nothing between them. */
	meetings: number;
	aWins: number;
	bWins: number;
	draws: number;
	/** Two or more meetings in a row gone one way, ending with the latest. */
	run: { uid: string; count: number } | null;
	/** On opposite teams in tonight's lineup, rather than just both in the pool. */
	tonight: boolean;
}

const candidatePairs = (pool: string[], lineup: Pick<TournamentTeams, 'teams'> | null): [string, string][] => {
	const teamOf = new Map(lineup?.teams.flatMap(team => team.uids.map(uid => [uid, team.index] as const)) ?? []);
	const players = lineup ? [...teamOf.keys()] : pool;
	const sorted = [...new Set(players)].sort();
	const pairs: [string, string][] = [];

	for (let i = 0; i < sorted.length; i++) {
		for (let j = i + 1; j < sorted.length; j++) {
			if (lineup && teamOf.get(sorted[i]) === teamOf.get(sorted[j])) continue;
			pairs.push([sorted[i], sorted[j]]);
		}
	}

	return pairs;
};

const readRivalry = (entries: RatingLedgerEntry[], a: string, b: string, tonight: boolean): Rivalry => {
	const games = getHeadToHead(entries, a, b).games.filter(game => !game.together);
	const run = getHeadToHeadRun(games);

	return {
		a,
		b,
		meetings: games.length,
		aWins: games.filter(game => game.result === 'won').length,
		bWins: games.filter(game => game.result === 'lost').length,
		draws: games.filter(game => game.result === 'drew').length,
		run: run && run.count >= 2 ? { uid: run.result === 'won' ? a : b, count: run.count } : null,
		tonight,
	};
};

/**
 * The rivalry of the night: the pair with the most meetings on opposite teams,
 * the closer record winning a tie. With a lineup, only pairs on opposite teams
 * tonight. Before there is one, any two players in the pool, as a possible
 * meeting. `null` below `RIVALRY_MIN_MEETINGS`.
 */
export const getRivalry = (
	entries: RatingLedgerEntry[],
	pool: string[],
	lineup: Pick<TournamentTeams, 'teams'> | null
): Rivalry | null => {
	const rivalries = candidatePairs(pool, lineup)
		.map(([a, b]) => readRivalry(entries, a, b, lineup !== null))
		.filter(rivalry => rivalry.meetings >= RIVALRY_MIN_MEETINGS)
		.sort(
			(x, y) =>
				y.meetings - x.meetings ||
				Math.abs(x.aWins - x.bWins) - Math.abs(y.aWins - y.bWins) ||
				(x.a + x.b < y.a + y.b ? -1 : 1)
		);

	return rivalries[0] ?? null;
};

export type Storyline =
	| { kind: 'winRun'; uid: string; count: number }
	| { kind: 'lossRun'; uid: string; count: number }
	| { kind: 'milestone'; uid: string; target: number }
	| { kind: 'debut'; uid: string }
	| { kind: 'return'; uid: string; days: number }
	| { kind: 'motmRun'; uid: string; count: number };

const STORYLINE_ORDER: Storyline['kind'][] = ['winRun', 'lossRun', 'milestone', 'debut', 'return', 'motmRun'];

/** How many games at the end of the list pass `test`, counting back from the latest. */
const trailing = (games: PlayerGame[], test: (game: PlayerGame) => boolean): number => {
	let count = 0;

	for (let index = games.length - 1; index >= 0 && test(games[index]); index--) count++;

	return count;
};

const milestoneFor = (rating: PlayerRating | undefined): number | null => {
	if (!hasPlayed(rating)) return null;

	const display = toDisplayRating(rating!.elo);

	return display % MILESTONE_STEP === MILESTONE_STEP - 1 ? display + 1 : null;
};

/** The one storyline this player gets, the highest in `STORYLINE_ORDER` they qualify for. */
const storylineFor = (
	uid: string,
	games: PlayerGame[],
	rating: PlayerRating | undefined,
	kickoffMillis: number
): Storyline | null => {
	const wins = trailing(games, game => game.won);
	if (wins >= RUN_MIN) return { kind: 'winRun', uid, count: wins };

	const losses = trailing(games, game => !game.won);
	if (losses >= RUN_MIN) return { kind: 'lossRun', uid, count: losses };

	const target = milestoneFor(rating);
	if (target !== null) return { kind: 'milestone', uid, target };

	if (games.length === 0) return hasPlayed(rating) ? null : { kind: 'debut', uid };

	const days = Math.floor((kickoffMillis - games[games.length - 1].kickoffMillis) / DAY_MS);
	if (days >= RETURN_MIN_DAYS) return { kind: 'return', uid, days };

	const votes = trailing(games, game => game.motm);
	if (votes >= MOTM_RUN_MIN) return { kind: 'motmRun', uid, count: votes };

	return null;
};

const sizeOf = (storyline: Storyline): number =>
	'count' in storyline ? storyline.count : 'days' in storyline ? storyline.days : 0;

/**
 * Up to `limit` things worth knowing about tonight's players, at most one each,
 * ordered by how good a story they are and then by how big.
 */
export const getStorylines = (
	entries: RatingLedgerEntry[],
	pool: string[],
	ratings: Record<string, PlayerRating | undefined>,
	kickoffMillis: number,
	limit = 3
): Storyline[] =>
	pool
		.map(uid => storylineFor(uid, getPlayerGames(entries, uid), ratings[uid], kickoffMillis))
		.filter((storyline): storyline is Storyline => storyline !== null)
		.sort(
			(x, y) =>
				STORYLINE_ORDER.indexOf(x.kind) - STORYLINE_ORDER.indexOf(y.kind) ||
				sizeOf(y) - sizeOf(x) ||
				(x.uid < y.uid ? -1 : 1)
		)
		.slice(0, limit);
