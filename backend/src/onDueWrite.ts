import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Debtor, Due } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { getSeason } from './lib/data';
import { instrument } from './lib/sentry';

/** What recomputing one player's mark did, or would do under `dryRun`. */
export type DebtorMarkChange = 'created' | 'updated' | 'cleared' | 'unchanged';

export interface DebtorMarkResult {
	change: DebtorMarkChange;
	outstanding: number;
	charges: number;
}

/**
 * Writes down what one player still owes this season, or clears the mark.
 *
 * Recomputed from the whole collection rather than adjusted by the amount that
 * just moved, for the reason `onResponseWrite` recounts instead of incrementing:
 * a delta applied twice is silently wrong from then on, and retries happen.
 * Running this over a state that is already right rewrites the same numbers.
 *
 * Nothing is left behind at zero. A settled-up player has no document, which is
 * what lets the rule be an `exists()` rather than a read of a field it would
 * then have to trust.
 *
 * Exported and given a `dryRun` option so `backfillDebtors.ts` can run the same
 * logic the trigger runs rather than a second copy of it: a charge written
 * before this trigger's first deploy has nothing to redeliver the event, and a
 * script is the only way back to a mark for it.
 */
export const markWhatIsOwed = async (
	seasonId: string,
	uid: string,
	{ dryRun = false }: { dryRun?: boolean } = {}
): Promise<DebtorMarkResult> => {
	const snapshot = await db.collection(`seasons/${seasonId}/dues`).where('uid', '==', uid).get();
	const owing = snapshot.docs.map(doc => doc.data() as Due).filter(due => due.status === 'owing');
	const outstanding = owing.reduce((total, due) => total + due.amount, 0);

	const marker = db.doc(`seasons/${seasonId}/debtors/${uid}`);
	const existing = await marker.get();
	const before = existing.exists ? (existing.data() as Debtor) : null;

	if (outstanding <= 0) {
		if (!before) return { change: 'unchanged', outstanding, charges: 0 };

		if (!dryRun) {
			await marker.delete();
			logger.debug('Settled up, cleared the mark', { seasonId, uid });
		}

		return { change: 'cleared', outstanding, charges: 0 };
	}

	// A redelivery of the same event has to leave the document alone rather than
	// stamp a new `updatedAt` on the same numbers. Two things turn on that.
	// `updatedAt` means the moment the debt last moved, which is only true if
	// nothing else writes it, and a retry that writes costs a version and a
	// snapshot for a document whose content did not change. Recounting is what
	// makes this converge; not writing is what makes converging free.
	if (before && before.outstanding === outstanding && before.charges === owing.length) {
		return { change: 'unchanged', outstanding, charges: owing.length };
	}

	if (!dryRun) {
		const debtor: Debtor = {
			uid,
			outstanding,
			charges: owing.length,
			updatedAt: new Date().toISOString(),
			// Carried forward by hand, because this is a whole-document `set` and
			// `remindDebtors` writes that field on the same document. Losing it would
			// tell the books nobody had ever been chased every time a charge moved,
			// which is the moment an admin is most likely to be looking. Explicit
			// rather than `{ merge: true }`, because merging would also preserve
			// anything an older shape of this document had left lying around, and the
			// whole point of the overwrite is that the numbers here are recomputed
			// rather than adjusted. It goes when the mark does, one branch up.
			...(before?.remindedAt ? { remindedAt: before.remindedAt } : {}),
		};

		await marker.set(debtor);
		logger.debug('Marked what a player owes', { seasonId, uid, outstanding, charges: owing.length });
	}

	return { change: before ? 'updated' : 'created', outstanding, charges: owing.length };
};

/**
 * Keeps `debtors/{uid}` in step with the charges underneath it.
 *
 * A season stops somebody who owes it money from signing up for another game,
 * and that decision is made by a security rule. A rule can only look documents
 * up by a path it already knows, so it cannot ask "does this person owe this
 * season anything": an extra's charges are one document per game they played,
 * which makes the question a query. This is the answer written down where a rule
 * can reach it, one document per person who owes, and its existence is the whole
 * test.
 *
 * Per person rather than a `debtorUids` array on the season, because the season
 * document is readable by everybody signed in and the books deliberately are
 * not. An array would publish the list of who has not paid to the whole app,
 * which is the one thing `docs/finances.md` argues the books must not do.
 */
export const onDueWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/dues/{dueId}', region: REGION },
	instrument('onDueWrite', async event => {
		const { seasonId, dueId } = event.params;
		const before = event.data?.before.data() as Due | undefined;
		const after = event.data?.after.data() as Due | undefined;

		// Deleting a season fires `recursiveDelete`, which comes through here once
		// per charge it takes with it. Recomputing then races the cascade to write
		// a mark under a season that is already gone, and nothing would ever come
		// back for it. The same sweep takes the marks themselves, so there is
		// nothing to tidy up here either.
		if (!after && !(await getSeason(seasonId))) {
			logger.debug('Charge removed with the season it belonged to', { seasonId, dueId });

			return;
		}

		// Both, because a charge that changed hands has left one person owing less
		// and another owing more, and each is a separate mark. The rules do not
		// allow that today; recomputing whoever the write names is one line and
		// does not depend on them carrying on not allowing it.
		const uids = [...new Set([after?.uid, before?.uid].filter((uid): uid is string => Boolean(uid)))];

		if (uids.length === 0) {
			logger.warn('A charge was written with nobody to charge', { seasonId, dueId });

			return;
		}

		for (const uid of uids) {
			await markWhatIsOwed(seasonId, uid);
		}
	})
);
