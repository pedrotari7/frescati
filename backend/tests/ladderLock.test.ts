import { drainAbandonedReplays, finaliseGame, requestRatingReplay } from '../src/lib/finalise';
import {
	clearAuth,
	clearFirestore,
	getDb,
	readGame,
	readUser,
	writeGame,
	writeMatch,
	writeSeason,
	writeTeams,
} from './helpers';

/**
 * The lock that stops two things rating games at once.
 *
 * Worth testing at this level rather than through the triggers: the failure it
 * prevents is an interleaving, which no assertion on a finished trigger can
 * see. What can be checked is the mechanism — who gets in, who is turned away,
 * what a caller that is turned away leaves behind, and that nothing it leaves
 * behind is forgotten.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const ADMIN = 'season-admin-1';

const TEAM_A = ['p1', 'p2', 'p3', 'p4'];
const TEAM_B = ['p5', 'p6', 'p7', 'p8'];

const KICKOFF = '2026-09-01T17:00:00.000Z';
const KICKOFF_MILLIS = Date.parse(KICKOFF);

/**
 * What the ladder pays for the one match a two-team rotation actually plays —
 * the 2-1 at order 0, and the 0-5 a correction below replaces it with.
 *
 * Two numbers rather than a sign flip because a rating reads the scoreline as
 * well as the result: `0.8 x (rate - 0.5) + 0.2 x place`, at the provisional K
 * of 40, off a rate of 0.8 for winning 2-1 and 1/14 for losing 0-5.
 */
const WON_2_1 = 13.6;
const LOST_0_5 = -17.714286;

/** A rating, to the sixth decimal — that arithmetic is not exact in binary. */
const elo = (movement: number) => expect.closeTo(1000 + movement, 5);

const lockDoc = () => getDb().doc('meta/ladder');

const readLock = async () => (await lockDoc().get()).data() ?? {};

/** Pose as a holder that is still working. */
const holdLock = async (): Promise<void> => {
	await lockDoc().set({ heldUntil: Date.now() + 60_000 }, { merge: true });
};

/** Pose as a holder that died: lease expired, whatever it was asked to do left behind. */
const abandonLock = async (pendingFrom: number): Promise<void> => {
	await lockDoc().set({ heldUntil: Date.now() - 1_000, pendingFrom });
};

const playGame = async (gameId: string, kickoff: string) => {
	await writeGame(SEASON_ID, gameId, { kickoff });
	await writeTeams(SEASON_ID, gameId, [TEAM_A, TEAM_B]);

	for (const [order, [scoreA, scoreB]] of (
		[
			[2, 1],
			[3, 1],
			[1, 1],
		] as [number, number][]
	).entries()) {
		await writeMatch(SEASON_ID, gameId, { order, teamA: 0, teamB: 1, scoreA, scoreB });
	}
};

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	await writeSeason(SEASON_ID, { memberUids: [...TEAM_A, ...TEAM_B], adminUids: [ADMIN] });
});

describe('requestRatingReplay', () => {
	it('defers to a run already in flight rather than starting a second', async () => {
		await playGame(GAME_ID, KICKOFF);
		await finaliseGame(SEASON_ID, GAME_ID, ADMIN);
		await holdLock();

		expect(await requestRatingReplay(KICKOFF_MILLIS)).toBe(0);
	});

	// The holder drains whatever accumulated before it lets go, so a caller that
	// was turned away has still been heard.
	it('leaves its floor behind when it defers', async () => {
		await holdLock();

		await requestRatingReplay(KICKOFF_MILLIS);

		expect((await readLock()).pendingFrom).toBe(KICKOFF_MILLIS);
	});

	// A minimum, not a supersede. Two corrections to different games collapse
	// into one replay from the earlier of them, which covers both; keeping the
	// latest would silently skip the earlier game.
	it('lowers the floor to the earliest kickoff anyone asked for', async () => {
		await holdLock();

		await requestRatingReplay(KICKOFF_MILLIS);
		await requestRatingReplay(KICKOFF_MILLIS + 7 * 24 * 3_600_000);
		await requestRatingReplay(KICKOFF_MILLIS - 7 * 24 * 3_600_000);

		expect((await readLock()).pendingFrom).toBe(KICKOFF_MILLIS - 7 * 24 * 3_600_000);
	});

	it('takes a lease whose holder has gone and does the work', async () => {
		await playGame(GAME_ID, KICKOFF);
		await finaliseGame(SEASON_ID, GAME_ID, ADMIN);

		await lockDoc().set({ heldUntil: Date.now() - 1_000 }, { merge: true });

		expect(await requestRatingReplay(KICKOFF_MILLIS)).toBe(1);
	});

	it('releases the lease and clears the floor once it has drained', async () => {
		await playGame(GAME_ID, KICKOFF);
		await finaliseGame(SEASON_ID, GAME_ID, ADMIN);

		await requestRatingReplay(KICKOFF_MILLIS);

		const lock = await readLock();
		expect(lock.pendingFrom).toBeUndefined();
		expect(lock.heldUntil).toBeLessThanOrEqual(Date.now());
	});
});

