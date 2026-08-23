import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { AvailabilityChange, GameResponse, Season } from '../../shared/types';
import { getAvailabilityChange, getGameLifecycle, isWatchable } from '../../shared/game';
import { formatGameWhen } from '../../shared/format';
import { db, REGION } from './lib/firebase';
import { getDisplayName, getGame, getSeason, getWatcherUids } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { sendGamePush } from './lib/push';
import { recountGame } from './lib/recount';
import { enqueueTeamRebuild } from './lib/teams';
import { instrument } from './lib/sentry';

/**
 * Tells anyone following this game that somebody's answer has moved.
 *
 * The only notification in the app nobody is signed up for by default, and the
 * only one that can fire several times an evening. Those two go together: it is
 * allowed to be this chatty precisely because the audience is people who asked
 * for exactly this, one game at a time, and who can stop it with the same tap
 * that started it.
 *
 * Sharing the `game-{id}` tag with every other notification about this game is
 * what keeps a run of late changes from stacking up. The lock screen shows the
 * latest state, which is the only one worth reading.
 *
 * Whoever just answered is never told about their own answer.
 */
const notifyWatchers = async ({
	seasonId,
	gameId,
	actor,
	season,
	change,
	playing,
}: {
	seasonId: string;
	gameId: string;
	actor: string;
	season: Season;
	change: AvailabilityChange;
	playing: number;
}): Promise<void> => {
	const watchers = (await getWatcherUids(seasonId, gameId)).filter(uid => uid !== actor);

	// The overwhelmingly common case, and the reason the two reads below sit
	// behind it rather than beside it: nobody is following most games, and this
	// runs on every single response write in the app.
	if (watchers.length === 0) return;

	const [game, who] = await Promise.all([getGame(seasonId, gameId), getDisplayName(actor)]);

	// The same predicate the bell is drawn from, so this can never be the half
	// that keeps sending after the button offering to stop it has gone. A game
	// that was called off already told everyone who answered, and one that has
	// been played is history. Tidying the roster on either is housekeeping.
	if (!game || !isWatchable(getGameLifecycle(game, season))) return;

	const sent = await sendGamePush(watchers, 'availability', {
		when: formatGameWhen(game.kickoff, season.slot.timezone),
		url: `/s/${seasonId}/g/${gameId}`,
		gameId,
		who,
		availability: change,
		playing,
	});

	logger.info('Notified watchers of an availability change', { seasonId, gameId, change, ...sent });
};

/**
 * Keeps `counts` and `atRisk` on the game document in step with its responses.
 *
 * These live on the parent so the games list is a single query instead of one
 * subcollection read per row. Security rules make them function-only, so this
 * is the only thing that may write them.
 *
 * Recomputes from scratch rather than incrementing: a full re-tally of ~30
 * documents is cheap, whereas a delta applied twice, retries happen, silently
 * corrupts the count.
 *
 * The re-tally runs inside a transaction because recomputing is not on its own
 * enough. Two people tapping "I'm in" at the same moment produce two
 * invocations that both read the responses and both write `counts`; whichever
 * lands second wins, and if it read first it writes a total that is already one
 * short. The count then stays wrong until somebody else happens to respond. A
 * transaction puts the read and the write in the same optimistic unit, so the
 * loser retries against fresh data instead of overwriting the winner.
 *
 * It is also the only thing in the app that sees an answer *move* rather than
 * just what it now is, which is what a watcher subscribed to. Hence the
 * notification below, and hence `EMAIL_SECRETS`, without which its fallback
 * would silently mail nobody.
 */
export const onResponseWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/games/{gameId}/responses/{uid}', region: REGION, secrets: EMAIL_SECRETS },
	instrument('onResponseWrite', async event => {
		const { seasonId, gameId, uid } = event.params;
		const change = getAvailabilityChange(
			event.data?.before.data() as GameResponse | undefined,
			event.data?.after.data() as GameResponse | undefined
		);

		// Read outside the transaction: the season isn't part of the contended
		// state, and enrolling it would make every roster edit abort a recount.
		const season = await getSeason(seasonId);

		if (!season) {
			logger.warn('Response written under a season that no longer exists', { seasonId, gameId });
			return;
		}

		const result = await recountGame(db.doc(`seasons/${seasonId}/games/${gameId}`), season);

		if (!result) return;

		logger.debug('Recounted game', { seasonId, gameId, playing: result.counts.playing });

		// Queued rather than done here: whoever just answered is waiting on the
		// headcount, not on the team sheet, and the optimiser is the one part of
		// this that gets slower the better the turnout.
		await enqueueTeamRebuild({ seasonId, gameId, generation: result.teamsGeneration });

		// After the recount, so the headcount in the message is the one the game
		// document now carries rather than the one it is about to stop carrying.
		if (change) {
			await notifyWatchers({
				seasonId,
				gameId,
				actor: uid,
				season,
				change,
				playing: result.counts.playing,
			});
		}
	})
);
