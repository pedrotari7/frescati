import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, REGION } from './lib/firebase';
import { getWatcherUids } from './lib/data';
import { instrument } from './lib/sentry';

/**
 * Who has the bell on for one game.
 *
 * `availability` is the only notification with a per-game switch, and it is the
 * only one whose audience an admin cannot work out from anything on screen: the
 * others go to a standing audience — the season roster, everyone who answered,
 * every app admin — which is already visible. This one goes to whoever tapped
 * the bell, and the roster says nothing about who did.
 *
 * A callable rather than a loosened rule, and the distinction matters more here
 * than the one `getPushDevices` draws. That collection is closed because a
 * registration token is a capability; this one is closed because *nothing needs
 * it* — "a game the whole group can read has no business also publishing who is
 * quietly keeping an eye on it", as `firestore.rules` puts it. An admin asking
 * "who hears if I move kick-off" is the one thing that does need it, so it is
 * answered here, behind the global role, and the rule itself stays shut: every
 * signed-in player still reads exactly one watcher document, their own.
 *
 * App admins only, not season admins. The rules test that pins this spells out
 * "season admins included", and a season admin is still one of the players
 * whose own following is private from the person sitting next to them.
 *
 * Returns uids and nothing else. Names, avatars and the roster are already on
 * the client from `useUsers`, and `createdAt` would only invite a screen to
 * report how long somebody has been paying attention.
 */
export const getGameWatchers = onCall<{ seasonId: string; gameId: string }>(
	{ region: REGION },
	instrument('getGameWatchers', async request => {
		if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
		if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'App admins only.');

		const { seasonId, gameId } = request.data ?? {};
		if (!seasonId || !gameId) throw new HttpsError('invalid-argument', 'A seasonId and a gameId are required.');

		// A game that has been deleted has no watchers left either — the cascade
		// takes the subcollection with it — so an empty list is the honest answer
		// rather than a 404. Checked anyway, because a mistyped path would
		// otherwise read on screen as "nobody is following this" and be believed.
		const game = await db.doc(`seasons/${seasonId}/games/${gameId}`).get();
		if (!game.exists) throw new HttpsError('not-found', 'That game does not exist.');

		return { uids: await getWatcherUids(seasonId, gameId) };
	})
);
