import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { db, REGION } from './lib/firebase';

/**
 * Deletes what Firestore leaves behind.
 *
 * Deleting a document does nothing to its subcollections — they stay, reachable
 * by path and by collection-group query, with no parent and no way to reach
 * them through the app. Deleting one game left every answer to it sitting
 * there, still turning up in the collection-group listener that powers "my
 * answers across every game"; deleting a season orphaned its whole calendar the
 * same way.
 *
 * `recursiveDelete` walks the tree in batches server-side, so this doesn't have
 * to page through anything by hand.
 */

export const onGameDeleted = onDocumentDeleted(
	{ document: 'seasons/{seasonId}/games/{gameId}', region: REGION },
	async event => {
		const { seasonId, gameId } = event.params;

		await db.recursiveDelete(db.doc(`seasons/${seasonId}/games/${gameId}`));

		logger.info('Cleaned up after a deleted game', { seasonId, gameId });
	}
);

/**
 * Fires once for the season and lets the cascade take the games with it. Each
 * deleted game then trips `onGameDeleted` against an already-empty responses
 * collection, which costs an invocation and does nothing — cheap enough at this
 * scale to be worth less than the code to suppress it.
 */
export const onSeasonDeleted = onDocumentDeleted({ document: 'seasons/{seasonId}', region: REGION }, async event => {
	const { seasonId } = event.params;

	await db.recursiveDelete(db.doc(`seasons/${seasonId}`));

	logger.info('Cleaned up after a deleted season', { seasonId });
});
