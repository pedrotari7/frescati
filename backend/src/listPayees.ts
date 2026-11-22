import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { PayeeOption } from '../../shared/types';
import { byDisplayName } from '../../shared/format';
import { db, ENFORCE_APP_CHECK, REGION } from './lib/firebase';
import { hasAppAdminClaim, requireAuth } from './lib/auth';
import { getAppAdminUids, getProfiles } from './lib/data';
import { isAdminSomewhere } from './payees';
import { instrument } from './lib/sentry';

/**
 * The admins a season could name as its payee, for the picker in season
 * settings.
 *
 * A callable because the picker needs to know who has saved a number, and that
 * lives in `users/{uid}/private/payment`, which only its owner and app admins
 * can read. A season admin cannot, and must not be able to: they pick a payee
 * by name and never see the digits.
 *
 * So this reads the private documents with the Admin SDK and returns a boolean
 * for each. Nothing that reaches the browser holds a number.
 *
 * "Admin" means the same thing `isAdminSomewhere` means when the sync decides
 * whether to publish a number: an app admin, or a place in some season's
 * `adminUids`. The picker offers exactly the people the sync will serve.
 */
export const listPayees = onCall<void>(
	{ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
	instrument('listPayees', async request => {
		const caller = requireAuth(request);

		if (!hasAppAdminClaim(request) && !(await isAdminSomewhere(caller))) {
			throw new HttpsError('permission-denied', 'Only admins can pick who a season is paid to.');
		}

		const [appAdmins, seasons] = await Promise.all([
			getAppAdminUids(),
			db.collection('seasons').select('adminUids').get(),
		]);

		const uids = [
			...new Set([...appAdmins, ...seasons.docs.flatMap(doc => (doc.get('adminUids') as string[]) ?? [])]),
		];

		const [profiles, payments] = await Promise.all([
			getProfiles(uids),
			uids.length ? db.getAll(...uids.map(uid => db.doc(`users/${uid}/private/payment`))) : [],
		]);

		const saved = new Set(
			payments
				.filter(doc => typeof doc.get('swish') === 'string' && doc.get('swish') !== '')
				.map(doc => doc.ref.parent.parent?.id)
		);

		// An account with no profile has no name to pick it by, and a blank row
		// in the picker is worse than a missing one.
		const payees: PayeeOption[] = uids
			.flatMap(uid => {
				const profile = profiles.get(uid);

				return profile ? [{ uid, displayName: profile.displayName, hasNumber: saved.has(uid) }] : [];
			})
			.sort(byDisplayName);

		return { payees };
	})
);
