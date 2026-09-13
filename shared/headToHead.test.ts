import { getHeadToHead, getHeadToHeadRun } from './headToHead';
import type { RatingLedgerEntry } from './types';

/**
 * One rated game. `teams` maps uid to the team they were on and `positions` to
 * where that team finished, which is the pair the whole module turns on.
 */
const entry = (
	gameId: string,
	teams: Record<string, number>,
	positions: Record<string, number>,
	kickoffMillis = 1_000
): RatingLedgerEntry =>
	({
		seasonId: 'season-1',
		gameId,
		kickoff: new Date(kickoffMillis).toISOString(),
		kickoffMillis,
		teams,
		positions,
		after: Object.fromEntries(Object.keys(teams).map(uid => [uid, { elo: 1000, games: 1 }])),
	}) as unknown as RatingLedgerEntry;

/** Anna beats Bjorn: opposite teams, Anna's finishes above. */
const annaBeatsBjorn = (gameId: string, kickoffMillis: number) =>
	entry(gameId, { anna: 0, bjorn: 1 }, { anna: 0, bjorn: 1 }, kickoffMillis);

describe('getHeadToHead', () => {
	it('reads a win on opposite teams from both sides', () => {
		const entries = [annaBeatsBjorn('g1', 1_000)];

		expect(getHeadToHead(entries, 'anna', 'bjorn').games[0]).toMatchObject({
			together: false,
			result: 'won',
			position: 0,
			theirPosition: 1,
		});
		expect(getHeadToHead(entries, 'bjorn', 'anna').games[0]).toMatchObject({ together: false, result: 'lost' });
	});

	it('calls a level finish on opposite teams a draw', () => {
		const [game] = getHeadToHead(
			[entry('g1', { anna: 0, bjorn: 1 }, { anna: 0, bjorn: 0 })],
			'anna',
			'bjorn'
		).games;

		expect(game).toMatchObject({ together: false, result: 'drew' });
	});

	// A shared team cannot draw with itself, so both take the same answer.
	it('gives a shared team one result between them', () => {
		const won = entry('g1', { anna: 0, bjorn: 0 }, { anna: 0, bjorn: 0 });

		expect(getHeadToHead([won], 'anna', 'bjorn').games[0]).toMatchObject({ together: true, result: 'won' });
		expect(getHeadToHead([won], 'bjorn', 'anna').games[0]).toMatchObject({ together: true, result: 'won' });
	});

	it('calls a shared team that finished below the top a loss for both', () => {
		const lost = entry('g1', { anna: 1, bjorn: 1 }, { anna: 2, bjorn: 2 });

		expect(getHeadToHead([lost], 'anna', 'bjorn').games[0]).toMatchObject({ together: true, result: 'lost' });
	});

	it('leaves out a game only one of them played', () => {
		const entries = [entry('g1', { anna: 0, chris: 1 }, { anna: 0, chris: 1 })];

		expect(getHeadToHead(entries, 'anna', 'bjorn').games).toEqual([]);
	});

	// The missing field is the only thing separating a teammate from an
	// opponent, so there is no honest way to read one of these.
	it('skips an entry written before the team map existed', () => {
		const old = { seasonId: 's', gameId: 'g1', positions: { anna: 0, bjorn: 1 } } as unknown as RatingLedgerEntry;

		expect(getHeadToHead([old], 'anna', 'bjorn').games).toEqual([]);
	});

	it('puts the most recent game first', () => {
		const { games } = getHeadToHead([annaBeatsBjorn('old', 1_000), annaBeatsBjorn('new', 9_000)], 'anna', 'bjorn');

		expect(games.map(game => game.gameId)).toEqual(['new', 'old']);
	});

	// Whichever way round the query happened to return them. Two games can share
	// a kickoff, and a list that drew in a different order on each device is a
	// list two people cannot talk about.
	it('orders two games that kicked off at once the same way every time', () => {
		const oneWay = getHeadToHead([annaBeatsBjorn('b', 1_000), annaBeatsBjorn('a', 1_000)], 'anna', 'bjorn');
		const theOther = getHeadToHead([annaBeatsBjorn('a', 1_000), annaBeatsBjorn('b', 1_000)], 'anna', 'bjorn');

		expect(oneWay.games.map(game => game.gameId)).toEqual(['a', 'b']);
		expect(theOther.games.map(game => game.gameId)).toEqual(['a', 'b']);
	});

	/**
	 * The reason the summary is read off `getPlayerLinks` rather than counted
	 * here. A row on the profile saying 1/3 and the screen it opens listing four
	 * games is the kind of disagreement nobody trusts a second time.
	 */
	it('agrees with the totals on the profile row it opens from', () => {
		const entries = [
			annaBeatsBjorn('g1', 1_000),
			annaBeatsBjorn('g2', 2_000),
			entry('g3', { anna: 0, bjorn: 1 }, { anna: 1, bjorn: 0 }, 3_000),
			entry('g4', { anna: 0, bjorn: 1 }, { anna: 0, bjorn: 0 }, 4_000),
			entry('g5', { anna: 0, bjorn: 0 }, { anna: 0, bjorn: 0 }, 5_000),
			entry('g6', { anna: 1, bjorn: 1 }, { anna: 2, bjorn: 2 }, 6_000),
		];

		const { link, games } = getHeadToHead(entries, 'anna', 'bjorn');
		const against = games.filter(game => !game.together);
		const together = games.filter(game => game.together);

		expect(link).not.toBeNull();
		expect(link!.shared).toBe(games.length);
		expect(link!.against).toBe(against.length);
		expect(link!.beat).toBe(against.filter(game => game.result === 'won').length);
		expect(link!.drewWith).toBe(against.filter(game => game.result === 'drew').length);
		expect(link!.lostTo).toBe(against.filter(game => game.result === 'lost').length);
		expect(link!.together).toBe(together.length);
		expect(link!.wonTogether).toBe(together.filter(game => game.result === 'won').length);
	});

	// Zeroes would draw a table about a pairing there is nothing to say about.
	it('has no totals for two players who have never met', () => {
		expect(getHeadToHead([], 'anna', 'bjorn').link).toBeNull();
	});
});

