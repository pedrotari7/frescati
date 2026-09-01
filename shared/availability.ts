import type { Game, GameResponse } from './types';
import { counted } from './format';

/**
 * One player's season, read across rather than down.
 *
 * Everywhere else in the app a response is read one game at a time: who is
 * coming on Tuesday, who still hasn't said. This is the other axis, who turns up
 * and who doesn't over a whole season, which is what the squad list gets asked
 * and had no answer for.
 */

/**
 * What somebody said about one game.
 *
 * `unanswered` is the response document not being there, which is a real third
 * state rather than a default. Named here so a caller can put it in a table
 * beside the other two instead of remembering that `undefined` means something.
 */
export type Availability = 'in' | 'out' | 'unanswered';

export const AVAILABILITY_LABELS: Record<Availability, string> = {
	in: 'In',
	out: 'Out',
	unanswered: 'No answer',
};

/** One game, and what one player said about it. */
export interface AvailabilityMark {
	gameId: string;
	/** ISO 8601 UTC, so a mark can name its own game without a second lookup. */
	kickoff: string;
	availability: Availability;
}

/** gameId -> uid -> that player's answer to that game. */
export type SeasonResponses = Record<string, Record<string, GameResponse>>;

export interface AvailabilityTally {
	in: number;
	out: number;
	unanswered: number;
}

/**
 * The games a strip covers: everything in the season that is still meant to be
 * played, in the order they arrive, which is kickoff order everywhere it
 * matters.
 *
 * This drops the cancelled ones rather than giving them a fourth colour. Nobody
 * was ever asked about a cancelled game, so it is a column where In, Out and no
 * answer all mean the same thing, and the strip is read by scanning across it
 * for a shape.
 */
export const availabilityGames = <T extends Pick<Game, 'status'>>(games: T[]): T[] =>
	games.filter(game => game.status !== 'cancelled');

/**
 * One player's answers, game by game.
 *
 * Takes the whole season's responses rather than one player's, because the
 * caller is drawing a row per member off a single read and this is the join.
 */
export const buildAvailability = (
	uid: string,
	games: Pick<Game, 'id' | 'kickoff' | 'status'>[],
	responses: SeasonResponses
): AvailabilityMark[] =>
	availabilityGames(games).map(game => ({
		gameId: game.id,
		kickoff: game.kickoff,
		availability: responses[game.id]?.[uid]?.status ?? 'unanswered',
	}));

export const tallyAvailability = (marks: Pick<AvailabilityMark, 'availability'>[]): AvailabilityTally => {
	const tally: AvailabilityTally = { in: 0, out: 0, unanswered: 0 };

	for (const mark of marks) tally[mark.availability]++;

	return tally;
};

/**
 * The strip as a sentence, for anybody who isn't looking at the colours.
 *
 * A row of dots says nothing to a screen reader, and thirty labelled dots say
 * far too much, so the strip carries this instead and the dots carry nothing.
 */
export const describeAvailability = (tally: AvailabilityTally): string =>
	`In for ${counted(tally.in, 'game')}, out for ${tally.out}, no answer for ${tally.unanswered}`;