describe('drainAbandonedReplays', () => {
	// The lease frees itself after a crash, but nothing re-reads what the dead
	// holder was asked to do — so without this a correction could sit recorded
	// and never applied until somebody happened to make another one.
	it('picks up a floor left behind by a holder that died', async () => {
		await playGame(GAME_ID, KICKOFF);
		await finaliseGame(SEASON_ID, GAME_ID, ADMIN);

		// The game's result is corrected, but the replay never ran.
		await writeMatch(SEASON_ID, GAME_ID, { order: 0, teamA: 0, teamB: 1, scoreA: 0, scoreB: 5 });
		await abandonLock(KICKOFF_MILLIS);

		expect(await drainAbandonedReplays()).toBe(1);

		// Team B now takes the game, and the ladder says so.
		expect((await readUser('p1'))?.rating).toMatchObject({ elo: elo(LOST_0_5) });
		expect((await readLock()).pendingFrom).toBeUndefined();
	});

	it('does nothing when there is no floor outstanding', async () => {
		expect(await drainAbandonedReplays()).toBe(0);
	});

	it('leaves a floor alone while somebody is still holding the lease', async () => {
		await lockDoc().set({ heldUntil: Date.now() + 60_000, pendingFrom: KICKOFF_MILLIS });

		expect(await drainAbandonedReplays()).toBe(0);
		expect((await readLock()).pendingFrom).toBe(KICKOFF_MILLIS);
	});
});

describe('finaliseGame under the lock', () => {
	it('reports itself busy rather than rating a game underneath a replay', async () => {
		await playGame(GAME_ID, KICKOFF);
		await holdLock();

		expect(await finaliseGame(SEASON_ID, GAME_ID, ADMIN)).toBe('busy');

		// Nothing was applied on the way out.
		expect((await readGame(SEASON_ID, GAME_ID))?.resultFinalisedAt).toBeUndefined();
		expect((await readUser('p1'))?.rating).toBeUndefined();
	});

	it('releases the lease afterwards, so the next one gets in', async () => {
		await playGame(GAME_ID, KICKOFF);

		expect(await finaliseGame(SEASON_ID, GAME_ID, ADMIN)).toBe('finalised');
		expect((await readLock()).heldUntil).toBeLessThanOrEqual(Date.now());

		await playGame('game-2', '2026-09-08T17:00:00.000Z');
		expect(await finaliseGame(SEASON_ID, 'game-2', ADMIN)).toBe('finalised');
	});

	it('releases the lease even when there was nothing to rate', async () => {
		await writeGame(SEASON_ID, GAME_ID);

		expect(await finaliseGame(SEASON_ID, GAME_ID, ADMIN)).toBe('nothing-to-rate');
		expect((await readLock()).heldUntil).toBeLessThanOrEqual(Date.now());
	});

	// The read of `resultFinalisedAt` and the write that sets it are now one
	// critical section. Before, two admins tapping Confirm together both found
	// the game unconfirmed and both applied it.
	//
	// Asserted as the property rather than as two particular messages: the
	// loser gets `already-finalised` if it outwaited the winner and `busy` if
	// it didn't, which is a matter of how fast the emulator happens to be.
	// Both are the same answer to the only question that matters, and pinning
	// one of them made this fail on a slow run.
	it('lets only one of two simultaneous confirmations through', async () => {
		await playGame(GAME_ID, KICKOFF);

		const outcomes = await Promise.all([
			finaliseGame(SEASON_ID, GAME_ID, ADMIN),
			finaliseGame(SEASON_ID, GAME_ID, 'season-admin-2'),
		]);

		expect(outcomes.filter(outcome => outcome === 'finalised')).toHaveLength(1);
		expect(outcomes).toContainEqual(expect.stringMatching(/^(already-finalised|busy)$/));

		// One game's worth of movement, not two — which is what a second
		// application would have produced, rating the same result against the
		// ratings the first one had just written.
		expect((await readUser('p1'))?.rating).toMatchObject({ elo: elo(WON_2_1), games: 1 });
	});
});
