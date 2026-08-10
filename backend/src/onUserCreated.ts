import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { AppUser } from '../../shared/types';
import { NOTIFICATION_PREF, buildNewPlayerPush } from '../../shared/notifications';
import { REGION } from './lib/firebase';
import { getAppAdminUids } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { sendPush } from './lib/push';
import { instrument } from './lib/sentry';

/**
 * Tells the app admins when somebody signs in for the first time.
 *
 * A newcomer is a stranger until an admin does something about them: extras can
 * answer any game, but only an admin can put them on a season's roster. Nothing
 * announced their arrival, so that only happened when an admin happened to
 * scroll the user list and notice a name they didn't recognise.
 *
 * Fires on the profile document rather than on the Auth account, because the
 * profile is what the rest of the app treats as existing — an account with no
 * `users/{uid}` document renders nowhere and can't be added to anything. It is
 * written by the client on first sign-in, in one merge, so exactly one creation
 * event marks the moment somebody joins.
 */
export const onUserCreated = onDocumentCreated(
	{ document: 'users/{uid}', region: REGION, secrets: EMAIL_SECRETS },
	instrument('onUserCreated', async event => {
		const user = event.data?.data() as AppUser | undefined;
		if (!user) return;

		const { uid } = event.params;

		// A profile that arrives already carrying the badge wasn't written by
		// somebody signing in — the create rule forbids a client from granting
		// itself `isAppAdmin`, so this is `setAppAdmin` or the bootstrap script
		// promoting a uid that had no profile yet. Whoever did it already knows.
		if (user.isAppAdmin) return;

		const admins = await getAppAdminUids();

		const sent = await sendPush(
			admins,
			buildNewPlayerPush({ uid, displayName: user.displayName ?? '' }),
			NOTIFICATION_PREF.newPlayer
		);

		logger.info('Notified app admins of a new player', { uid, admins: admins.length, ...sent });
	})
);
