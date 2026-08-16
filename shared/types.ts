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

/**
 * `played` is set by the finalise functions once a game has been rated, and is
 * read by exactly one thing: the hourly sweep that looks for games still owed
 * a rating. It is a marker that the game is *done with*, not a description of
 * whether it happened — `getGameLifecycle` answers that from `endsAt`, so a
 * game reads as finished on the screen whether or not anybody scored it.
 *
 * Which is why a replay that finds every score cleared puts the status back to
 * `scheduled`: the game is owed a rating again.
 */
export type GameStatus = 'scheduled' | 'cancelled' | 'played';
export type ResponseStatus = 'in' | 'out';
export type PlayerRole = 'member' | 'extra';

/**
 * What one write did to somebody's availability for a game.
 *
 * `withdrawn` is the response document going away — the third state spelled
 * out, because "no answer" is something a watcher wants told about in the same
 * breath as the other two, and `undefined` is not something copy can be written
 * against.
 */
export type AvailabilityChange = ResponseStatus | 'withdrawn';

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
	/**
	 * The one-tap vote that opens when a game is confirmed.
	 *
	 * A switch of its own rather than borrowing `reminders`, which covers the
	 * nudge to say whether you're playing: somebody who has muted being chased
	 * for an answer has said nothing about whether they want to be asked who was
	 * best on the pitch. It needs *a* switch because the audience is everybody
	 * who played, which nobody signed up for — the same test `availability`
	 * fails, and why that one has none.
	 */
	motm: boolean;
	/**
	 * Whether to fall back to email when a push can't be delivered.
	 *
	 * Not a kind, unlike the three above — it picks the *channel* for kinds
	 * already switched on. Nothing is ever sent by email that wouldn't have been
	 * sent as a push, so turning `reminders` off silences the reminder on both.
	 *
	 * On by default, and worth having a switch for at all because the people it
	 * exists for are exactly the people who never turned push on: without this,
	 * the only way to stop hearing from Frescati would be to switch off all three
	 * kinds individually.
	 */
	emailFallback: boolean;
}

/**
 * The publicly readable half of a person. Every signed-in user can read these,
 * because rosters and the member picker render names and avatars for uids they
 * only ever see as strings.
 *
 * Deliberately holds no contact details. Email lives in Firebase Auth, which is
 * not readable from the client at all — see `frontend/lib/auth.tsx`. The email
 * fallback reads it there with the Admin SDK rather than mirroring it here; a
 * copy on this document would be a group-wide address book.
 */
