import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { NotificationPrefs } from '../../../shared/types';
import type { PushPayload } from '../../../shared/notifications';
import { buildEmail, canEmail } from '../../../shared/notifications';
import { db } from './firebase';

/**
 * The email fallback: what somebody gets when a push couldn't reach them.
 *
 * Deliberately not a second channel. Nothing is composed here — `buildEmail`
 * takes the payload the trigger already built — and nothing is *sent* here that
 * a push wouldn't have carried. `sendPush` decides who ends up in this file, so
 * the rule stays in one place: a person is emailed only when their preference
 * for that kind is on and FCM delivered nothing.
 *
 * Addresses come from Firebase Auth rather than Firestore, which is where the
 * app has always kept them — `users/{uid}` is readable by every signed-in
 * player, and a mirrored address there would be a group-wide address book. See
 * `scripts/stripUserEmails.ts`.
 */

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

/**
 * Where the mail comes from, e.g. `Frescati <notifications@your-domain.com>`.
 * Has to be on a domain verified with Resend or every send is rejected.
 */
const EMAIL_FROM = defineString('EMAIL_FROM', { default: '' });

/**
 * The app's public origin, e.g. `https://frescati.vercel.app`. Push payloads
 * carry relative links because a service worker resolves them against its own
 * scope; a mail client has no such origin, so the email builder needs this to
 * make them absolute.
 */
const APP_URL = defineString('APP_URL', { default: '' });

/**
 * Every function that can reach `sendPush` has to declare this, or the secret
 * isn't bound into its runtime and the fallback silently sends nothing.
 */
export const EMAIL_SECRETS = [RESEND_API_KEY];

/** Resend accepts up to 100 messages in one batch call. */
const BATCH_LIMIT = 100;

/** `getUsers` takes at most 100 identifiers per call. */
const LOOKUP_LIMIT = 100;

interface Recipient {
	uid: string;
	email: string;
}

/**
 * Only in the emulator. There is no Resend sandbox worth wiring up, and a local
 * `pnpm dev:seeded` run that mailed the whole seeded roster for real would be a
 * genuinely bad afternoon. Logged instead, so the path is still exercised.
 *
 * Same trade as push: the honest end-to-end test is the admin debug screen
 * firing a real one in production.
 */
const isEmulated = (): boolean => process.env.FUNCTIONS_EMULATOR === 'true';

/**
 * Which of these accounts can be emailed at all.
 *
 * Reads the profile for the preference and Auth for the address, because
 * neither knows about the other, and a uid with no profile document is still
 * treated as opted in — the same way `sendPush` reads a missing preference, and
 * the same way it would still push to that uid's tokens.
 */
const resolveRecipients = async (uids: string[]): Promise<Recipient[]> => {
	const [profiles, addresses] = await Promise.all([
		Promise.all(uids.map(uid => db.doc(`users/${uid}`).get())),
		lookUpAddresses(uids),
	]);

	// Filtered through the shared `canEmail` rather than by reading the
	// preference here, so the backend and the admin screen can't disagree about
	// who is reachable — the same reason `getPushReach` exists.
	return profiles.flatMap(snapshot => {
		const email = addresses.get(snapshot.id);
		const prefs = snapshot.data()?.notificationPrefs as NotificationPrefs | undefined;

		return email && canEmail({ prefs, hasEmail: true }) ? [{ uid: snapshot.id, email }] : [];
	});
};

/**
 * Verified addresses only. Sign-in is Google-only today, so in practice this
 * filters nothing; it is here because the day somebody adds email/password, an
 * unverified address is one an attacker typed, and mailing it would hand them
 * another player's game notifications.
 */
const lookUpAddresses = async (uids: string[]): Promise<Map<string, string>> => {
	const found = new Map<string, string>();

	for (let start = 0; start < uids.length; start += LOOKUP_LIMIT) {
		const chunk = uids.slice(start, start + LOOKUP_LIMIT);
		const { users } = await getAuth().getUsers(chunk.map(uid => ({ uid })));

		for (const user of users) {
			if (user.email && user.emailVerified) found.set(user.uid, user.email);
		}
	}

	return found;
};

/**
 * Send one notification by email to everybody named.
 *
 * The caller has already decided these people should be emailed — this checks
 * only that they still want email at all and that there is an address to use.
 * Returns how many were accepted, so a caller can log the two channels apart.
 *
 * A missing configuration is a no-op rather than an error: the fallback is
 * inert until somebody sets `EMAIL_FROM`, `APP_URL` and the Resend key, and a
 * game must not fail to be cancelled because nobody has done that yet.
 */
export const sendEmail = async (uids: string[], payload: PushPayload): Promise<number> => {
	if (uids.length === 0) return 0;

	const from = EMAIL_FROM.value();
	const appUrl = APP_URL.value();

	if (!from || !appUrl) return 0;

	const recipients = await resolveRecipients(uids);
	if (recipients.length === 0) return 0;

	const { subject, html, text } = buildEmail(payload, { appUrl });

	// One message per person, never a shared `to`. Bulk-addressing this would
	// show every player the rest of the group's addresses.
	const messages = recipients.map(recipient => ({ from, to: [recipient.email], subject, html, text }));

	if (isEmulated()) {
		logger.info('Would have emailed (emulated)', { subject, recipients: recipients.map(r => r.uid) });
		return messages.length;
	}

	const apiKey = RESEND_API_KEY.value();
	if (!apiKey) return 0;

	let accepted = 0;

	for (let start = 0; start < messages.length; start += BATCH_LIMIT) {
		const batch = messages.slice(start, start + BATCH_LIMIT);

		try {
			const response = await fetch('https://api.resend.com/emails/batch', {
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(batch),
			});

			if (!response.ok) {
				// The body carries which address Resend objected to, which is the
				// only way to tell a bad sender domain from one bounced player.
				logger.error('Resend rejected a batch', { status: response.status, body: await response.text() });
				continue;
			}

			accepted += batch.length;
		} catch (error) {
			// A notification is not worth failing the trigger that raised it: the
			// push has already gone out, and throwing here would retry the whole
			// thing and re-push everybody who *was* reachable.
			logger.error('Could not reach Resend', { error });
		}
	}

	return accepted;
};

/**
 * Whether the fallback is configured at all.
 *
 * Reported to the admin notification screen, which would otherwise show a whole
 * column of people as reachable by email on a project where nobody has set up a
 * sender yet — the exact kind of confident wrong answer that screen exists to
 * stop.
 */
export const isEmailConfigured = (): boolean => Boolean(EMAIL_FROM.value() && APP_URL.value());