describe('getHeadToHeadRun', () => {
	it('counts the run of results going the same way', () => {
		const { games } = getHeadToHead(
			[annaBeatsBjorn('g1', 1_000), annaBeatsBjorn('g2', 2_000), annaBeatsBjorn('g3', 3_000)],
			'anna',
			'bjorn'
		);

		expect(getHeadToHeadRun(games)).toEqual({ result: 'won', count: 3 });
	});

	it('stops the run at the game that went the other way', () => {
		const { games } = getHeadToHead(
			[
				annaBeatsBjorn('g1', 1_000),
				entry('g2', { anna: 0, bjorn: 1 }, { anna: 1, bjorn: 0 }, 2_000),
				annaBeatsBjorn('g3', 3_000),
			],
			'anna',
			'bjorn'
		);

		expect(getHeadToHeadRun(games)).toEqual({ result: 'won', count: 1 });
	});

	// A night on the same team settles nothing about which of the two is on top,
	// so it neither extends a run nor breaks one.
	it('reads through a game they played together', () => {
		const { games } = getHeadToHead(
			[
				annaBeatsBjorn('g1', 1_000),
				entry('g2', { anna: 0, bjorn: 0 }, { anna: 0, bjorn: 0 }, 2_000),
				annaBeatsBjorn('g3', 3_000),
			],
			'anna',
			'bjorn'
		);

		expect(getHeadToHeadRun(games)).toEqual({ result: 'won', count: 2 });
	});

	it('has no run when the last meeting was level', () => {
		const { games } = getHeadToHead(
			[annaBeatsBjorn('g1', 1_000), entry('g2', { anna: 0, bjorn: 1 }, { anna: 0, bjorn: 0 }, 2_000)],
			'anna',
			'bjorn'
		);

		expect(getHeadToHeadRun(games)).toBeNull();
	});

	it('has no run when the two have only ever been on the same team', () => {
		const { games } = getHeadToHead([entry('g1', { anna: 0, bjorn: 0 }, { anna: 0, bjorn: 0 })], 'anna', 'bjorn');

		expect(getHeadToHeadRun(games)).toBeNull();
	});
});
