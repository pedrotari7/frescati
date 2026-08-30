import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { AppUser, Debtor, Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { getProfiles, getSeason } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { sendDuesReminder } from './lib/push';
import { requireSeasonAdmin } from './lib/auth';
import { instrument } from './lib/sentry';

/** What one chase managed to do, for the row it was sent from to report. */
export interface DuesReminderOutcome {
	uid: string;
	/** What they were told they owe, so the screen reports the figure that went out. */
	outstanding: number;
	/** Devices FCM accepted it for. */
	pushed: number;
	/** 1 when they were emailed instead, having no reachable device. */
	emailed: number;
}

export interface DuesReminderResult {
	reminded: DuesReminderOutcome[];
}

/**
 * Whether this debt is also stopping them signing up, which is what decides
 * which of the two bodies they get.
 *
 * The same test `debtStanding` makes on the client, and it has to stay the same
 * one or the notification contradicts the notice on the season home. A season
 * admin is never blocked by their own books, and the global badge outranks the
 * per-season one here as it does everywhere else.
 *
 * `isAppAdmin` is the mirror on the profile rather than the custom claim it
 * mirrors, for the reason `getAppAdminUids` gives. Reading the claim would mean
 * paging Firebase Auth, and this decides a sentence rather than a permission. A
 * stale mirror costs somebody the wrong half of a body, not a way in.
 */
const isBlockedBy = (season: Season, uid: string, profile?: AppUser): boolean =>
	!season.adminUids.includes(uid) && profile?.isAppAdmin !== true;

/**
 * Chase somebody, or everybody, for what they owe a season.
 *
 * A callable because a push is a callable's job, and this is the first send in
 * the app an admin aims by hand rather than a trigger firing on an event. It is
 * therefore also the first one that could be turned into a way to buzz somebody
 * for no reason, and the shape here is built to stop that.
 *
 * - The request says **who, never what**. The amount and the number of charges
 *   come off `seasons/{id}/debtors/{uid}`, which is function-owned and which
 *   `firestore.rules` refuses every client write to, so nobody can push a figure
 *   at a player that the books do not already say.
 * - A uid with **no mark is not sent to**. Marks exist if and only if somebody
 *   owes, so filtering the request against the collection is what makes "only
 *   people who owe money" true by construction rather than by the caller having
 *   checked.
 * - Only a **season admin** can call it, which is who the books belong to.
 *
 * `uids` narrows it to a chosen few; leaving it off chases everybody who owes.
 * Both go through the same filter, so the difference between the two buttons on
 * the finances screen is one array and not a second code path.
 */
export const remindDebtors = onCall<{ seasonId: string; uids?: string[] }>(
	{ region: REGION, secrets: EMAIL_SECRETS },
	instrument('remindDebtors', async request => {
		const { seasonId, uids } = request.data ?? {};

		if (!seasonId) throw new HttpsError('invalid-argument', 'A seasonId is required.');

		const adminUid = await requireSeasonAdmin(request, seasonId, 'Only a season admin can chase a payment.');

		const season = await getSeason(seasonId);

		if (!season) throw new HttpsError('not-found', 'That season no longer exists.');

		const snapshot = await db.collection(`seasons/${seasonId}/debtors`).get();
		const marked = snapshot.docs.map(doc => doc.data() as Debtor);

		// An empty or absent list means everybody who owes. A list that named
		// nobody who does leaves nothing to send, and the caller is told so rather
		// than handed a cheerful empty result. It means the screen and the books
		// disagree, which is worth seeing.
		const asked = uids && uids.length > 0 ? new Set(uids) : null;
		const targets = asked ? marked.filter(debtor => asked.has(debtor.uid)) : marked;

		if (asked && targets.length === 0) {
			throw new HttpsError('failed-precondition', 'Nobody there owes this season anything.');
		}

		const profiles = await getProfiles(targets.map(debtor => debtor.uid));
		const remindedAt = new Date().toISOString();

		// In parallel, because each is an independent read-send-stamp against a
		// different person, and a chase of a full season is otherwise as slow as
		// fifteen FCM round trips end to end. If one throws, the call fails and the
		// admin sees it, having chased some of the list; `remindedAt` is what says
		// which, so the retry is not blind.
		const reminded = await Promise.all(
			targets.map(async (debtor): Promise<DuesReminderOutcome> => {
				const { pushed, emailed } = await sendDuesReminder(debtor.uid, {
					seasonId,
					seasonName: season.name,
					outstanding: debtor.outstanding,
					charges: debtor.charges,
					blocked: isBlockedBy(season, debtor.uid, profiles.get(debtor.uid)),
				});

				// Only once it landed. The books draw this as "chased two days ago"
				// beside a name, which has to mean they heard about it. Stamping a
				// send that reached no device and no address would tell the next
				// admin the chase had been done. They are told it reached nobody in
				// the outcome instead, while they are still looking at the screen.
				if (pushed + emailed > 0) await stamp(seasonId, debtor.uid, remindedAt);

				return { uid: debtor.uid, outstanding: debtor.outstanding, pushed, emailed };
			})
		);

		logger.info('Chased what is owed', {
			admin: adminUid,
			seasonId,
			chased: reminded.length,
			reached: reminded.filter(outcome => outcome.pushed + outcome.emailed > 0).length,
		});

		return { reminded } satisfies DuesReminderResult;
	})
);

/**
 * Record that a chase reached somebody.
 *
 * `update` rather than `set`, and a document that is no longer there is not an
 * error. A mark can genuinely disappear between the read above and this write,
 * because the thing an admin does while chasing somebody is mark their payment,
 * and `onDueWrite` deletes the mark the moment they do. A `set` with a merge
 * would put it back carrying nothing but this timestamp, and the rule that reads
 * it is an `exists()`: that would lock a paid-up player out of signing up with
 * no charge on the books to explain why. Failing the whole chase over it would
 * be worse still, since the notification has already gone.
 */
const stamp = (seasonId: string, uid: string, remindedAt: string): Promise<unknown> =>
	db
		.doc(`seasons/${seasonId}/debtors/${uid}`)
		.update({ remindedAt })
		.catch(() => logger.debug('Settled up while being chased', { seasonId, uid }));
