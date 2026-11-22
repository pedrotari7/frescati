import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import type { Season } from '../../shared/types';
import { signupReminderDue } from '../../shared/signup';
import { db, REGION } from './lib/firebase';
import { getAllUserUids } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { DAILY, instrumentSchedule, reportError } from './lib/sentry';
import { sendSignupPush } from './lib/push';
import { signupContext } from './lib/signupContext';

/**
 * Nudges everybody who has not answered a season that is still signing up.
 *
 * Runs every day and leaves the calendar to `signupReminderDue`, which says
 * yes on every third day after the season was created and stops at the close
 * date. A day that is not due costs one query for the drafts and nothing else.
 * Who counts as unanswered is the absence of a `signups` document, the same
 * third state the rest of the app reads.
 */
export const sendSignupReminders = onSchedule(
	{ schedule: '0 18 * * *', timeZone: 'Europe/Stockholm', region: REGION, secrets: EMAIL_SECRETS },
	// A day of margin: a reminder an hour late still lands the same evening.
	instrumentSchedule('sendSignupReminders', { schedule: DAILY, checkinMargin: 120, maxRuntime: 10 }, async () => {
		const now = new Date();
		const draftsSnap = await db.collection('seasons').where('status', '==', 'draft').get();
		let reminded = 0;

		for (const seasonDoc of draftsSnap.docs) {
			const season = { ...seasonDoc.data(), id: seasonDoc.id } as Season;
			if (!signupReminderDue(season, now)) continue;

			try {
				const [everybody, answered] = await Promise.all([
					getAllUserUids(),
					db.collection(`seasons/${season.id}/signups`).select().get(),
				]);
				const answeredUids = new Set(answered.docs.map(doc => doc.id));
				const silent = everybody.filter(uid => !answeredUids.has(uid));

				if (silent.length > 0) await sendSignupPush(silent, 'signupReminder', signupContext(season));
				reminded += silent.length;
			} catch (error) {
				// One season failing must not cost the others their nudge. The
				// next due day is three days away, so this is worth hearing about.
				reportError('Could not remind a season about its sign-up', { seasonId: season.id }, error);
			}
		}

		logger.info('Sign-up reminder sweep finished', { drafts: draftsSnap.size, reminded });
	})
);
