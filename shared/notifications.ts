import type { NotificationPrefs } from './types';

/**
 * Every push the app sends, built in one place.
 *
 * The payloads used to be written inline at each trigger, which was fine until
 * something needed to send one on purpose — a debug screen composing its own
 * copies would be a test of the copies, not of what players actually receive.
 * Same reasoning as the seeder deriving its data from `shared/` rather than
 * hand-writing it.
 */

export interface PushPayload {
	title: string;
	body: string;
	/** Deep link opened on tap. */
	url: string;
	/** Notifications sharing a tag replace each other instead of stacking. */
	tag: string;
}

/** The events worth interrupting somebody for. */
export type GameNotification = 'cancelled' | 'restored' | 'atRisk' | 'kickoffMoved' | 'reminder';

export const GAME_NOTIFICATIONS: GameNotification[] = ['reminder', 'atRisk', 'cancelled', 'restored', 'kickoffMoved'];

export interface GameNotificationContext {
	/** Kick-off, already formatted in the season's timezone. */
	when: string;
	/** Deep link to the game. */
	url: string;
	gameId: string;
	/** `cancelled` only, and optional there — an admin needn't give a reason. */
	cancelledReason?: string;
	/** `atRisk` only: how many more players the game needs. */
	shortBy?: number;
	/** `reminder` only: how many have said yes so far. */
	playing?: number;
}

/**
 * Which preference silences each kind.
 *
 * Paired with the payload here rather than passed alongside it at the call
 * site, where a cancellation sent under `reminders` would look perfectly
 * reasonable and reach people who had switched cancellations off.
 */
export const NOTIFICATION_PREF: Record<GameNotification, keyof NotificationPrefs> = {
	cancelled: 'gameChanges',
	restored: 'gameChanges',
	atRisk: 'gameChanges',
	kickoffMoved: 'gameChanges',
	reminder: 'reminders',
};

type Copy = (context: GameNotificationContext) => { title: string; body: string };

const COPY: Record<GameNotification, Copy> = {
	cancelled: ({ when, cancelledReason }) => ({
		title: 'Game called off',
		body: cancelledReason ? `${when} is off — ${cancelledReason}` : `${when} is off.`,
	}),

	restored: ({ when }) => ({
		title: 'Game back on',
		body: `${when} is on again. Are you in?`,
	}),

	atRisk: ({ when, shortBy }) => ({
		title: 'Short of players',
		body: `${when} needs ${Math.max(0, shortBy ?? 0)} more. Can you make it?`,
	}),

	kickoffMoved: ({ when }) => ({
		title: 'Kick-off moved',
		body: `The game has moved to ${when}.`,
	}),

	reminder: ({ when, playing }) => ({
		title: 'Are you playing?',
		body: `${when} — ${playing ?? 0} in so far.`,
	}),
};

export const buildGamePush = (kind: GameNotification, context: GameNotificationContext): PushPayload => ({
	...COPY[kind](context),
	url: context.url,
	// One tag per game, so three notifications about the same Tuesday replace
	// each other on the lock screen instead of stacking up.
	tag: `game-${context.gameId}`,
});
