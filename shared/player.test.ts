import { getPlayerGames, getPlayerRecord, getRatingTrend } from './player';
import { PROVISIONAL_GAMES } from './rating';
import type { PlayerRating, RatingLedgerEntry } from './types';

const rating = (elo: number, games = PROVISIONAL_GAMES): PlayerRating => ({
	elo,
	games,
	updatedAt: '2026-09-01T19:00:00.000Z',
});

/** `week` is weeks after the first seeded kickoff, so ordering is readable. */
const entry = (
	gameId: string,
	week: number,
	positions: Record<string, number>,
	before: Record<string, number | null>,
	after: Record<string, number>,
	seasonId = 's1'
): RatingLedgerEntry => {
	const kickoff = new Date(Date.parse('2026-09-01T17:00:00.000Z') + week * 604_800_000).toISOString();

	return {
		seasonId,
		gameId,
		kickoff,
		kickoffMillis: Date.parse(kickoff),
		finalisedAt: kickoff,
		positions,
		before: Object.fromEntries(
			Object.entries(before).map(([uid, elo]) => [uid, elo === null ? null : rating(elo)])
		),
		after: Object.fromEntries(Object.entries(after).map(([uid, elo]) => [uid, rating(elo)])),
	};
};

describe('getPlayerGames', () => {
	it('reads what each game did to the player', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 1, b: 0 }, { a: 1000, b: 1000 }, { a: 980, b: 1020 })], 'a');

		expect(games).toEqual([
			{
				seasonId: 's1',
				gameId: 'g1',
				kickoff: '2026-09-01T17:00:00.000Z',
				kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z'),
				position: 1,
				won: false,
				before: 1000,
				after: 980,
				delta: -20,
			},
		]);
	});

	it('leaves out games the player did not appear in', () => {
		const games = getPlayerGames(
			[entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }), entry('g2', 1, { b: 0 }, { b: 1000 }, { b: 1020 })],
			'a'
		);

		expect(games.map(game => game.gameId)).toEqual(['g1']);
	});

	it('runs oldest first however the query returned them', () => {
		const games = getPlayerGames(
			[
				entry('g3', 2, { a: 0 }, { a: 1010 }, { a: 1030 }),
				entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }),
				entry('g2', 1, { a: 1 }, { a: 1020 }, { a: 1010 }),
			],
			'a'
		);

		expect(games.map(game => game.gameId)).toEqual(['g1', 'g2', 'g3']);
	});

	// Two games in different seasons can share a slot, and a career that reorders
	// itself between devices is a career nobody can quote.
	it('breaks a kickoff tie on the game id', () => {
		const games = getPlayerGames(
			[
				entry('sunday', 0, { a: 0 }, { a: 1000 }, { a: 1020 }, 's2'),
				entry('frescati', 0, { a: 1 }, { a: 1000 }, { a: 980 }),
			],
			'a'
		);

		expect(games.map(game => game.gameId)).toEqual(['frescati', 'sunday']);
	});

	// They had no rating to move, so the whole distance from a seed nobody stored
	// is not a gain they made.
	it('counts no movement for a player who arrived unrated', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 0 }, { a: null }, { a: 1030 })], 'a');

		expect(games[0]).toMatchObject({ before: null, after: 1030, delta: 0 });
	});

	it('shares a win with everyone on a joint-first team', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 0, b: 0, c: 2 }, { a: 1000 }, { a: 1000 })], 'a');

		expect(games[0].won).toBe(true);
	});

	it('skips a ledger entry written before positions existed', () => {
		const legacy = entry('g1', 0, {}, { a: 1000 }, { a: 1010 });
		delete (legacy as Partial<RatingLedgerEntry>).positions;

		expect(getPlayerGames([legacy], 'a')).toEqual([]);
	});

	it('has nothing to show for somebody who has never played', () => {
		expect(getPlayerGames([], 'a')).toEqual([]);
	});
});

describe('getPlayerRecord', () => {
	const season = [
		entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }),
		entry('g2', 1, { a: 0 }, { a: 1020 }, { a: 1040 }),
		entry('g3', 2, { a: 2 }, { a: 1040 }, { a: 1010 }),
		entry('g4', 3, { a: 0 }, { a: 1010 }, { a: 1030 }),
	];

	it('counts appearances and wins', () => {
		expect(getPlayerRecord(season, 'a')).toMatchObject({ appearances: 4, wins: 3 });
	});

	it('finds the longest run of wins', () => {
		expect(getPlayerRecord(season, 'a').bestRun).toBe(2);
	});

	it('counts the run they are on right now', () => {
		expect(getPlayerRecord(season, 'a').currentRun).toBe(1);
	});

	it('is on no run at all after a game they did not win', () => {
		expect(getPlayerRecord(season.slice(0, 3), 'a').currentRun).toBe(0);
	});

	// The peak is a high-water mark, so a rating that has since come back down
	// must not quietly follow it.
	it('remembers the highest rating ever carried out of a game', () => {
		expect(getPlayerRecord(season, 'a').peak).toBe(1040);
	});

	it('has no peak for somebody who has never played', () => {
		expect(getPlayerRecord([], 'a')).toMatchObject({ appearances: 0, wins: 0, bestRun: 0, peak: null });
	});
});

describe('getRatingTrend', () => {
	it('opens on the rating they took into their first game', () => {
		const games = getPlayerGames(
			[entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }), entry('g2', 1, { a: 1 }, { a: 1020 }, { a: 1005 })],
			'a'
		);

		expect(getRatingTrend(games)).toEqual([1000, 1020, 1005]);
	});

	// There was no rating before their first game, so a line drawn from one would
	// show a movement that never happened.
	it('starts at the first result for somebody who arrived unrated', () => {
		const games = getPlayerGames(
			[entry('g1', 0, { a: 0 }, { a: null }, { a: 1030 }), entry('g2', 1, { a: 1 }, { a: 1030 }, { a: 1015 })],
			'a'
		);

		expect(getRatingTrend(games)).toEqual([1030, 1015]);
	});

	it('has nothing to draw for somebody who has never played', () => {
		expect(getRatingTrend([])).toEqual([]);
	});
});
