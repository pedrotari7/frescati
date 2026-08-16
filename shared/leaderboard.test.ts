import { FORM_LENGTH, getRatingLadder, getSeasonTable, toDisplayMovement } from './leaderboard';
import { BASE_ELO, PROVISIONAL_GAMES } from './rating';
import type { AppUser, PlayerRating, RatingLedgerEntry } from './types';

const user = (uid: string, rating?: PlayerRating): AppUser => ({ uid, displayName: uid, rating }) as unknown as AppUser;

const rating = (elo: number, games = PROVISIONAL_GAMES): PlayerRating => ({
	elo,
	games,
	updatedAt: '2026-09-01T19:00:00.000Z',
});

const entry = (
	gameId: string,
	seasonId: string,
	positions: Record<string, number>,
	before: Record<string, number | null>,
	after: Record<string, number>,
	seedElo?: number
): RatingLedgerEntry => ({
	seasonId,
	gameId,
	kickoff: '2026-09-01T17:00:00.000Z',
	kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z'),
	finalisedAt: '2026-09-02T17:00:00.000Z',
	positions,
	before: Object.fromEntries(Object.entries(before).map(([uid, elo]) => [uid, elo === null ? null : rating(elo)])),
	after: Object.fromEntries(Object.entries(after).map(([uid, elo]) => [uid, rating(elo)])),
	...(seedElo === undefined ? {} : { seedElo }),
});

describe('getRatingLadder', () => {
	it('orders by rating, best first', () => {
		const ladder = getRatingLadder([user('a', rating(1000)), user('b', rating(1200)), user('c', rating(900))]);

		expect(ladder.map(row => row.uid)).toEqual(['b', 'a', 'c']);
		expect(ladder.map(row => row.position)).toEqual([0, 1, 2]);
	});

	// Seeding them at the base would bury genuinely average players beneath a
	// wall of people who have never kicked a ball.
	it('leaves out anyone who has never been rated', () => {
		expect(getRatingLadder([user('a', rating(1000)), user('b')]).map(row => row.uid)).toEqual(['a']);
	});

	// An admin's estimate is a real rating — the balancer picks teams with it —
	// but it is not a place on the ladder, and showing it as one would rank
	// somebody who has never turned up above people who earned their rung.
	it('leaves out a starting rating nobody has played off yet', () => {
		expect(getRatingLadder([user('a', rating(1000)), user('b', rating(1200, 0))]).map(row => row.uid)).toEqual([
			'a',
		]);
	});

	it('shares a position between equal ratings', () => {
		expect(getRatingLadder([user('a', rating(1000)), user('b', rating(1000))]).map(row => row.position)).toEqual([
			0, 0,
		]);
	});

	it('flags a player who has not settled yet', () => {
		const ladder = getRatingLadder([
			user('a', rating(1000, PROVISIONAL_GAMES)),
			user('b', rating(999, PROVISIONAL_GAMES - 1)),
		]);

		expect(ladder.find(row => row.uid === 'a')?.provisional).toBe(false);
		expect(ladder.find(row => row.uid === 'b')?.provisional).toBe(true);
	});

	it('has nothing to show for a group that has never played', () => {
		expect(getRatingLadder([user('a'), user('b')])).toEqual([]);
	});
});

