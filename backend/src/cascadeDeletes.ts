import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Game } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { requestRatingReplay } from './lib/finalise';

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
	// Long enough to finish a replay of the ladder, and — like every function
	// that takes the lock — comfortably inside the lease, so a run that is
	// killed at its timeout has already stopped writing before its lease frees.
	{ document: 'seasons/{seasonId}/games/{gameId}', region: REGION, timeoutSeconds: 300 },
	async event => {
		const { seasonId, gameId } = event.params;
		const game = event.data?.data() as Game | undefined;

		await db.recursiveDelete(db.doc(`seasons/${seasonId}/games/${gameId}`));

		logger.info('Cleaned up after a deleted game', { seasonId, gameId });

		// A confirmed game also left a mark outside that subtree. Its ledger
		// entry is top-level, deliberately — ratings are global and a replay has
		// to walk every rated game regardless of season — so `recursiveDelete`
		// never touches it. Deleting the game alone left every player carrying
		// Elo from a game that no longer exists, and left the entry counting
		// towards its season's table forever.
		//
		// Replayed rather than subtracted, for the same reason a correction is:
		// every game rated after this one was rated against the ratings this
		// one produced, so there is no arithmetic that undoes it in place. The
		// replay rewinds past it and rebuilds forward, finds this game gone, and
		// retires the entry as it passes.
		//
		// A game that was never confirmed has no entry and moved nobody, so
		// there is nothing to unwind.
		if (!game?.resultFinalisedAt) return;

		await requestRatingReplay(game.kickoffMillis ?? Date.parse(game.kickoff));
	}
);

/**
 * Fires once for the season and lets the cascade take the games with it. Each
 * deleted game then trips `onGameDeleted` against an already-empty responses
 * collection — and, for a game that had been confirmed, asks for a replay of
 * the ladder from that game forward.
 *
 * A season of confirmed games therefore asks for as many replays as it has
 * games, all at once, which is only survivable because those requests collapse:
 * the first to take the ladder lock drains a floor the rest have lowered to the
 * earliest kickoff among them, so the whole season unwinds in one pass. Keeping
 * one path for "a rated game went away" beats a second, season-shaped one that
 * could disagree with it.
 */
export const onSeasonDeleted = onDocumentDeleted({ document: 'seasons/{seasonId}', region: REGION }, async event => {
	const { seasonId } = event.params;

	await db.recursiveDelete(db.doc(`seasons/${seasonId}`));

	logger.info('Cleaned up after a deleted season', { seasonId });
});