export interface AppUser {
	uid: string;
	displayName: string;
	photoURL: string | null;
	createdAt: string;
	/**
	 * The last time they opened the app and could actually see it.
	 *
	 * Moved on arrival only — a foreground load, and every return from the
	 * background afterwards — never on a timer, so a suspended installed app or
	 * a tab left open behind forty others cannot keep somebody looking active
	 * long after they stopped turning up. `shared/visit.ts` holds the rule.
	 */
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
	 * Absent until they've played a rated game, or an app admin set them a
	 * starting point. A player with neither is seeded from the group average at
	 * selection time rather than carrying a stored placeholder — same reasoning
	 * as a missing response document.
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
 * Written only by the rating functions and by `setStartingRating`; security
 * rules freeze it against client writes the same way `isAppAdmin` is frozen.
 */
export interface PlayerRating {
	elo: number;
	/**
	 * Rated games played. Drives the provisional K-factor — and, at zero, marks
	 * this as a starting point an admin set rather than a rating anybody
	 * earned. See `hasPlayed` in `rating.ts`.
	 */
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
	/** Minutes per match, used to size the game against the season's slot. */
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

/**
 * What a piece of kit is, as far as "can we actually play?" is concerned.
 *
 * A small closed set rather than a free-text label, because the whole point of
 * a kind is that it *groups*: a game needs **a** ball, not every ball, so two
 * items have to be interchangeable before either can count as cover. A typed
 * label would never group — "Ball", "ball" and "Match ball" are three kinds.
 *
 * `other` is the escape hatch for things worth keeping track of but never worth
 * warning about — a pump, the gate key, the first-aid bag. It is deliberately
 * outside `REQUIRED_KIT_KINDS`: a register that cried wolf about the pump is one
 * people stop reading in the week it matters.
 */
export type KitKind = 'ball' | 'vests' | 'other';

/**
 * Something the group owns and somebody has to remember to bring, at
 * `seasons/{seasonId}/kit/{itemId}`.
 *
 * A register rather than an inventory: the only question it answers is *who has
 * it*, which is why `holderUid` is required and there is no "in the cupboard"
 * state. Kit in a cupboard is still somebody's to fetch, and an item nobody
 * holds is precisely the situation the register exists to prevent — making it a
 * state you could save would legitimise it, and would give every screen a
 * second empty case to render for nothing.
 *
 * The holder is always on `season.memberUids`, checked by the security rules on
 * every handover. Extras come and go by definition; the squad is the list of
 * people who will still be around next week to hand it on.
 *
 * There is no id field on the document — `id` here is the document id, the way
 * a response's is the uid. Nothing needs to query kit by anything but its
 * season.
 */
export interface KitItem {
	id: string;
	/** What it gets called out loud — "Match ball", "Blue vests". */
	name: string;
	kind: KitKind;
	/** Who has it right now. Always somebody on the season's roster. */
	holderUid: string;
	/**
	 * Who recorded the handover. Signed for the same reason a scoreline is:
	 * anybody in the squad can move an item, so a wrong one needs a face on it.
	 */
	updatedBy: string;
	updatedAt: string;
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
	 * When the game's results were confirmed and the ratings applied. Set, the
	 * scoreboard is closed to everyone but a season admin — whose correction
	 * replays every rated game from here forward.
	 *
	 * Written only by the functions; client writes are rejected.
	 */
	resultFinalisedAt?: string;
	/**
	 * When the man-of-the-match vote closes, as epoch milliseconds. Set by the
	 * confirmation that opened it; **deleted** by the sweep that counts the
	 * votes, which is what takes the game out of that sweep's query for good.
	 *
	 * Milliseconds, and no ISO twin, for the reason `kickoffMillis` has one: a
	 * security rule cannot parse an instant, and the deadline is what the rule
	 * enforces. Nothing sorts on it, so the string half would be dead weight.
	 *
	 * Absent means the vote is shut — a game not yet confirmed and a game
	 * already decided are both closed, and the decision document says which.
	 *
	 * Written only by the functions; client writes are rejected.
	 */
	motmVotingUntilMillis?: number;
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
 * Somebody following one game, at `seasons/{id}/games/{id}/watchers/{uid}`.
 *
 * The document id is the uid and its **presence** is the whole subscription —
 * the same third state responses and match scores use. Nothing writes a
 * `watching: false`; unfollowing deletes the document.
 *
 * Private to its owner the way a push token is, and for a softer version of the
 * same reason: no screen needs to know who is quietly keeping an eye on a game,
 * so nothing is gained by letting the group read it.
 */
export interface GameWatcher {
	uid: string;
	createdAt: string;
}

/**
 * One player's vote for man of the match, at
 * `seasons/{id}/games/{id}/motmVotes/{uid}`.
 *
 * The document id is the voter, so nobody holds two votes for one game and
 * changing your mind overwrites rather than stuffs the ballot. Absence is "has
 * not voted" — the same third state a response uses — and withdrawing a vote
 * deletes the document.
 *
 * **Private to its owner**, like a watcher and for a firmer version of the same
 * reason: a running count visible while the vote is open turns an early lead
 * into a bandwagon. Nobody but the voter can read one until the sweep counts
 * them and publishes the totals on `TournamentMotm`.
 *
 * Voting for yourself is allowed. The group can be trusted to have an opinion
 * about that, and a rule against it is one more thing that can go wrong for a
 * player who genuinely was the best one out there.
 */
export interface MotmVote {
	uid: string;
	/** Who they picked. Always somebody in this game's lineup. */
	votedFor: string;
	votedAt: string;
}

/**
 * Who has voted so far, at `seasons/{id}/games/{id}/tournament/motmVoters`.
 *
 * Turnout, and deliberately nothing more: it says Anders has answered, never
 * who he answered with. That is what makes it publishable while the vote is
 * still running — the reason the votes themselves are sealed is that a visible
 * lead is a lead people fall in behind, and a list of names with no picks
 * attached offers nothing to fall in behind.
 *
 * Function-owned, like `counts` on the game and for the same reason: a client
 * cannot read anybody else's vote, so it cannot work this out for itself. The
 * absence of the document means nobody has voted yet, and `closeMotmVote`
 * deletes it as it publishes the totals — after which the turnout is the sum of
 * `TournamentMotm.counts` and this would be a second copy to keep in step.
 */
export interface TournamentMotmVoters {
	/** Every voter, by uid, sorted. Never who any of them picked. */
	uids: string[];
	updatedAt: string;
}

/**
 * The counted vote, at `seasons/{id}/games/{id}/tournament/motm`.
 *
 * Written only by the sweep that closes the vote, and its **existence** is what
 * says the counting has happened — which is why one is written even when nobody
 * voted, with no winners in it. "Nobody voted" is a decision; "not counted yet"
 * is not, and the two would otherwise look identical.
 *
 * Stored rather than re-tallied on demand because the ratings hang off it: a
 * replay reads this back exactly as a rewind reads `before` back, so the ladder
 * cannot quietly settle on a different answer than the one the app announced.
 */
export interface TournamentMotm {
	/** Everybody level on the most votes; empty when nobody voted. */
	winners: string[];
	/** Every player who got a vote, most first. Sums to the turnout. */
	counts: { uid: string; votes: number }[];
	decidedAt: string;
}

/**
 * One squad for one game. `uids` is the whole squad; how many of them are on
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
 * different things, and a placeholder would make the standings claim a game
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

/** What one game did to one player's rating. */
export interface RatingDelta {
	uid: string;
	before: number;
	after: number;
	delta: number;
}

/**
 * A confirmed game, at `seasons/{id}/games/{id}/tournament/result`.
 *
 * Written only by the finalise functions. Holds the table and the rating
 * movement as they stood when confirmed, so the screen never has to recompute
 * a past game from ratings that have since moved on.
 */
export interface TournamentResult {
	standings: TeamStanding[];
	changes: RatingDelta[];
	finalisedAt: string;
	/** The admin who confirmed it, or `null` when the 24-hour sweep did. */
	finalisedBy: string | null;
}

/**
 * One game's rating movement, at `ratingLedger/{gameId}`.
 *
 * Top-level rather than under the season, because ratings are global and a
 * replay has to walk every rated game in kickoff order regardless of which
 * season it belonged to — there is nothing season-scoped to iterate.
 *
 * `before` holds the exact rating each player carried into the game, `null`
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
	 * calendar — and it is genuinely part of what the game did to a player,
	 * which is what this entry records.
	 */
	positions: Record<string, number>;
	/**
	 * Who the group voted man of the match, if the vote had closed by the time
	 * this entry was written. Shared on a tie, like `positions`.
	 *
	 * Recorded here for the same reason positions are — it is part of what the
	 * game did to these players, and a career screen reads this collection and
	 * nothing else. The ratings do not come from it: they come from the decision
	 * document, which a replay re-reads. Absent on every entry written before a
	 * vote existed, and on any game confirmed while its vote was still open.
	 */
	motm?: string[];
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
	motm: true,
	emailFallback: true,
};
