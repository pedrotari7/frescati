import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { recountGame } from './lib/recount';

const sameMembers = (before: string[] = [], after: string[] = []): boolean =>
	before.length === after.length && [...before].sort().join() === [...after].sort().join();

/**
 * Repairs games when the squad changes under them.
 *
 * `role` is snapshotted onto each response when it is written, and until now
 * nothing ever revisited it. Drop someone from the squad mid-season and their
 * existing "I'm in" answers stayed `role: 'member'`, so they kept counting
 * towards `membersIn` on every remaining game. Add someone and their earlier
 * answers stayed `role: 'extra'`, leaving them below the line they now belong
 * above. `counts` is only recomputed when a response is written, so nothing
 * corrected either until that person happened to answer something.
 *
 * Only games that haven't kicked off yet are touched. A played game's roster is
 * a record of who actually turned up and rewriting it would be a lie, quite
 * apart from the cost of walking a whole season's history on every roster edit.
 */
export const onSeasonWrite = onDocumentWritten({ document: 'seasons/{seasonId}', region: REGION }, async event => {
	const before = event.data?.before.data() as Season | undefined;
	const after = event.data?.after.data() as Season | undefined;

	// A new season has no games yet, and a deleted one is handled by the
	// cascade. Neither needs a recount.
	if (!before || !after) return;

	// Renames, venue edits and admin changes don't move anybody's role.
	if (sameMembers(before.memberUids, after.memberUids)) return;

	const { seasonId } = event.params;
	const season = { ...after, id: seasonId };

	const gamesSnap = await db
		.collection(`seasons/${seasonId}/games`)
		.where('kickoff', '>=', new Date().toISOString())
		.get();

	let repaired = 0;

	for (const gameDoc of gamesSnap.docs) {
		try {
			await recountGame(gameDoc.ref, season, { repairRoles: true });
			repaired++;
		} catch (error) {
			// One wedged game must not strand the rest of the calendar with a
			// roster that no longer matches the squad.
			logger.error('Could not repair a game after a roster change', { seasonId, gameId: gameDoc.id, error });
		}
	}

	logger.info('Repaired games after a roster change', {
		seasonId,
		repaired,
		of: gamesSnap.size,
		members: after.memberUids.length,
	});
});
