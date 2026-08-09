import type { Game, GameCounts, GameResponse, PlayerRole, Season } from './types';
import { addHours } from './datetime';
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
 * eleven players a night is no longer one match, and a badge reading `7v7` for
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
