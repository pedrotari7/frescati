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
	/**
	 * Whether the service worker's "I'm in" shortcut belongs on this one. Only a
	 * game has something to say yes to; offering it on an admin notice about
	 * somebody signing up would open the app and then silently do nothing.
	 */
	respondable: boolean;
}

/** The events worth interrupting somebody for. */
export type GameNotification = 'cancelled' | 'restored' | 'atRisk' | 'kickoffMoved' | 'reminder';

export const GAME_NOTIFICATIONS: GameNotification[] = ['reminder', 'atRisk', 'cancelled', 'restored', 'kickoffMoved'];

/**
 * Notifications about the app itself rather than about one game. Only app
 * admins are sent these — there is nobody else they would mean anything to.
 */
export type AppNotification = 'newPlayer';

const APP_NOTIFICATIONS: AppNotification[] = ['newPlayer'];

/** Everything the app can send, for anywhere that has to cover all of it. */
export const NOTIFICATIONS: (GameNotification | AppNotification)[] = [...GAME_NOTIFICATIONS, ...APP_NOTIFICATIONS];

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
export const NOTIFICATION_PREF: Record<GameNotification | AppNotification, keyof NotificationPrefs> = {
	cancelled: 'gameChanges',
	restored: 'gameChanges',
	atRisk: 'gameChanges',
	kickoffMoved: 'gameChanges',
	reminder: 'reminders',
	newPlayer: 'newPlayers',
};

/**
 * Which switches on a profile mean anything for this person.
 *
 * `newPlayers` is only ever sent to app admins, so for everybody else it is a
 * setting with nothing behind it — counting it would report a player as
 * partially muted for turning off something they were never going to get.
 */
export const relevantPrefs = (isAppAdmin: boolean): (keyof NotificationPrefs)[] =>
	isAppAdmin ? ['reminders', 'gameChanges', 'newPlayers'] : ['reminders', 'gameChanges'];

/**
 * Why nothing is arriving, for the three reasons that aren't a bug.
 *
 * `noDevice` beats `muted` deliberately: preferences are academic until
 * something is registered to send to, and telling somebody to check their
 * settings when they have never turned notifications on sends them looking in
 * the wrong place.
 */
export type PushReach = 'reachable' | 'partly' | 'muted' | 'noDevice';

export const getPushReach = ({
	prefs,
	devices,
	isAppAdmin,
}: {
	prefs?: NotificationPrefs;
	/** How many devices are registered to the account. */
	devices: number;
	isAppAdmin: boolean;
}): PushReach => {
	if (devices === 0) return 'noDevice';

	const relevant = relevantPrefs(isAppAdmin);
	// Absent means opted in, matching `tokensFor` on the backend — a profile
	// written before a preference existed must not read as switched off.
	const on = relevant.filter(key => prefs?.[key] !== false);

	if (on.length === 0) return 'muted';

	return on.length === relevant.length ? 'reachable' : 'partly';
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
	respondable: true,
});

export interface NewPlayerContext {
	uid: string;
	/**
	 * May be empty. A profile is written in a single merge, but one can already
	 * exist in a partial state — see `upsertUserDoc` — so this never assumes a
	 * name is there to print.
	 */
	displayName: string;
}

/**
 * Somebody has signed into the app for the first time.
 *
 * Sent to app admins only, so it links to the one screen that lists everybody
 * who has ever signed in rather than to a season the newcomer isn't in yet.
 */
export const buildNewPlayerPush = ({ uid, displayName }: NewPlayerContext): PushPayload => ({
	title: 'New player',
	body: `${displayName.trim() || 'Somebody'} just signed into Frescati for the first time.`,
	url: '/admin',
	// Per person rather than per event: two people joining the same evening are
	// two separate things to know about, so these must not replace each other.
	tag: `new-player-${uid}`,
	respondable: false,
});
