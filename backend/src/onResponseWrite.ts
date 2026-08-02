import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db, REGION } from './lib/firebase';
import { getSeason } from './lib/data';
import { recountGame } from './lib/recount';

/**
 * Keeps `counts` and `atRisk` on the game document in step with its responses.
 *
 * These live on the parent so the games list is a single query instead of one
 * subcollection read per row. Security rules make them function-only, so this
 * is the only thing that may write them.
 *
 * Recomputes from scratch rather than incrementing: a full re-tally of ~30
 * documents is cheap, whereas a delta applied twice — retries happen — silently
 * corrupts the count.
 *
 * The re-tally runs inside a transaction because recomputing is not on its own
 * enough. Two people tapping "I'm in" at the same moment produce two
 * invocations that both read the responses and both write `counts`; whichever
 * lands second wins, and if it read first it writes a total that is already one
 * short. The count then stays wrong until somebody else happens to respond. A
 * transaction puts the read and the write in the same optimistic unit, so the
 * loser retries against fresh data instead of overwriting the winner.
 */
export const onResponseWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/games/{gameId}/responses/{uid}', region: REGION },
	async event => {
		const { seasonId, gameId } = event.params;

		// Read outside the transaction: the season isn't part of the contended
		// state, and enrolling it would make every roster edit abort a recount.
		const season = await getSeason(seasonId);

		if (!season) {
			logger.warn('Response written under a season that no longer exists', { seasonId, gameId });
			return;
		}

		const counts = await recountGame(db.doc(`seasons/${seasonId}/games/${gameId}`), season);

		if (counts) logger.debug('Recounted game', { seasonId, gameId, playing: counts.playing });
	}
);