describe('getSeasonTable', () => {
	it('counts appearances and games won', () => {
		const table = getSeasonTable(
			[
				entry('g1', 's1', { a: 0, b: 1 }, { a: 1000, b: 1000 }, { a: 1010, b: 990 }),
				entry('g2', 's1', { a: 1, b: 0 }, { a: 1010, b: 990 }, { a: 1000, b: 1000 }),
				entry('g3', 's1', { a: 0 }, { a: 1000 }, { a: 1020 }),
			],
			's1'
		);

		expect(table.find(row => row.uid === 'a')).toMatchObject({ appearances: 3, wins: 2 });
		expect(table.find(row => row.uid === 'b')).toMatchObject({ appearances: 2, wins: 1 });
	});

	it('ignores other seasons entirely', () => {
		const table = getSeasonTable(
			[
				entry('g1', 's1', { a: 0 }, { a: 1000 }, { a: 1010 }),
				entry('g2', 's2', { a: 0, b: 1 }, { a: 1010, b: 1000 }, { a: 1020, b: 990 }),
			],
			's1'
		);

		expect(table).toHaveLength(1);
		expect(table[0]).toMatchObject({ uid: 'a', appearances: 1 });
	});

	it('sums the rating movement across the season', () => {
		const table = getSeasonTable(
			[
				entry('g1', 's1', { a: 0 }, { a: 1000 }, { a: 1030 }),
				entry('g2', 's1', { a: 1 }, { a: 1030 }, { a: 1010 }),
			],
			's1'
		);

		expect(table[0].movement).toBe(10);
	});

	// The seed is what the game rated them off, so their first appearance moved
	// them exactly as far as it moved everybody they played with.
	it('counts a player who arrived unrated from the seed the game used', () => {
		const table = getSeasonTable([entry('g1', 's1', { a: 0 }, { a: null }, { a: 1030 }, 1010)], 's1');

		expect(table[0]).toMatchObject({ appearances: 1, wins: 1, movement: 20 });
	});

	// Which is the whole point of storing it: without the seed the newcomer sat
	// on nothing while their teammates showed the same evening as a movement.
	it('moves an unrated arrival by the same amount as the teammates beside them', () => {
		const table = getSeasonTable(
			[entry('g1', 's1', { a: 0, b: 0 }, { a: null, b: 1010 }, { a: 1030, b: 1030 }, 1010)],
			's1'
		);

		expect(table.map(row => row.movement)).toEqual([20, 20]);
	});

	// Nothing to measure the distance from, so the first appearance counts
	// nothing rather than inventing a gain from a seed nobody wrote down.
	it('contributes nothing for an unrated arrival on an entry written before the seed was stored', () => {
		const table = getSeasonTable([entry('g1', 's1', { a: 0 }, { a: null }, { a: 1030 })], 's1');

		expect(table[0]).toMatchObject({ appearances: 1, wins: 1, movement: 0 });
	});

	// The seed only ever answers for somebody who arrived without a rating —
	// a rated player's own `before` is the only thing that can speak for them.
	it('ignores the seed for a player who carried a rating in', () => {
		const table = getSeasonTable([entry('g1', 's1', { a: 0 }, { a: 1000 }, { a: 1030 }, 900)], 's1');

		expect(table[0].movement).toBe(30);
	});

	it('shares a win with everyone on a joint-first team', () => {
		const table = getSeasonTable(
			[entry('g1', 's1', { a: 0, b: 0, c: 2 }, { a: 1000, b: 1000, c: 1000 }, { a: 1000, b: 1000, c: 980 })],
			's1'
		);

		expect(
			table
				.filter(row => row.wins === 1)
				.map(row => row.uid)
				.sort()
		).toEqual(['a', 'b']);
	});

	it('orders on wins, then on rating movement', () => {
		const table = getSeasonTable(
			[
				entry('g1', 's1', { a: 0, b: 1, c: 1 }, { a: 1000, b: 1000, c: 1000 }, { a: 1030, b: 990, c: 980 }),
				entry('g2', 's1', { a: 1, b: 0, c: 1 }, { a: 1030, b: 990, c: 980 }, { a: 1020, b: 1020, c: 970 }),
			],
			's1'
		);

		// a and b have a win each; a gained more. c has none.
		expect(table.map(row => row.uid)).toEqual(['a', 'b', 'c']);
		expect(table.map(row => row.position)).toEqual([0, 0, 2]);
	});

	it('does not share a position between two players level on wins but apart on movement', () => {
		const table = getSeasonTable(
			[entry('g1', 's1', { a: 0, b: 0, c: 1 }, { a: 1000, b: 1000, c: 1000 }, { a: 1040, b: 1005, c: 990 })],
			's1'
		);

		// a and b both won once, but a gained far more — a real order, not a tie.
		expect(table.map(row => row.uid)).toEqual(['a', 'b', 'c']);
		expect(table.map(row => row.position)).toEqual([0, 1, 2]);
	});

	it('survives a ledger entry written before positions existed', () => {
		const legacy = { ...entry('g1', 's1', {}, { a: 1000 }, { a: 1010 }) };
		delete (legacy as Partial<RatingLedgerEntry>).positions;

		expect(getSeasonTable([legacy], 's1')).toEqual([]);
	});

	it('has nothing to show for a season nobody has played', () => {
		expect(getSeasonTable([], 's1')).toEqual([]);
	});
});

