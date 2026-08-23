import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { db } from './firebase';

/**
 * One lock over the global ladder.
 *
 * Everything that rates a game reads every affected player's current rating
 * and writes it straight back: `finaliseGame` for one game, `replayRatingsFrom`
 * for a window of them. Two of those at once is not a lost update that the next
 * run repairs. A replay rewinds everybody to before the window and then rebuilds
 * forward, so a second rewind landing inside the first run's forward pass makes
 * it rate a game against ratings that were never real. The answer goes into the
 * profiles *and* into the ledger entries that exist to be able to undo them, and
 * nothing afterwards recomputes it. That is what makes this worth a lock rather
 * than a retry.
 *
 * Deliberately one lock for the whole ladder rather than one per season: ratings
 * are global, a replay walks every rated game regardless of season, and two
 * seasons' replays overlap on exactly the players who turn out for both.
 *
 * A lease rather than a plain held/free flag, because a holder that crashes or
 * is killed at its timeout would otherwise wedge the ladder for good.
 */

const lockRef = () => db.doc('meta/ladder');

/**
 * How long a holder may hold the lease before it is presumed gone.
 *
 * Has to outlive any possible holder, or a slow run and its replacement end up
 * in exactly the overlap this exists to prevent. Every function that takes the
 * lock declares `timeoutSeconds` below this, which is the invariant that makes
 * renewal unnecessary.
 */
const LEASE_MS = 6 * 60_000;

/** Between attempts, for a caller that waits rather than defers. */
const RETRY_MS = 400;

/**
 * How long such a caller waits before giving up and saying so.
 *
 * Bounded by patience, not by correctness: the only caller that waits is a
 * confirmation somebody is watching a button for, and being told to try again
 * beats a spinner that outlasts their interest. A replay of a season's ledger
 * runs in a second or two, so this is already generous.
 *
 * Shorter against an emulator, the same way the team rebuild's debounce is,
 * `FIRESTORE_EMULATOR_HOST` rather than `FUNCTIONS_EMULATOR`, because the lock
 * lives in Firestore and the backend tests drive these functions directly
 * without a Functions emulator to set that.
 */
const isEmulated = (): boolean => Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const maxWaitMs = (): number => (isEmulated() ? 5_000 : 10_000);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Take the lease if it is free, and, for a caller that wants a replay,
 * record how far back it needs one, whether or not it got the lease.
 *
 * The floor is a **minimum**, not the latest request. Two corrections to
 * different games collapse into a single replay from the earlier of them,
 * which covers both. Keeping the latest would be the natural "this supersedes
 * that" move and would silently skip the earlier game. The opposite of what
 * `teamsGeneration` does for team rebuilds, where a later request genuinely
 * does supersede an earlier one.
 */
const tryAcquire = async (replayFrom?: number): Promise<boolean> =>
	db.runTransaction(async transaction => {
		const snapshot = await transaction.get(lockRef());
		const free = ((snapshot.get('heldUntil') as number | undefined) ?? 0) <= Date.now();

		const pendingFrom =
			replayFrom === undefined
				? undefined
				: Math.min((snapshot.get('pendingFrom') as number | undefined) ?? Infinity, replayFrom);

		transaction.set(
			lockRef(),
			{
				...(free ? { heldUntil: Date.now() + LEASE_MS } : {}),
				...(pendingFrom === undefined ? {} : { pendingFrom }),
			},
			{ merge: true }
		);

		return free;
	});

const release = async (): Promise<void> => {
	await lockRef().set({ heldUntil: 0 }, { merge: true });
};

/** How far back the work still outstanding needs replaying from, if any. */
export const readPendingFrom = async (): Promise<number | null> => {
	const pendingFrom = (await lockRef().get()).get('pendingFrom') as number | undefined;

	return typeof pendingFrom === 'number' ? pendingFrom : null;
};

/**
 * Clear the floor, but only if nothing lowered it while the work ran.
 *
 * A request arriving mid-replay may need an earlier kickoff than the one just
 * covered; clearing blindly would drop it. One arriving with a *later* kickoff
 * leaves the floor alone. The minimum already covers it.
 */
export const clearPendingIfUnmoved = async (covered: number): Promise<void> => {
	await db.runTransaction(async transaction => {
		const snapshot = await transaction.get(lockRef());

		if ((snapshot.get('pendingFrom') as number | undefined) !== covered) return;

		transaction.update(lockRef(), { pendingFrom: FieldValue.delete() });
	});
};

/**
 * Run `task` with the ladder to itself, waiting for the lease rather than
 * deferring, for work somebody is waiting on an answer for, which a replay is
 * not.
 *
 * Returns `null` if the lease never came free, rather than throwing, because
 * the two callers want different things from that: an admin tapping Confirm
 * deserves to be told, the hourly sweep should just try again next hour.
 */
export const withLadderLock = async <T>(task: () => Promise<T>): Promise<T | null> => {
	const deadline = Date.now() + maxWaitMs();

	while (!(await tryAcquire())) {
		if (Date.now() >= deadline) {
			logger.warn('Gave up waiting for the ladder lock');

			return null;
		}

		await sleep(RETRY_MS);
	}

	try {
		return await task();
	} finally {
		await release();
	}
};

/**
 * Run `drain` with the ladder to itself, or leave if somebody already holds it.
 *
 * `replayFrom` is recorded either way, so a caller that leaves has still been
 * heard: the holder drains whatever has accumulated before letting go. That is
 * what collapses a burst. An admin fixing three scorelines fires three of
 * these, the first does the work and the other two lower a floor it is already
 * covering and return.
 *
 * Omit `replayFrom` to pick up a floor left behind by a holder that died before
 * draining it.
 */
export const withDrainedLadderLock = async (
	replayFrom: number | undefined,
	drain: () => Promise<number>
): Promise<number> => {
	if (!(await tryAcquire(replayFrom))) {
		logger.debug('Deferred to the ladder run already in flight', { replayFrom });

		return 0;
	}

	try {
		return await drain();
	} finally {
		await release();
	}
};
