import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getGameLifecycle, getSilentMembers } from '../../shared/game';
import { formatGameWhen } from '../../shared/format';
import { REGION } from './lib/firebase';
import { getGame, getResponses, getSeason } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { sendGamePush } from './lib/push';
import { requireSeasonAdmin } from './lib/auth';
import { instrument } from './lib/sentry';

/**
 * What one nudge did.
 *
 * Totals across the group rather than a row per person, because that is what a
 * group send can honestly answer: everybody named gets the same sentence, so it
 * is one FCM call and one result. Aimed at a single name, which is what the
 * roster's button does, the totals *are* that person's outcome.
 */
export interface NudgeResult {
	/** How many were actually sent to, after the filter dropped anybody who had answered. */
	asked: number;
	/** Devices FCM accepted it for. */
	pushed: number;
	/** People it reached by email instead, having reached none of their devices. */
	emailed: number;
}

/**
 * Ask named people whether they are playing.
 *
 * The hourly sweep in `sendReminders` already asks this, at the fixed distances
 * from kickoff a season sets in `reminderHours`, of whoever has not answered.
 * What it cannot be is aimed. An admin looking at three names under "Yet to
 * answer" the day before a game that is two short had no way to ask those
 * three, and the next window might be a day off or already behind them.
 *
 * The second callable in the app that sends a notification somebody aimed by
 * hand rather than a trigger firing on an event, after `remindDebtors`, and
 * built to the same shape for the same reason: it could otherwise become a way
 * to buzz somebody for no reason.
 *
 * - The request says **who, never what**. Every word of the copy is built here
 *   from the game, through the same `sendGamePush(kind)` call the sweep makes,
 *   so nobody can push a sentence of their own at a player.
 * - Somebody who has **already answered is not sent to**. `getSilentMembers` is
 *   the same function the sweep filters through, so "only people who have not
 *   answered" holds by construction rather than by the caller having checked.
 *   It also makes a stale screen harmless: whoever answered a second ago is
 *   quietly dropped rather than chased for an answer they have given.
 * - An **extra is never nudged**, which falls out of that for free. They were
 *   never asked, so there is nothing to remind them of.
 * - Only a **season admin** can call it.
 * - The game has to be **open**. Past the deadline this asks a question the app
 *   will not accept an answer to, and a cancelled or finished game is not asking
 *   anybody anything.
 *
 * Deliberately **stamps nothing**, where `remindDebtors` records `remindedAt` on
 * the debtor mark so the next admin can see the chase happened. The equivalent
 * here has nowhere to live. Its natural home is the response document, and for
 * exactly these people there is no response document: that absence is the third
 * state the whole app rests on, and writing a placeholder to carry a timestamp
 * would break it for a footnote. The screen says what the send did while the
 * admin is still looking at it, and that is the whole of the record.
 */
export const nudgePlayers = onCall<{ seasonId: string; gameId: string; uids: string[] }>(
	{ region: REGION, secrets: EMAIL_SECRETS },
	instrument('nudgePlayers', async request => {
		const { seasonId, gameId, uids } = request.data ?? {};

		if (!seasonId || !gameId) throw new HttpsError('invalid-argument', 'A seasonId and a gameId are required.');
		if (!uids?.length) throw new HttpsError('invalid-argument', 'Say who to nudge.');

		const adminUid = await requireSeasonAdmin(request, seasonId, 'Only a season admin can nudge a player.');

		const season = await getSeason(seasonId);
		if (!season) throw new HttpsError('not-found', 'That season no longer exists.');

		const game = await getGame(seasonId, gameId);
		if (!game) throw new HttpsError('not-found', 'That game no longer exists.');

		// The same predicate the button is drawn off, checked again here rather
		// than trusted from there: the clock moves between a render and a press,
		// and this is the side that has to be right.
		if (getGameLifecycle(game, season) !== 'open') {
			throw new HttpsError('failed-precondition', 'Answers are closed for that game.');
		}

		const responses = await getResponses(seasonId, gameId);
		const silent = new Set(getSilentMembers(season, responses));
		const targets = uids.filter(uid => silent.has(uid));

		// Nobody named is still waiting to answer, so there is nothing to send.
		// The caller is told rather than handed a cheerful empty result: it means
		// the screen and the game disagree about who has answered.
		if (targets.length === 0) {
			throw new HttpsError('failed-precondition', 'They have answered already.');
		}

		// One send for the whole group, unlike a chase for money. That one names
		// the reader's own amount and so has to go out a payload at a time; this
		// names the game, so everybody gets the same sentence and FCM is called
		// once.
		const { pushed, emailed } = await sendGamePush(targets, 'reminder', {
			when: formatGameWhen(game.kickoff, season.slot.timezone),
			url: `/s/${seasonId}/g/${gameId}`,
			gameId,
			playing: game.counts?.playing ?? 0,
		});

		logger.info('Nudged for an answer', {
			admin: adminUid,
			seasonId,
			gameId,
			asked: targets.length,
			pushed,
			emailed,
		});

		return { asked: targets.length, pushed, emailed } satisfies NudgeResult;
	})
);
