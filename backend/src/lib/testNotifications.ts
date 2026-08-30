import { HttpsError } from 'firebase-functions/v2/https';
import type { AnyNotification, GameNotificationContext, PushPayload } from '../../../shared/notifications';
import { buildDuesPush, buildGamePush, buildNewPlayerPush } from '../../../shared/notifications';
import { formatGameWhen } from '../../../shared/format';
import { SAMPLE_DEBT } from '../../../shared/debug';
import { getGame, getMostRecentActiveSeasonId, getSeason } from './data';

/**
 * Builds the payload for a debug send. Shared by `sendTestPush` and
 * `sendTestEmail` so a hand-triggered notification is built exactly the same
 * way regardless of which channel it goes out on, and there is one place that
 * decides what a test send looks like rather than two that could drift.
 *
 * `newPlayer` stands `sender` in as the newcomer, sending it as if they had
 * just signed up themselves is the only honest way to see what an admin gets,
 * short of creating an account to throw away. `availability` borrows them the
 * same way, as the player whose answer moved, and `motmResult` as the player
 * the group picked.
 *
 * Those live here rather than in `buildTestContext` because they describe the
 * sender, not the game: that one answers "which game is this about", and
 * folding a name into it would make it answer two questions.
 *
 * `newPlayer` resolves its own deep link through `getMostRecentActiveSeasonId`
 * rather than the caller's `seasonId`. The debug screen's season picker is
 * for the game kinds, and a test send is only honest if it deep-links exactly
 * where the real trigger would.
 *
 * `duesReminder` is the one kind that needs the picker, since it is about a
 * named season rather than a game, and the one that invents its figures rather
 * than borrowing the sender's. An admin testing the copy is rarely somebody the
 * books say owes anything.
 */
/** The kinds whose deep link is the team sheet rather than the game page. */
const ON_THE_TEAM_SHEET: AnyNotification[] = ['motm', 'motmResult'];

export const buildTestPayload = async (
	kind: AnyNotification,
	{ sender, seasonId, gameId }: { sender: { uid: string; displayName: string }; seasonId?: string; gameId?: string }
): Promise<PushPayload> => {
	if (kind === 'newPlayer') return buildNewPlayerPush({ ...sender, seasonId: await getMostRecentActiveSeasonId() });

	// The one kind with no stand-in for a missing season. The game kinds all have
	// one, and theirs links to `/seasons` and still reads. This one is entirely
	// *about* a named season, and both halves worth testing, the name in the body
	// and the deep link to that season's books, need a real one to point at.
	if (kind === 'duesReminder') {
		const season = seasonId ? await getSeason(seasonId) : null;

		if (!season) throw new HttpsError('not-found', 'Pick a season to test the dues chase.');

		return buildDuesPush({ seasonId: season.id, seasonName: season.name, ...SAMPLE_DEBT, blocked: true });
	}

	const context = await buildTestContext(seasonId, gameId);

	return buildGamePush(kind, {
		...context,
		// The vote and its result both live on the team sheet rather than the
		// game page, so a test send has to land there too. Same reasoning as
		// `newPlayer` resolving its own deep link: a test that opens somewhere
		// else is a test of something else. Only when a real game was named; the
		// stand-in context has no team sheet to point at.
		...(ON_THE_TEAM_SHEET.includes(kind) && seasonId && gameId ? { url: `${context.url}/tournament` } : {}),
		who: sender.displayName,
		winners: [sender.displayName],
		// Stated rather than left to the builder's default, so a test send
		// goes down the same path a real one does. The vote count has nothing
		// real to derive from. A game that has not been voted on has no totals,
		// and reading a decision back would test the read rather than the copy,
		// so it is a plausible number, chosen odd enough to be recognisable as
		// the stand-in it is.
		availability: 'in',
		votes: 5,
	});
};

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
