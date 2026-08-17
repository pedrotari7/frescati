import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { chunksOf } from './lib/batch';
import { recountGame } from './lib/recount';
import { enqueueTeamRebuild } from './lib/teams';
import { instrument, reportError } from './lib/sentry';

const sameMembers = (before: string[] = [], after: string[] = []): boolean =>
	before.length === after.length && [...before].sort().join() === [...after].sort().join();

/** Everybody who joined or left. Nobody else's answers can have gone stale. */
const membershipDiff = (before: string[] = [], after: string[] = []): string[] => {
	const wasMember = new Set(before);
	const isMember = new Set(after);

	return [...new Set([...before.filter(uid => !isMember.has(uid)), ...after.filter(uid => !wasMember.has(uid))])];
};

/** Firestore takes at most 30 values in an `in` filter. */
const IN_LIMIT = 30;

/** How many games to repair at once. Enough to be quick, not enough to fan out. */
const REPAIR_CONCURRENCY = 10;

/**
 * Which games hold an answer from somebody whose membership just moved.
 *
 * Queried rather than derived from `counts`, which would be the cheaper test
 * and the wrong one: `counts` is the field being recomputed, so a game whose
 * counter had drifted to zero while answers existed would be skipped and never
 * repaired. Reading the responses asks the question directly.
 *
 * A collection-group query, so it comes back across every season and is filtered
 * to this one here. `responses.uid` is already indexed for exactly this shape —
 * it is what the app's own "my answers across every game" listener runs on.
 */
const gamesHoldingAnswersFrom = async (seasonId: string, uids: string[]): Promise<Set<string>> => {
	const affected = new Set<string>();

	for (const chunk of chunksOf(uids, IN_LIMIT)) {
		const snapshot = await db.collectionGroup('responses').where('uid', 'in', chunk).get();

		for (const doc of snapshot.docs) {
			// `.../games/{gameId}/responses/{uid}` — up to the game, then up
			// again to the season it belongs to.
			const gameRef = doc.ref.parent.parent;

			if (gameRef?.parent.parent?.id === seasonId) affected.add(gameRef.id);
		}
	}

	return affected;
};

/**
 * Repairs games when the squad changes under them.
 *
 * `role` is snapshotted onto each response when it is written, and nothing
 * revisits it. Drop someone from the squad mid-season and their existing "I'm
 * in" answers stay `role: 'member'`, so they keep counting towards `membersIn`
 * on every remaining game. Add someone and their earlier answers stay
 * `role: 'extra'`, leaving them below the line they now belong above. `counts`
 * is only recomputed when a response is written, so nothing corrects either
 * until that person happens to answer something.
 *
 * Only games that haven't kicked off yet are touched. A played game's roster is
 * a record of who actually turned up and rewriting it would be a lie, quite
 * apart from the cost of walking a whole season's history on every roster edit.
 *
 * And only games one of the moved players has actually answered. This used to
 * recount every future game unconditionally, which made the ordinary first-run
 * sequence — generate a calendar, then add the squad one tap at a time —
 * quadratic: twenty members against forty games was eight hundred transactions
 * and eight hundred queued rebuilds, to discover that nobody had answered
 * anything yet. The work now follows the diff rather than the calendar, so that
 * case costs one query and nothing else.
 */
export const onSeasonWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}', region: REGION, timeoutSeconds: 300 },
	instrument('onSeasonWrite', async event => {
		const before = event.data?.before.data() as Season | undefined;
		const after = event.data?.after.data() as Season | undefined;

		// A new season has no games yet, and a deleted one is handled by the
		// cascade. Neither needs a recount.
		if (!before || !after) return;

		// Renames, venue edits and admin changes don't move anybody's role.
		if (sameMembers(before.memberUids, after.memberUids)) return;

		const { seasonId } = event.params;
		const season = { ...after, id: seasonId };

		const moved = membershipDiff(before.memberUids, after.memberUids);
		const affected = await gamesHoldingAnswersFrom(seasonId, moved);

		if (affected.size === 0) {
			logger.info('Roster changed, but nobody who moved has answered anything', {
				seasonId,
				moved: moved.length,
			});
			return;
		}

		const gamesSnap = await db
			.collection(`seasons/${seasonId}/games`)
			.where('kickoff', '>=', new Date().toISOString())
			.get();

		const upcoming = gamesSnap.docs.filter(gameDoc => affected.has(gameDoc.id));

		let repaired = 0;

		const repair = async (gameDoc: (typeof upcoming)[number]): Promise<void> => {
			try {
				const result = await recountGame(gameDoc.ref, season, { repairRoles: true });
				repaired++;

				// A roster change moves who is a member and who is an extra, which
				// moves who is eligible for a team — so the lineups need re-picking
				// too, not just the counters.
				if (result) {
					await enqueueTeamRebuild({ seasonId, gameId: gameDoc.id, generation: result.teamsGeneration });
				}
			} catch (error) {
				// One wedged game must not strand the rest of the calendar with a
				// roster that no longer matches the squad.
				reportError('Could not repair a game after a roster change', { seasonId, gameId: gameDoc.id }, error);
			}
		};

		// Batched rather than one at a time: these are independent, and a long
		// calendar serialised two round trips deep is how a 60-second timeout
		// gets reached. Bounded rather than unbounded, so a busy season cannot
		// open a transaction per game at once.
		for (const batch of chunksOf(upcoming, REPAIR_CONCURRENCY)) {
			await Promise.all(batch.map(repair));
		}

		logger.info('Repaired games after a roster change', {
			seasonId,
			repaired,
			of: upcoming.length,
			moved: moved.length,
			members: after.memberUids.length,
		});
	})
);
