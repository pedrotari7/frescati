import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getMinPlayers, tallyResponses } from '../../shared/game';
import { db, REGION } from './lib/firebase';
import { getResponses, getSeason } from './lib/data';

/**
 * Keeps `counts` and `atRisk` on the game document in step with its responses.
 *
 * These live on the parent so the games list is a single query instead of one
 * subcollection read per row. Security rules make them function-only, so this
 * is the only thing that may write them.
 *
 * Recomputes from scratch rather than incrementing: a full re-tally of ~30
 * documents is cheap and can't drift, whereas a delta that gets applied twice
 * (retries happen) silently corrupts the count.
 */
export const onResponseWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/games/{gameId}/responses/{uid}', region: REGION },
	async event => {
		const { seasonId, gameId } = event.params;

		const [season, responses] = await Promise.all([getSeason(seasonId), getResponses(seasonId, gameId)]);

		if (!season) {
			logger.warn('Response written under a season that no longer exists', { seasonId, gameId });
			return;
		}

		const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);
		const gameSnap = await gameRef.get();

		// The game can be deleted while a response write is in flight.
		if (!gameSnap.exists) return;

		const counts = tallyResponses(responses);
		const minimum = getMinPlayers(gameSnap.data() as { minPlayers?: number }, season);

		await gameRef.update({
			counts,
			atRisk: counts.playing < minimum,
		});

		logger.debug('Recounted game', { seasonId, gameId, playing: counts.playing, minimum });
	}
);