describe('the form guide', () => {
	/** A one-team game on a given day — enough to say won or lost, and when. */
	const result = (gameId: string, day: number, position: number): RatingLedgerEntry => ({
		...entry(gameId, 's1', { a: position }, { a: 1000 }, { a: 1000 }),
		kickoff: `2026-09-${String(day).padStart(2, '0')}T17:00:00.000Z`,
		kickoffMillis: Date.parse(`2026-09-${String(day).padStart(2, '0')}T17:00:00.000Z`),
	});

	const formOf = (entries: RatingLedgerEntry[]) => getSeasonTable(entries, 's1')[0].form;

	it('reads oldest first, the way a form guide reads', () => {
		const form = formOf([result('g1', 1, 0), result('g2', 8, 1), result('g3', 15, 0)]);

		expect(form.map(game => game.gameId)).toEqual(['g1', 'g2', 'g3']);
		expect(form.map(game => game.won)).toEqual([true, false, true]);
	});

	// The query behind this doesn't order anything, so whatever Firestore
	// happened to return would otherwise be the run somebody reads as a streak.
	it('puts the games in kickoff order rather than the order they arrived in', () => {
		const form = formOf([result('g3', 15, 0), result('g1', 1, 1), result('g2', 8, 0)]);

		expect(form.map(game => game.gameId)).toEqual(['g1', 'g2', 'g3']);
	});

	// Two pitches at seven, which a season with a split slot really does have.
	// Something has to break the tie or the same season draws two different runs
	// on two phones.
	it('falls back to the game id for two games kicking off at once', () => {
		const form = formOf([result('g2', 1, 1), result('g1', 1, 0)]);

		expect(form.map(game => game.gameId)).toEqual(['g1', 'g2']);
	});

	it('keeps only the last few, and keeps the newest of them', () => {
		const form = formOf(Array.from({ length: 9 }, (_, index) => result(`g${index}`, index + 1, 0)));

		expect(form).toHaveLength(FORM_LENGTH);
		expect(form.map(game => game.gameId)).toEqual(['g4', 'g5', 'g6', 'g7', 'g8']);
	});

	it('has room for a season shorter than the guide', () => {
		expect(formOf([result('g1', 1, 0), result('g2', 8, 1)])).toHaveLength(2);
	});

	// Whatever the dot claims has to be what the win column beside it claims,
	// or the row argues with itself.
	it('counts a shared first as a win, exactly as the wins column does', () => {
		const table = getSeasonTable(
			[entry('g1', 's1', { a: 0, b: 0 }, { a: 1000, b: 1000 }, { a: 1000, b: 1000 })],
			's1'
		);

		expect(table.map(row => row.form.map(game => game.won))).toEqual([[true], [true]]);
	});

	// A place only means something against the number of teams that played,
	// which the ledger cannot say — so the place is carried through untouched
	// and it is the screen's business what to do with it.
	it('carries the finishing place through as it was recorded', () => {
		expect(formOf([result('g1', 1, 2)])[0]).toMatchObject({ position: 2, won: false });
	});

	it('counts nothing from another season', () => {
		const form = formOf([result('g1', 1, 0), { ...result('g2', 8, 0), seasonId: 's2' }, result('g3', 15, 1)]);

		expect(form.map(game => game.gameId)).toEqual(['g1', 'g3']);
	});
});

describe('toDisplayMovement', () => {
	it('reads on the same scale as the rating beside it', () => {
		expect(toDisplayMovement(30)).toBe(6);
		expect(toDisplayMovement(-30)).toBe(-6);
	});

	it('is nothing when a season moved nothing', () => {
		expect(toDisplayMovement(0)).toBe(0);
		expect(toDisplayMovement(BASE_ELO - BASE_ELO)).toBe(0);
	});
});
