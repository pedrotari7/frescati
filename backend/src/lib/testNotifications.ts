import { HttpsError } from 'firebase-functions/v2/https';
import type {
	AppNotification,
	GameNotification,
	GameNotificationContext,
	PushPayload,
} from '../../../shared/notifications';
import { buildGamePush, buildNewPlayerPush } from '../../../shared/notifications';
import { formatGameWhen } from '../../../shared/format';
import { getGame, getSeason } from './data';

/**
 * Builds the payload for a debug send — shared by `sendTestPush` and
 * `sendTestEmail` so a hand-triggered notification is built exactly the same
 * way regardless of which channel it goes out on, and there is one place that
 * decides what a test send looks like rather than two that could drift.
 *
 * `newPlayer` stands `sender` in as the newcomer — sending it as if they had
 * just signed up themselves is the only honest way to see what an admin gets,
 * short of creating an account to throw away. `availability` borrows them the
 * same way, as the player whose answer moved.
 *
 * Those two live here rather than in `buildTestContext` because they describe
 * the sender, not the game: that one answers "which game is this about", and
 * folding a name into it would make it answer two questions.
 */
export const buildTestPayload = async (
	kind: GameNotification | AppNotification,
	{ sender, seasonId, gameId }: { sender: { uid: string; displayName: string }; seasonId?: string; gameId?: string }
): Promise<PushPayload> =>
	kind === 'newPlayer'
		? buildNewPlayerPush(sender)
		: buildGamePush(kind, {
				...(await buildTestContext(seasonId, gameId)),
				who: sender.displayName,
				// Stated rather than left to the builder's default, so a test send
				// goes down the same path a real one does.
				availability: 'in',
			});

/**
 * Real game if one was named, a plausible stand-in otherwise.
 *
 * Worth the two reads: a payload carrying a real deep link is the only way to
 * test what the notification does when tapped, including the service worker's
 * "I'm in" action handing `?respond=in` back to the app.
 */
export const buildTestContext = async (seasonId?: string, gameId?: string): Promise<GameNotificationContext> => {
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
