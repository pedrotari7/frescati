import type { AvailabilityChange, Game, GameCounts, GameResponse, PlayerRole, Season } from './types';
import { addHours } from './datetime';
import { isMotmVotingOpen } from './motm';
import { describeSquads, getSquadSizes, getTeamCount } from './tournament';

/**
 * Where a game sits in its lifecycle. Orthogonal to headcount — a game can be
 * `open` and at risk at the same time.
 */
export type GameLifecycle = 'cancelled' | 'finished' | 'live' | 'locked' | 'open';

export type HeadcountState = 'at-risk' | 'ready';

export const getMinPlayers = (game: Pick<Game, 'minPlayers'>, season: Pick<Season, 'minPlayers'>): number =>
	game.minPlayers ?? season.minPlayers;

/** The instant after which responses stop being editable. */
export const getResponseDeadline = (
	game: Pick<Game, 'kickoff'>,
	season: Pick<Season, 'responseDeadlineHours'>
): string => addHours(game.kickoff, -season.responseDeadlineHours);

export const getGameLifecycle = (
	game: Pick<Game, 'kickoff' | 'endsAt' | 'status'>,
	season: Pick<Season, 'responseDeadlineHours'>,
	now: Date = new Date()
): GameLifecycle => {
	if (game.status === 'cancelled') return 'cancelled';

	const nowIso = now.toISOString();

	if (nowIso >= game.endsAt) return 'finished';
	if (nowIso >= game.kickoff) return 'live';
	if (nowIso >= getResponseDeadline(game, season)) return 'locked';

	return 'open';
};

/**
 * Whether an answer moving on this game is still worth telling anybody about.
 *
 * The bell and the trigger behind it read this same predicate, which is the
 * point of it existing rather than each checking a status they happened to
 * agree on. Two failures fall out of them disagreeing, and both are bad: a
 * button that is offered on a game where nothing would ever arrive, and — worse
 * — a button that has vanished while notifications keep coming, with no way
 * left to stop them.
 *
 * Deliberately wider than `open`. Past the deadline a season admin can still
 * move the roster, and that is exactly when somebody counting on a lift wants
 * to hear about it.
 */
export const isWatchable = (lifecycle: GameLifecycle): boolean => lifecycle !== 'cancelled' && lifecycle !== 'finished';

/** A season's games, split into the groups the home screen draws. */
export interface GameGroups<T> {
	/** The soonest game that hasn't ended, or `null` when there isn't one. */
	next: T | null;
	/** Every game after it, in kickoff order. */
	upcoming: T[];
	/** Played, but the man-of-the-match vote is still out. Most recent first. */
	voting: T[];
	/** Done with. Most recent first. */
	played: T[];
}

/**
 * Where each of a season's games belongs on that screen.
 *
 * `games` arrive in kickoff order and the two groups ahead of us keep it; the
 * two behind us are reversed, because looking back you want the last game
 * first.
 *
 * The group that isn't obvious is `voting`. A game with its man-of-the-match
 * vote open has finished — there is nothing left to answer and nobody to bring
 * a ball — but there is still a question out to the people who played it, and
 * `played` is a collapsed list, which is where a two-day vote goes to be
 * missed. So a game stays up until the count lands and moves itself the moment
 * `closeMotmVoting` deletes the window. What it does not do is take the top
 * card: `next` is still the game people opened the app for.
 *
 * A game nobody confirmed has no window either, so it is `played` from the
 * final whistle exactly as it was before — a vote that never opened is not
 * something to wait on.
 *
 * `next` is the soonest game that hasn't ended whether it is cancelled or not:
 * a cancellation is exactly the thing people open the app to find out.
 */
export const groupGames = <T extends Pick<Game, 'kickoff' | 'endsAt' | 'status' | 'motmVotingUntilMillis'>>(
	games: T[],
	season: Pick<Season, 'responseDeadlineHours'>,
	now: Date = new Date()
): GameGroups<T> => {
	const scheduled: T[] = [];
	const voting: T[] = [];
	const played: T[] = [];

	for (const game of games) {
		if (getGameLifecycle(game, season, now) !== 'finished') scheduled.push(game);
		else if (isMotmVotingOpen(game.motmVotingUntilMillis, now.getTime())) voting.push(game);
		else played.push(game);
	}

	const [next = null, ...upcoming] = scheduled;

	return { next, upcoming, voting: voting.reverse(), played: played.reverse() };
};

/**
 * The game being played right now that somebody said they'd be at, or `null`.
 *
 * `myResponses` is one person's answers keyed by game id — this asks about the
 * player holding them, never about the group.
 *
 * Deliberately `status === 'in'` rather than `isConfirmed`: an extra waiting on
 * an admin's nod doesn't hold a spot and isn't in the lineup, but they put their
 * hand up and are as likely as anyone to be stood at the touchline. Being sent
 * to the page that says whether they got on is the answer they came for.
 *
 * `find` rather than a filter because a weekly slot can't overlap itself, and
 * games arrive in kickoff order, so the earliest live one is the only one.
 */
