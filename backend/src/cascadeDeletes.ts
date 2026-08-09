import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Game } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { replayRatingsFrom } from './lib/finalise';

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
		const game = event.data?.data() as Game | undefined;

		await db.recursiveDelete(db.doc(`seasons/${seasonId}/games/${gameId}`));

		logger.info('Cleaned up after a deleted game', { seasonId, gameId });

		// A confirmed night also left a mark outside that subtree. Its ledger
		// entry is top-level, deliberately — ratings are global and a replay has
		// to walk every rated game regardless of season — so `recursiveDelete`
		// never touches it. Deleting the game alone left every player carrying
		// Elo from a night that no longer exists, and left the entry counting
		// towards its season's table forever.
		//
		// Replayed rather than subtracted, for the same reason a correction is:
		// every night rated after this one was rated against the ratings this
		// one produced, so there is no arithmetic that undoes it in place. The
		// replay rewinds past it and rebuilds forward, finds this game gone, and
		// retires the entry as it passes.
		//
		// A night that was never confirmed has no entry and moved nobody, so
		// there is nothing to unwind.
		if (!game?.resultFinalisedAt) return;

		await replayRatingsFrom(game.kickoffMillis ?? Date.parse(game.kickoff));
	}
);

/**
 * Fires once for the season and lets the cascade take the games with it. Each
 * deleted game then trips `onGameDeleted` against an already-empty responses
 * collection — and, for a night that had been confirmed, a replay of the ladder
 * from that night forward. So a season unwinds one game at a time rather than
 * in a single pass: more invocations than strictly necessary, but it keeps one
 * path for "a rated game went away" instead of two that could disagree.
 */
export const onSeasonDeleted = onDocumentDeleted({ document: 'seasons/{seasonId}', region: REGION }, async event => {
	const { seasonId } = event.params;

	await db.recursiveDelete(db.doc(`seasons/${seasonId}`));

	logger.info('Cleaned up after a deleted season', { seasonId });
});
