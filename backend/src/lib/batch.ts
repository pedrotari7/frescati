import type { Firestore, WriteBatch } from 'firebase-admin/firestore';

/**
 * Doing a lot of Firestore work in bounded pieces.
 *
 * Every limit in here is the platform's rather than a tuning choice, which is
 * why they live together: a batch caps at 500 writes, `getAll` at 30 refs, an
 * `in` filter at 30 values. Each of those was independently rediscovered at the
 * call site that first hit it, and `chunksOf` was pasted twice to satisfy two of
 * them.
 */

/** Firestore caps a batch at 500 writes; leave room for the odd extra. */
export const BATCH_LIMIT = 400;

/**
 * Split a list into pieces of at most `size`.
 *
 * Used for two different reasons and it is worth keeping them apart: against a
 * hard platform limit (`getAll` takes 30 refs, an `in` filter 30 values) it is
 * required, and against concurrency it is a choice — enough parallelism to be
 * quick, not enough to open a transaction per game at once.
 */
export const chunksOf = <T>(items: T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

/**
 * Run a pile of writes as however many batches it takes.
 *
 * Takes the `Firestore` handle rather than importing one, so the seed writer can
 * use it too: `lib/firebase` builds its handle at module load, and a script has
 * to call `initializeApp` itself before there is an app to bind to.
 *
 * Not atomic across batches, and nothing here pretends otherwise — a failure
 * partway leaves the earlier batches committed. Every caller is either
 * idempotent or replayed from a ledger, which is what makes that acceptable.
 */
export const commitInBatches = async (db: Firestore, writes: ((batch: WriteBatch) => void)[]): Promise<void> => {
	for (const chunk of chunksOf(writes, BATCH_LIMIT)) {
		const batch = db.batch();
		for (const write of chunk) write(batch);
		await batch.commit();
	}
};