export const findLiveGame = <T extends Pick<Game, 'id' | 'kickoff' | 'endsAt' | 'status'>>(
	games: T[],
	season: Pick<Season, 'responseDeadlineHours'>,
	myResponses: Record<string, Pick<GameResponse, 'status'>>,
	now: Date = new Date()
): T | null =>
	games.find(game => myResponses[game.id]?.status === 'in' && getGameLifecycle(game, season, now) === 'live') ?? null;

export const getHeadcountState = (
	game: Pick<Game, 'counts' | 'minPlayers'>,
	season: Pick<Season, 'minPlayers'>
): HeadcountState => (game.counts.playing < getMinPlayers(game, season) ? 'at-risk' : 'ready');

/** How many members haven't answered yet. Derived, so it can't go stale. */
export const getNoResponseCount = (counts: GameCounts, memberCount: number): number =>
	Math.max(0, memberCount - counts.membersIn - counts.membersOut);

/**
 * Season members who haven't answered a game at all — the people a reminder
 * is for. An extra with no response isn't in this list: they were never asked
 * in the first place, so there's nothing to nudge them about.
 */
export const getSilentMembers = (
	season: Pick<Season, 'memberUids'>,
	responses: Pick<GameResponse, 'uid'>[]
): string[] => {
	const answered = new Set(responses.map(response => response.uid));

	return season.memberUids.filter(uid => !answered.has(uid));
};

/**
 * The format the confirmed headcount supports, e.g. `5v5` for ten players or
 * `3 teams · 5 a side` for fifteen. `null` when there aren't enough bodies for
 * a game at all.
 *
 * Delegates to the tournament bands rather than halving the headcount: past
 * eleven players a game is no longer one match, and a badge reading `7v7` for
 * fourteen described a game nobody was going to play.
 */
export const getFormat = (playing: number): string | null => {
	const teamCount = getTeamCount(playing);

	return teamCount === 0 ? null : describeSquads(getSquadSizes(playing, teamCount));
};

export const getRole = (uid: string, season: Pick<Season, 'memberUids'>): PlayerRole =>
	season.memberUids.includes(uid) ? 'member' : 'extra';

/**
 * Whether a response holds a spot. Members always do. An extra holds one only
 * once a season admin has said so.
 *
 * Extras used to be confirmed by default, which meant anyone who could sign in
 * — and anyone with a Google account can — counted toward the headcount the
 * moment they tapped In. That let a stranger push a game over its minimum and
 * suppress the "short of players" nudge the squad relies on. Putting them
 * behind an admin nod costs one tap per genuine guest and closes it.
 */
export const isConfirmed = (response: Pick<GameResponse, 'role' | 'confirmOverride'>): boolean =>
	response.role === 'member' || response.confirmOverride === true;

/**
 * Whether somebody said they were coming and then didn't turn up.
 *
 * A mark beside the answer rather than a change to it, which is what makes this
 * a predicate of its own instead of a fourth `status`: the point is that both
 * facts read at once. `status` still says In, because that is what they said,
 * and this says the pitch disagreed — file it as `out` and a no-show becomes
 * indistinguishable from somebody who had the courtesy to say so, which is
 * exactly the distinction anybody asking wants.
 *
 * `status === 'in'` is part of the test rather than assumed, so a mark left
 * behind by somebody who was reported absent and later changed their answer
 * cannot make an `out` read as a no-show.
 */
export const isAbsent = (response: Pick<GameResponse, 'status' | 'absent'>): boolean =>
	response.status === 'in' && response.absent === true;

/**
 * Whether a no-show is something anybody could yet know about.
 *
 * From kick-off, and not a moment before. Up to then "they haven't turned up"
 * describes everybody, including the eight people parking — and an admin handed
 * the button on a Sunday would be reporting a prediction. Past the final whistle
 * it stays available, because this is usually remembered rather than recorded on
 * the spot.
 *
 * Deliberately wider than `live` and narrower than `isWatchable`: a cancelled
 * game has nobody to fail to turn up to.
 */
export const canReportAbsence = (lifecycle: GameLifecycle): boolean => lifecycle === 'live' || lifecycle === 'finished';

/** Everybody reported as a no-show for this game. */
export const getAbsentUids = (responses: Pick<GameResponse, 'uid' | 'status' | 'absent'>[]): string[] =>
	responses.filter(isAbsent).map(response => response.uid);

/**
 * Roster order: members first, then extras. Within each group, confirmed before
 * unconfirmed, then by signup time, then by uid so the order is total and stable
 * across clients.
 */
export const sortResponses = <T extends Pick<GameResponse, 'uid' | 'role' | 'confirmOverride' | 'respondedAt'>>(
	responses: T[]
): T[] =>
	[...responses].sort((a, b) => {
		if (a.role !== b.role) return a.role === 'member' ? -1 : 1;

		const [aConfirmed, bConfirmed] = [isConfirmed(a), isConfirmed(b)];
		if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1;

		if (a.respondedAt !== b.respondedAt) return a.respondedAt < b.respondedAt ? -1 : 1;

		return a.uid < b.uid ? -1 : 1;
	});

