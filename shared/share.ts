/**
 * The line somebody posts in the group chat to get a game filled.
 *
 * It exists because the app is signed-in only and deliberately has no public
 * page for a game. The people who could rescue a game that is two short are
 * often the ones who haven't opened Frescati this week, and the only place they
 * are reliably reachable is the chat the group already uses. So the app's job
 * here is to write the message rather than to be the place it is read.
 *
 * Composed in `shared/` rather than in the component for the reason the push
 * copy is: this says the same things a notification says, about the same game,
 * and the two reading differently is the kind of drift nobody notices until
 * somebody puts them side by side.
 */

import { formatGameDate, formatGameTime } from './format';
import { getFormat, getHeadcountState, getMinPlayers } from './game';
import type { GameLifecycle } from './game';
import type { Game, Season } from './types';

/** Exactly what `navigator.share` takes, because that is its one consumer. */
export interface GameShare {
	title: string;
	text: string;
	url: string;
}

type ShareGame = Pick<Game, 'id' | 'kickoff' | 'venue' | 'status' | 'counts' | 'minPlayers' | 'cancelledReason'>;
type ShareSeason = Pick<Season, 'id' | 'minPlayers'> & { slot: Pick<Season['slot'], 'timezone'> };

/**
 * Whether there is any point sharing this game.
 *
 * Everything but a game that has been played, which is wider than `isWatchable`
 * and differs from it on the one case that matters: a cancelled game is the
 * single most useful thing on this screen to pass on, and the bell hides itself
 * there precisely because there is nothing left to announce. Here there is.
 *
 * A finished game is left out because every number in the message below is
 * written as a forecast. "12 playing" about last Tuesday invites somebody to
 * turn up to a pitch that is now empty.
 */
export const isShareable = (lifecycle: GameLifecycle): boolean => lifecycle !== 'finished';

/**
 * `Tue 1 Sep, 19:00 at Frescati IP`. The half of the message that is true
 * whatever state the game is in, and the half somebody actually needs in order
 * to turn up.
 */
const when = (game: ShareGame, timezone: string): string =>
	`${formatGameDate(game.kickoff, timezone)}, ${formatGameTime(game.kickoff, timezone)} at ${game.venue.name}`;

/**
 * What the headcount is doing, in the voice the `atRisk` push uses.
 *
 * The short case ends in a question because that is the whole reason anybody
 * taps share: the message is an ask, not a status line. The ready case does
 * not, because there is nothing being asked for and a game that is on reads
 * as an invitation without one.
 */
const headcount = (game: ShareGame, season: ShareSeason): string => {
	const { playing } = game.counts;

	if (getHeadcountState(game, season) === 'at-risk') {
		const short = getMinPlayers(game, season) - playing;

		return `${playing} playing, ${short} short. Can you make it?`;
	}

	const format = getFormat(playing);

	return format ? `${playing} playing, ${format}.` : `${playing} playing.`;
};

/**
 * The message, ready to hand to `navigator.share`.
 *
 * `url` is kept out of `text` because every share target handles the pair
 * itself, and the ones that append the link to the text would otherwise post it
 * twice. Anything pasting this by hand has to join them; `shareToText` below is
 * that join, in one place, so the clipboard fallback can't drift from this.
 */
export const buildGameShare = (game: ShareGame, season: ShareSeason, { appUrl }: { appUrl: string }): GameShare => {
	const timezone = season.slot.timezone;
	const where = when(game, timezone);

	const text =
		game.status === 'cancelled'
			? `${where} is off${game.cancelledReason ? `: ${game.cancelledReason}` : '.'}`
			: `${where}. ${headcount(game, season)}`;

	return {
		// Dropped by most share targets and shown by a few, so it says what this
		// is rather than repeating the line below it, which is what a target
		// showing both would read as a stutter.
		title: 'Frescati',
		text,
		url: `${appUrl.replace(/\/+$/, '')}/s/${season.id}/g/${game.id}`,
	};
};

/**
 * The same message as one block of text, for pasting.
 *
 * Two lines rather than a sentence with a link welded to the end: every chat
 * app makes the last line a preview card, and a URL buried mid-paragraph is the
 * one that doesn't get tapped.
 */
export const shareToText = ({ text, url }: Pick<GameShare, 'text' | 'url'>): string => `${text}\n${url}`;
