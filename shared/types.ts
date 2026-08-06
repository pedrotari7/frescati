/**
 * Shared domain types. Compiled into both the frontend and the Cloud Functions,
 * so nothing here may reference a Firebase SDK type — the two SDKs disagree.
 *
 * All instants are ISO 8601 UTC strings (`2026-09-01T17:00:00.000Z`). Firestore
 * sorts and range-filters those lexicographically, which for ISO 8601 UTC is the
 * same as chronologically, so `orderBy('kickoff')` works without Timestamps.
 */

import type { DevicePlatform } from './device';

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

/**
 * What we know about how somebody reaches the app, written on every sign-in.
 *
 * Exists for one question an admin cannot otherwise answer: why isn't this
 * person getting notifications? On iPhone the answer is usually "they never
 * added it to the home screen", and nothing else in the database records that.
 *
 * Coarse on purpose — a platform and a timestamp, no user agent string and no
 * device identifier. Every signed-in user can read this document, and a profile
 * here is a name, an avatar and a badge; this is as far towards a device
 * fingerprint as it goes.
 */
export interface ClientInfo {
	/** The device they last signed in on. */
	platform: DevicePlatform;
	/**
	 * The last time they opened Frescati installed rather than in a browser tab.
	 * Only ever moved forward, so a member who normally uses the home screen app
	 * still reads as installed on the day they happen to open a link in Safari.
	 *
	 * Absent means we have never seen them run it installed. There is no way to
	 * observe an uninstall, which is why this is a "last seen" rather than a
	 * flag — a date going stale is visible, a stuck `true` is not.
	 */
	lastStandaloneAt?: string;
}

export interface NotificationPrefs {
	reminders: boolean;
	gameChanges: boolean;
	/**
	 * Somebody signing into the app for the first time. Only app admins are ever
	 * sent one, so this preference is only worth showing to them — but it lives
	 * on every profile like the others, because the badge can be granted and
	 * revoked and a preference that vanished with it would forget its setting.
	 */
	newPlayers: boolean;
}

/**
 * The publicly readable half of a person. Every signed-in user can read these,
 * because rosters and the member picker render names and avatars for uids they
 * only ever see as strings.
 *
 * Deliberately holds no contact details. Email lives in Firebase Auth, which is
 * not readable from the client at all — see `frontend/lib/auth.tsx`.
 */
export interface AppUser {
	uid: string;
	displayName: string;
	photoURL: string | null;
	createdAt: string;
	lastSeenAt: string;
	/**
	 * Display mirror of the `admin` custom claim. NOT the source of truth —
	 * security rules read `request.auth.token.admin`.
	 */
	isAppAdmin: boolean;
	notificationPrefs: NotificationPrefs;
	/** Absent on anybody who hasn't signed in since this was added. */
	client?: ClientInfo;
	/**
	 * Absent until they've played a rated game. A player with no rating is
	 * seeded from the group average at selection time rather than carrying a
	 * stored placeholder — same reasoning as a missing response document.
	 */
	rating?: PlayerRating;
}

export interface PushToken {
	token: string;
	createdAt: string;
	userAgent: string;
}

/**
 * One registered device, as the admin notification screen sees it.
 *
 * Pointedly **not** a `PushToken`. The token itself is a capability to push to
 * that device, which is why security rules keep the collection private to its
 * owner; this is what `getPushDevices` hands an admin instead — enough to tell
 * a phone from a laptop and to see whether a registration is recent, with
 * nothing in it that could be used to send anything.
 */
export interface PushDevice {
	platform: DevicePlatform;
	/** Browser family, or an empty string when the user agent didn't parse. */
	browser: string;
	/** When this device registered. Empty on tokens written before it was stored. */
	registeredAt: string;
}

/**
 * A player's standing, carried across every season they ever play.
 *
 * Stored as Elo rather than the 0–100 people see, because a bounded scale
 * clamps: once two players both sit at the ceiling the balancer can no longer
 * tell them apart, and the clamp quietly breaks the zero-sum property the
 * update relies on. `toDisplayRating` in `rating.ts` does the mapping.
 *
 * Written only by the rating functions; security rules freeze it against client
 * writes the same way `isAppAdmin` is frozen.
 */
export interface PlayerRating {
	elo: number;
	/** Rated games played. Drives the provisional K-factor. */
	games: number;
	updatedAt: string;
}

/**
 * The levers an admin has over team selection. Defaults live on the season and
 * a game may override any of them; whatever was in force gets snapshotted onto
 * the teams document so a lineup stays explicable after the levers move.
 */
export interface BalanceSettings {
	/**
	 * How far from the most balanced split the optimizer may wander, 0–1. At 0
	 * it always returns the flattest teams it found, which means the same
	 * headcount produces the same teams every week.
	 */
	randomness: number;
	/**
	 * How hard to avoid putting recent teammates together, 0–1. Weighed against
	 * balance rather than absolute — at 0 history is ignored entirely.
	 */
	repeatPenalty: number;
	/** How many previous games the repeat penalty looks back over. */
	repeatLookback: number;
	/** Minutes per match, used to size the night against the season's slot. */
	matchMinutes: number;
}

