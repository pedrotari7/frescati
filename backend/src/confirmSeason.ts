import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { Due, KitItem, Season, Signup } from '../../shared/types';
import { feesFor } from '../../shared/finances';
import { planConfirmation } from '../../shared/signup';
import { db, ENFORCE_APP_CHECK, REGION } from './lib/firebase';
import { hasAppAdminClaim, isSeasonAdmin, requireAuth } from './lib/auth';
import { getProfiles } from './lib/data';
import { isBlockedBy } from './lib/dues';
import { requireId } from './lib/ids';
import { sendSeasonConfirmed } from './lib/push';
import { instrument, reportError } from './lib/sentry';

/**
 * Turn a season's yes answers into its squad.
 *
 * A callable because the work is privileged and has to land whole: the rules
 * refuse every client write that takes a season out of draft, and a confirm
 * that half happened, members saved but the status still `draft`, or charges
 * raised for a squad that did not get written, is the failure this exists to
 * rule out. Everything is one transaction.
 *
 * The answers are read inside it with `tx.get`, so a player changing their mind
 * while this runs either lands in the squad or makes the transaction retry
 * against the new answer. Nobody is charged for a yes that is no longer there.
 * The same transaction is what lets exactly one of two presses through. The
 * loser retries, finds the season `active` and is told so.
 *
 * What is decided, who is in, who keeps the admin role, what each owes and
 * where the kit goes, is `planConfirmation`'s, and is unit tested in `shared/`.
 *
 * An entry charge that is already there is left as it is.
 *
 * **No `dueRaised` goes out for the entry charges.** `seasonConfirmed` is the
 * bill and the welcome in one message, so nobody gets two. `onDueWrite` still marks each member a
 * debtor, which is what holds their first In until they have paid.
 *
 * The messages go after the commit and are reported and swallowed one by one,
 * for the reason `tellThem` swallows them: the squad is saved, and a push that
 * failed is not a reason to take that back.
 */
export const confirmSeason = onCall<{ seasonId?: string }>(
	{ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
	instrument('confirmSeason', async request => {
		const uid = requireAuth(request);
		const seasonId = requireId(request.data?.seasonId, 'A seasonId is required.');
		const appAdmin = hasAppAdminClaim(request);

		const { season, plan } = await db.runTransaction(async tx => {
			const snapshot = await tx.get(db.doc(`seasons/${seasonId}`));
			if (!snapshot.exists) throw new HttpsError('not-found', 'That season does not exist.');

			const current = { ...snapshot.data(), id: snapshot.id } as Season;

			if (!isSeasonAdmin(current, uid, appAdmin)) {
				throw new HttpsError('permission-denied', 'Only a season admin can confirm the season.');
			}
			if (current.status !== 'draft') {
				throw new HttpsError('failed-precondition', 'This season is already confirmed.');
			}

			const [answers, source] = await Promise.all([
				tx.get(db.collection(`seasons/${seasonId}/signups`).where('status', '==', 'yes')),
				current.copiedFrom ? tx.get(db.collection(`seasons/${current.copiedFrom}/kit`)) : undefined,
			]);

			const signups = answers.docs.map(doc => ({ ...doc.data(), uid: doc.id }) as Signup);
			if (!signups.some(signup => signup.uid === uid)) {
				throw new HttpsError('failed-precondition', 'Say that you are in yourself before you confirm.');
			}

			const sourceKit = (source?.docs ?? []).map(doc => ({ ...doc.data(), id: doc.id }) as KitItem);
			const planned = planConfirmation(signups, current, sourceKit, uid);
			const now = new Date().toISOString();

			// Every read comes before the first write. A season admin can raise dues
			// on a draft, so an entry charge may already exist, paid even, and a
			// blind set would put it back to owing.
			const refs = planned.dues.map(due => db.doc(`seasons/${seasonId}/dues/${due.id}`));
			const existing = refs.length > 0 ? await tx.getAll(...refs) : [];
			const taken = new Set(existing.filter(due => due.exists).map(due => due.id));

			tx.update(snapshot.ref, {
				status: 'active',
				memberUids: planned.memberUids,
				adminUids: planned.adminUids,
				confirmedAt: now,
				confirmedBy: uid,
			});

			for (const due of planned.dues.filter(raised => !taken.has(raised.id))) {
				const document: Omit<Due, 'id'> = {
					uid: due.uid,
					kind: due.kind,
					amount: due.amount,
					status: 'owing',
					createdAt: now,
				};

				tx.set(db.doc(`seasons/${seasonId}/dues/${due.id}`), document);
			}

			for (const item of planned.kit) {
				tx.set(db.collection(`seasons/${seasonId}/kit`).doc(), { ...item, updatedAt: now });
			}

			return { season: current, plan: planned };
		});

		logger.info('Confirmed a season', { seasonId, confirmedBy: uid, members: plan.memberUids.length });

		if (!season.quiet) await tellTheSquad(seasonId, season, plan);

		return { members: plan.memberUids.length, share: plan.share, demoted: plan.demotedAdminUids };
	})
);

/**
 * Each new member's own share and whether their own first In is held, so one
 * send each. Blocked is read against the admins who stayed on, since the ones
 * who were dropped are not in the squad to be told anything.
 */
const tellTheSquad = async (
	seasonId: string,
	season: Season,
	{ memberUids, adminUids, share }: ReturnType<typeof planConfirmation>
): Promise<void> => {
	const profiles = await getProfiles(memberUids);
	const confirmed = { ...season, adminUids };
	const { swish } = feesFor(season);

	await Promise.all(
		memberUids.map(uid =>
			sendSeasonConfirmed(uid, {
				seasonId,
				seasonName: season.name,
				share,
				swish,
				blocked: isBlockedBy(confirmed, uid, profiles.get(uid)),
			}).catch(error => reportError('Could not tell a member the season is confirmed', { seasonId, uid }, error))
		)
	);
};
