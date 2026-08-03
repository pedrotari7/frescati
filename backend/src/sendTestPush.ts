import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { NotificationPrefs } from '../../shared/types';
import type { GameNotification, GameNotificationContext } from '../../shared/notifications';
import { GAME_NOTIFICATIONS, NOTIFICATION_PREF, buildGamePush } from '../../shared/notifications';
import { formatGameWhen } from '../../shared/format';
import { db, REGION } from './lib/firebase';
import { getGame, getSeason } from './lib/data';
import { sendPush } from './lib/push';

/**
 * Sends one of the real notifications to the caller's own devices.
 *
 * There is no other way to test push honestly. Firebase has no Cloud Messaging
 * emulator, so a notification only exists once something server-side asks FCM
 * for it — and the events that do are awkward to stage: `atRisk` fires on an
 * edge that only somebody else's response can cross, and reminders are a
 * scheduled sweep gated on a window that is recorded as sent forever after.
 *
 * Deliberately narrow, because this exists in production:
 *   - app admins only;
 *   - it always sends to `request.auth.uid`, never to a uid from the request,
 *     so it cannot be turned into a way to notify somebody else;
 *   - it builds its payload with the same `buildGamePush` every real trigger
 *     uses and sends it down the same `sendPush`, preferences and dead-token
 *     cleanup included, rather than reaching for `messaging()` itself. A debug
 *     path that skips the checks stops testing the thing it is there to test.
 */
export const sendTestPush = onCall<{ kind: GameNotification; seasonId?: string; gameId?: string }>(
	{ region: REGION },
	async request => {
		if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
		if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'App admins only.');

		const { kind, seasonId, gameId } = request.data;

		if (!GAME_NOTIFICATIONS.includes(kind)) {
			throw new HttpsError('invalid-argument', `Unknown notification kind: ${kind}`);
		}

		const uid = request.auth.uid;
		const context = await buildContext(seasonId, gameId);

		// Read these alongside the send so a silent result can say which of the
		// two reasons it was. "Nothing happened" is the least useful thing a
		// debug button can report, and both causes are invisible from the phone.
		const [tokensSnap, userSnap] = await Promise.all([
			db.collection(`users/${uid}/pushTokens`).get(),
			db.doc(`users/${uid}`).get(),
		]);

		const prefs = userSnap.data()?.notificationPrefs as NotificationPrefs | undefined;
		// Absent prefs means opted in — the defaults are on, same as `tokensFor`.
		const prefEnabled = prefs?.[NOTIFICATION_PREF[kind]] !== false;

		// Built here rather than inside `sendGamePush` only so it can be handed
		// back to the caller: the screen shows the copy that actually went out,
		// which is worth more than a preview it composed itself and would have
		// to keep in step. Both the payload and the preference still come from
		// `kind`, so they cannot be paired up wrongly.
		const payload = buildGamePush(kind, context);
		const sent = await sendPush([uid], payload, NOTIFICATION_PREF[kind]);

		logger.info('Sent a test notification', { uid, kind, sent, devices: tokensSnap.size, prefEnabled });

		return { sent, devices: tokensSnap.size, prefEnabled, payload };
	}
);

/**
 * Real game if one was named, a plausible stand-in otherwise.
 *
 * Worth the two reads: a payload carrying a real deep link is the only way to
 * test what the notification does when tapped, including the service worker's
 * "I'm in" action handing `?respond=in` back to the app.
 */
const buildContext = async (seasonId?: string, gameId?: string): Promise<GameNotificationContext> => {
	if (!seasonId || !gameId) {
		return { when: 'Tue 1 Sep · 19:00', url: '/seasons', gameId: 'sample', shortBy: 2, playing: 6 };
	}

	const [season, game] = await Promise.all([getSeason(seasonId), getGame(seasonId, gameId)]);

	if (!season || !game) throw new HttpsError('not-found', 'That game no longer exists.');

	const minimum = game.minPlayers ?? season.minPlayers;

	return {
		when: formatGameWhen(game.kickoff, season.slot.timezone),
		url: `/s/${seasonId}/g/${gameId}`,
		gameId,
		cancelledReason: game.cancelledReason,
		// The real trigger only fires while `playing < minimum`, so a shortfall
		// is never zero in the wild. Flooring it at one keeps the test message
		// reading like the real one when the game happens to be well subscribed.
		shortBy: Math.max(1, minimum - (game.counts?.playing ?? 0)),
		playing: game.counts?.playing ?? 0,
	};
};