export const DEFAULT_BALANCE_SETTINGS: BalanceSettings = {
	randomness: 0.3,
	repeatPenalty: 0.4,
	repeatLookback: 4,
	matchMinutes: 5,
};

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
	/** Team-selection levers. Absent on seasons created before teams existed. */
	balance?: BalanceSettings;
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
	/** Overrides any of `Season.balance` for this game only. */
	balance?: Partial<BalanceSettings>;
	/**
	 * Bumped by `onResponseWrite` every time the playing pool could have moved.
	 * The debounced team rebuild carries the generation it was queued for and
	 * drops itself if this has moved on, so a burst of answers collapses into a
	 * single run instead of one per response.
	 *
	 * Written only by the functions; client writes are rejected.
	 */
	teamsGeneration?: number;
	/**
	 * When the night's results were confirmed and the ratings applied. Set, the
	 * scoreboard is closed to everyone but a season admin — whose correction
	 * replays every rated game from here forward.
	 *
	 * Written only by the functions; client writes are rejected.
	 */
	resultFinalisedAt?: string;
	/**
	 * Bumped by an admin tapping Reshuffle. Feeds the optimizer's seed, so the
	 * same pool re-rolls into a different — equally balanced — split. Admin
	 * writable, unlike `teamsGeneration`.
	 */
	reshuffleCount?: number;
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

/**
 * One squad for one night. `uids` is the whole squad; how many of them are on
 * the pitch at once depends on who they're playing — see `getSideSize`.
 */
export interface TournamentTeam {
	/** 0 = A, 1 = B … Stable for the life of the document. */
	index: number;
	uids: string[];
}

/**
 * The generated lineup, at `seasons/{id}/games/{id}/tournament/teams`.
 *
 * Written only by the `rebuildTeams` function. It lives in a subcollection rather
 * than on the game document because it is rewritten on every response and the
 * game document is what the whole calendar subscribes to.
 */
export interface TournamentTeams {
	teams: TournamentTeam[];
	/** Ratings as they stood when this was built, for display and for replay. */
	elos: Record<string, number>;
	seed: number;
	/** The levers in force at build time, so an old lineup stays explicable. */
	settings: BalanceSettings;
	/** The `Game.teamsGeneration` this was built from. */
	generation: number;
	builtAt: string;
}

/**
 * One played match, at `seasons/{id}/games/{id}/matches/{order}`.
 *
 * The document id **is** the fixture's position in the running order, so there
 * is nothing to generate and two people scoring the same match cannot create
 * two documents for it.
 *
 * **No match document at all means "not played yet"** — the same third state
 * responses use, and for the same reason: an unplayed match and a 0–0 draw are
 * different things, and a placeholder would make the standings claim a night
 * had been played before anybody kicked off.
 *
 * `teamA` and `teamB` are stored rather than re-derived from the fixture list,
 * so a lineup rebuilt after a score was entered can never silently reinterpret
 * it as a different match.
 */
export interface TournamentMatch {
	order: number;
	teamA: number;
	teamB: number;
	scoreA: number;
	scoreB: number;
	/** Who last touched it. Shown on the scoreboard so corrections have a face. */
	updatedBy: string;
	updatedAt: string;
}

/** What one night did to one player's rating. */
export interface RatingDelta {
	uid: string;
	before: number;
	after: number;
	delta: number;
}

/**
 * A confirmed night, at `seasons/{id}/games/{id}/tournament/result`.
 *
 * Written only by the finalise functions. Holds the table and the rating
 * movement as they stood when confirmed, so the screen never has to recompute
 * a past night from ratings that have since moved on.
 */
export interface TournamentResult {
	standings: TeamStanding[];
	changes: RatingDelta[];
	finalisedAt: string;
	/** The admin who confirmed it, or `null` when the 24-hour sweep did. */
	finalisedBy: string | null;
}

/**
 * One night's rating movement, at `ratingLedger/{gameId}`.
 *
 * Top-level rather than under the season, because ratings are global and a
 * replay has to walk every rated game in kickoff order regardless of which
 * season it belonged to — there is nothing season-scoped to iterate.
 *
 * `before` holds the exact rating each player carried into the night, `null`
 * where they had none at all. That is what makes a rewind exact: restoring a
 * stored document beats recomputing what a rating "must have been".
 */
export interface RatingLedgerEntry {
	seasonId: string;
	gameId: string;
	kickoff: string;
	kickoffMillis: number;
	finalisedAt: string;
	before: Record<string, PlayerRating | null>;
	after: Record<string, PlayerRating>;
	/**
	 * Where each player's team finished, 0-indexed and sharing on a tie.
	 *
	 * Here as well as in the result document so a season table is one query
	 * against this collection rather than two reads per game across the whole
	 * calendar — and it is genuinely part of what the night did to a player,
	 * which is what this entry records.
	 */
	positions: Record<string, number>;
}

/** One row of the table. */
export interface TeamStanding {
	team: number;
	played: number;
	won: number;
	drawn: number;
	lost: number;
	goalsFor: number;
	goalsAgainst: number;
	goalDifference: number;
	points: number;
	/**
	 * 0-indexed finishing place. Teams that cannot be separated by any
	 * tie-break share a position, and `getActualWins` splits the rating between
	 * the places that tie covers rather than inventing a winner.
	 */
	position: number;
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
	newPlayers: true,
};