/**
 * What one write to a response document did to somebody's availability, or
 * `null` when it did nothing to it.
 *
 * `undefined` on either side is the absence of the document, which is the real
 * "no response" state rather than a gap — so signing up, changing your mind and
 * taking an answer back all read as a change, and each has something to say.
 *
 * Editing a note or a season admin confirming an extra do not. Both rewrite the
 * whole document — `setResponse` never merges — so a trigger comparing anything
 * coarser than `status` would tell a watcher somebody's answer had moved when it
 * had sat still, which is exactly the notification that gets muted.
 */
export const getAvailabilityChange = (
	before: Pick<GameResponse, 'status'> | undefined,
	after: Pick<GameResponse, 'status'> | undefined
): AvailabilityChange | null => {
	if (before?.status === after?.status) return null;

	return after ? after.status : 'withdrawn';
};

/**
 * Recompute a game's counters from its responses. Lives here so the Cloud
 * Function and any client-side preview can never drift apart.
 */
export const tallyResponses = (responses: Pick<GameResponse, 'status' | 'role' | 'confirmOverride'>[]): GameCounts => {
	const counts: GameCounts = {
		membersIn: 0,
		membersOut: 0,
		extrasIn: 0,
		extrasOut: 0,
		extrasConfirmed: 0,
		playing: 0,
	};

	for (const response of responses) {
		const isIn = response.status === 'in';

		if (response.role === 'member') {
			if (isIn) counts.membersIn++;
			else counts.membersOut++;
		} else {
			if (isIn) counts.extrasIn++;
			else counts.extrasOut++;
			if (isIn && isConfirmed(response)) counts.extrasConfirmed++;
		}
	}

	counts.playing = counts.membersIn + counts.extrasConfirmed;

	return counts;
};

/** One stored counter that disagrees with the responses underneath it. */
export interface CountsDrift {
	field: keyof GameCounts | 'atRisk';
	stored: number | boolean;
	actual: number | boolean;
}

/**
 * Where a game's function-owned counters disagree with its own responses.
 *
 * `counts` and `atRisk` are written **only** by `onResponseWrite`, which is a
 * background trigger — and a background trigger that exhausts its retries
 * leaves no trace anywhere. The game keeps whatever total it last managed to
 * write, and nothing in the app ever looks again: the screens render the stored
 * number, the reminder text quotes it, and the first symptom is ten people
 * turning up to a game that said nine, or an `atRisk` push that never fired for
 * a game which quietly fell below its minimum.
 *
 * So this re-derives the answer and returns the disagreements. Deliberately a
 * *comparison* and not a repair: `recountGames` already exists for the repair,
 * and a sweep that silently fixed this every night would erase the evidence
 * that the trigger is failing while leaving it failing.
 *
 * A game with no responses is not a special case. It is created with
 * `EMPTY_COUNTS` and `atRisk: true` — values the security rules pin exactly —
 * and an empty tally reproduces both, so an untouched game reports nothing.
 * The one configuration where it wouldn't is a season with `minPlayers: 0`,
 * where no game can ever be at risk and the creation default therefore is
 * wrong; that season has a real problem and hearing about it is correct.
 */
export const findCountsDrift = (
	game: { counts?: GameCounts; atRisk?: boolean },
	responses: Pick<GameResponse, 'status' | 'role' | 'confirmOverride'>[],
	minPlayers: number
): CountsDrift[] => {
	const actual = tallyResponses(responses);
	const drift: CountsDrift[] = [];

	// Keyed off the freshly computed tally rather than the stored map, so a
	// counter the document is missing entirely still gets compared instead of
	// being skipped for having no key to iterate.
	for (const field of Object.keys(actual) as (keyof GameCounts)[]) {
		const stored = game.counts?.[field] ?? 0;

		if (stored !== actual[field]) drift.push({ field, stored, actual: actual[field] });
	}

	const atRisk = actual.playing < minPlayers;
	const storedAtRisk = game.atRisk ?? false;

	if (storedAtRisk !== atRisk) drift.push({ field: 'atRisk', stored: storedAtRisk, actual: atRisk });

	return drift;
};

/**
 * Parse a reminder-window list as typed, e.g. `"72, 24"` into `[72, 24]`.
 *
 * Anything that isn't a positive number is dropped rather than rejected — this
 * is read from a free-text field, and a trailing comma shouldn't fail a save.
 * Sorted descending and de-duplicated so the stored value is canonical
 * regardless of what order somebody typed.
 */
export const parseReminderHours = (input: string): number[] =>
	[
		...new Set(
			input
				.split(',')
				.map(part => Number(part.trim()))
				.filter(hours => Number.isFinite(hours) && hours > 0)
		),
	].sort((a, b) => b - a);
