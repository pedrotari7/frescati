import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { AppUser, NotificationPrefs } from '../../shared/types';
import type { AnyNotification } from '../../shared/notifications';
import { NOTIFICATIONS, canEmail } from '../../shared/notifications';
import { db, REGION } from './lib/firebase';
import { EMAIL_SECRETS, lookUpVerifiedEmails, sendEmail } from './lib/email';
import { buildTestPayload } from './lib/testNotifications';
import { requireAppAdmin } from './lib/auth';
import { instrument } from './lib/sentry';

export type EmailTestStatus = 'sent' | 'noAddress' | 'emailOff';

export interface EmailTestOutcome {
	uid: string;
	displayName: string;
	status: EmailTestStatus;
}

/**
 * Sends one of the app's real notifications, by email, to a hand-picked set of
 * real accounts.
 *
 * The one debug tool that can notify somebody else. Everything else in here,
 * `sendTestPush` included, is pinned to `request.auth.uid` on purpose. Worth
 * the exception because it is the only way to see what the fallback actually
 * delivers and how it renders: `sendTestPush` only ever proves the *caller's*
 * inbox, and there is no Resend sandbox to check the rest against.
 *
 * Kept narrow the same way every other test send is:
 *   - app admins only;
 *   - the copy comes from `buildTestPayload`, the same builder `sendTestPush`
 *     uses, so this can never drift into testing different words than the
 *     ones a real trigger sends;
 *   - delivery goes through the real `sendEmail` transport rather than a
 *     bespoke call to Resend, so a successful send here means the pipeline
 *     genuinely works, not that a preview rendered.
 *
 * Does **not** gate on the per-kind preference (`reminders`, `gameChanges`,
 * …) the way the real fallback does. An admin picking a person and a kind
 * here is a one-off, deliberate decision, not the automated send those
 * preferences exist to silence. It still honours `emailFallback` and requires
 * a verified address, because neither of those is an editorial choice about
 * which notifications to see: one is "never email me at all" and the other is
 * a plain absence of anywhere to send it, and a debug button has no business
 * overriding either.
 */
export const sendTestEmail = onCall<{
	kind: AnyNotification;
	uids: string[];
	seasonId?: string;
	gameId?: string;
}>(
	{ region: REGION, secrets: EMAIL_SECRETS },
	instrument('sendTestEmail', async request => {
		const callerUid = requireAppAdmin(request);

		const { kind, uids, seasonId, gameId } = request.data;

		if (!NOTIFICATIONS.includes(kind)) {
			throw new HttpsError('invalid-argument', `Unknown notification kind: ${kind}`);
		}

		// De-duplicated so picking the same person twice in the UI can't double the
		// "sent" count or, worse, double the mail.
		const targets = Array.from(new Set(uids ?? []));

		if (targets.length === 0) throw new HttpsError('invalid-argument', 'Pick at least one person to send to.');

		const callerSnap = await db.doc(`users/${callerUid}`).get();

		const payload = await buildTestPayload(kind, {
			sender: {
				uid: callerUid,
				displayName: (callerSnap.data()?.displayName as string | undefined) ?? '',
			},
			seasonId,
			gameId,
		});

		const outcomes = await describeReach(targets);
		const sendable = outcomes.filter(outcome => outcome.status === 'sent').map(outcome => outcome.uid);

		// The actual send, through the same transport and gating every real
		// fallback email goes through. `describeReach` above only explains why,
		// it isn't what decides whether mail goes out.
		const sent = await sendEmail(sendable, payload);

		logger.info('Sent a test email', { admin: callerUid, kind, requested: targets.length, sent });

		return { payload, sent, results: outcomes };
	})
);

/**
 * Why each target is or isn't reachable by email, for the admin screen to show
 * next to their name. Reads the same two sources `sendEmail` itself resolves
 * from, the profile for the preference, Auth for the address, because
 * that's the only way this can't disagree with what actually happens next.
 */
const describeReach = async (uids: string[]): Promise<EmailTestOutcome[]> => {
	// `lookUpVerifiedEmails` already chunks internally against Auth's per-call
	// limit, so this only has to fan out the two sources, not the pagination.
	const [profiles, addresses] = await Promise.all([
		Promise.all(uids.map(uid => db.doc(`users/${uid}`).get())),
		lookUpVerifiedEmails(uids),
	]);

	return profiles.map(snapshot => {
		const user = snapshot.data() as AppUser | undefined;
		const prefs = user?.notificationPrefs as NotificationPrefs | undefined;
		const hasEmail = addresses.has(snapshot.id);

		const status: EmailTestStatus = !hasEmail
			? 'noAddress'
			: canEmail({ prefs, hasEmail: true })
				? 'sent'
				: 'emailOff';

		return { uid: snapshot.id, displayName: user?.displayName ?? 'Unknown', status };
	});
};
