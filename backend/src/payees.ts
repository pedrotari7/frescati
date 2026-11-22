import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import type { Payee, Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { instrument, reportError } from './lib/sentry';

const POTS = ['entry', 'extras'] as const;

/**
 * Whether this account is an admin of anything: the app-admin badge, or a place
 * in some season's `adminUids`. The same people `listPayees` offers.
 *
 * Reads the `isAppAdmin` mirror rather than the claim, for the reason
 * `getAppAdminUids` gives. The check is what keeps a season admin from naming
 * any account and pulling its private number into a document everybody reads.
 */
const isAdminSomewhere = async (uid: string): Promise<boolean> => {
	const profile = await db.doc(`users/${uid}`).get();
	if (profile.get('isAppAdmin') === true) return true;

	const seasons = await db.collection('seasons').where('adminUids', 'array-contains', uid).limit(1).get();

	return !seasons.empty;
};

/** The number to publish for this account, or `undefined` when there is none or it must stay private. */
const publishableSwish = async (uid: string): Promise<string | undefined> => {
	const payment = await db.doc(`users/${uid}/private/payment`).get();
	const swish = payment.get('swish');
	if (typeof swish !== 'string' || swish === '') return undefined;

	return (await isAdminSomewhere(uid)) ? swish : undefined;
};

/**
 * Brings each pot that names an account up to date with that account's saved
 * number: copies it in, or removes a copy that should no longer be there. A pot
 * already in step is not written, so the write this makes, which retriggers
 * `onSeasonWrite`, finds nothing to do. Custom pots, with no `uid`, are never
 * touched.
 *
 * `season` is only a hint that something may need doing. The decision is made
 * again against the document as it is inside a transaction, so an admin who
 * switches a pot to a custom number while this runs is not overwritten.
 */
export const syncSeasonPayees = async (seasonId: string, season: Season): Promise<void> => {
	if (!POTS.some(pot => season.fees?.payees?.[pot]?.uid)) return;

	const ref = db.doc(`seasons/${seasonId}`);

	const pots = await db.runTransaction(async transaction => {
		const snapshot = await transaction.get(ref);
		if (!snapshot.exists) throw new Error(`Season ${seasonId} no longer exists`);

		const current = snapshot.data() as Season;
		const updates: Record<string, string | FieldValue> = {};

		for (const pot of POTS) {
			const payee: Payee | undefined = current.fees?.payees?.[pot];
			if (!payee?.uid) continue;

			const wanted = await publishableSwish(payee.uid);
			if (wanted === payee.swish) continue;

			updates[`fees.payees.${pot}.swish`] = wanted ?? FieldValue.delete();
		}

		if (Object.keys(updates).length > 0) transaction.update(ref, updates);

		return Object.keys(updates).length;
	});

	if (pots > 0) logger.info('Updated the Swish number a season shows', { seasonId, pots });
};

/** An admin saved, changed or cleared their Swish number: every season naming them follows. */
export const onPaymentWrite = onDocumentWritten(
	{ document: 'users/{uid}/private/payment', region: REGION },
	instrument('onPaymentWrite', async event => {
		const { uid } = event.params;

		const [entry, extras] = await Promise.all(
			POTS.map(pot => db.collection('seasons').where(`fees.payees.${pot}.uid`, '==', uid).get())
		);

		const seasons = new Map([...entry.docs, ...extras.docs].map(doc => [doc.id, doc.data() as Season]));

		for (const [seasonId, season] of seasons) {
			try {
				await syncSeasonPayees(seasonId, season);
			} catch (error) {
				// One wedged season must not strand the rest.
				reportError('Could not update the Swish number on a season', { seasonId, uid }, error);
			}
		}
	})
);
