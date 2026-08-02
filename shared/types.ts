/**
 * Shared domain types. Compiled into both the frontend and the Cloud Functions,
 * so nothing here may reference a Firebase SDK type — the two SDKs disagree.
 *
 * All instants are ISO 8601 UTC strings (`2026-09-01T17:00:00.000Z`). Firestore
 * sorts and range-filters those lexicographically, which for ISO 8601 UTC is the
 * same as chronologically, so `orderBy('kickoff')` works without Timestamps.
 */

export type SeasonStatus = 'draft' | 'active' | 'archived';
export type GameStatus = 'scheduled' | 'cancelled' | 'played';
export type ResponseStatus = 'in' | 'out';
export type PlayerRole = 'member' | 'extra';

/** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Venue {
	name: string;
	address?: string;
	mapsUrl?: string;
}

export interface SeasonSlot {
	weekday: Weekday;
	/** Local wall-clock time in `timezone`, `HH:mm`. */
	time: string;
	durationMinutes: number;
	/** IANA zone, e.g. `Europe/Stockholm`. */
	timezone: string;
}

export interface NotificationPrefs {
	reminders: boolean;
	gameChanges: boolean;
}

export interface AppUser {
	uid: string;
	displayName: string;
	email: string;
	photoURL: string | null;
	createdAt: string;
	lastSeenAt: string;
	/**
	 * Display mirror of the `admin` custom claim. NOT the source of truth —
	 * security rules read `request.auth.token.admin`.
	 */
	isAppAdmin: boolean;
	notificationPrefs: NotificationPrefs;
}

export interface PushToken {
	token: string;
	createdAt: string;
	userAgent: string;
}

export interface Season {
	id: string;
	name: string;
	status: SeasonStatus;
	/** Civil date, `YYYY-MM-DD`. */
	startDate: string;
	/** Civil date, `YYYY-MM-DD`, inclusive. */
	endDate: string;
	venue: Venue;
	slot: SeasonSlot;
	/** Below this many confirmed players the game is flagged at risk. */
	minPlayers: number;
	/** Responses lock this many hours before kickoff. */
	responseDeadlineHours: number;
	/** Hours before kickoff at which to nudge members who haven't responded. */
	reminderHours: number[];
	memberUids: string[];
	adminUids: string[];
	createdAt: string;
	createdBy: string;
}

export interface GameCounts {
	membersIn: number;
	membersOut: number;
	extrasIn: number;
	extrasOut: number;
	/** Extras with `status: 'in'` that hold a confirmed spot. */
	extrasConfirmed: number;
	/** `membersIn + extrasConfirmed` — the headcount that actually matters. */
	playing: number;
}

export interface Game {
	id: string;
	seasonId: string;
	/** ISO 8601 UTC. */
	kickoff: string;
	/**
	 * `kickoff` as epoch milliseconds. Redundant on purpose: security rules have
	 * no way to parse an ISO 8601 string into an instant, so without a numeric
	 * mirror they cannot compare `request.time` against kickoff and the response
	 * deadline is unenforceable outside the UI. Kept in step by whoever writes
	 * `kickoff`.
	 */
	kickoffMillis: number;
	/** ISO 8601 UTC. */
	endsAt: string;
	venue: Venue;
	status: GameStatus;
	/** Overrides `Season.minPlayers` for this game only. */
	minPlayers?: number;
	isOneOff: boolean;
	note?: string;
	cancelledReason?: string;
	/** Written only by the `onResponseWrite` function; client writes are rejected. */
	counts: GameCounts;
	/** Written only by the `onResponseWrite` function; client writes are rejected. */
	atRisk: boolean;
	/**
	 * Which `reminderHours` windows have already been pushed for this game, so a
	 * scheduled function that runs hourly doesn't nag people every hour.
	 * Written only by `sendReminders`; client writes are rejected.
	 */
	remindersSent?: number[];
	createdAt: string;
	createdBy: string;
}

/**
 * One player's answer for one game. The **absence** of this document is the
 * third state, "no response" — never write a placeholder.
 */
export interface GameResponse {
	uid: string;
	status: ResponseStatus;
	/** Snapshotted at write time; security rules check it against real membership. */
	role: PlayerRole;
	/**
	 * A season admin's decision on whether this extra holds a spot. Absent means
	 * undecided, which counts as *not* holding one — see `isConfirmed`.
	 * Confirmation stays derived rather than stored so no trigger has to write
	 * back to the document it fires on. Writable only by season admins.
	 */
	confirmOverride?: boolean;
	respondedAt: string;
	updatedAt: string;
	note?: string;
}

export const EMPTY_COUNTS: GameCounts = {
	membersIn: 0,
	membersOut: 0,
	extrasIn: 0,
	extrasOut: 0,
	extrasConfirmed: 0,
	playing: 0,
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
	reminders: true,
	gameChanges: true,
};
