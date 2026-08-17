import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import type { AppUser, GameResponse } from '../../shared/types';
import { createStartingRating, fromDisplayRating, hasPlayed } from '../../shared/rating';
import { db, REGION } from './lib/firebase';
import { requireAppAdmin } from './lib/auth';
import { chunksOf } from './lib/batch';
import { invalidateTeams } from './lib/teams';
import { instrument } from './lib/sentry';

/**
 * Giving somebody a starting rating, before the ladder has had its say.
 *
 * The group is not a room of identical strangers. A newcomer who has played for
 * twenty years and one who has never played land on the same seed — the season
 * average — and the balancer spends their first few games discovering, at the
 * expense of whoever was put on their team, something an admin knew on day one.
 * This is how that knowledge gets in.
 *
 * **Only before their first rated game.** A rating that has been earned is not
 * an admin's to overwrite, and the reason is mechanical rather than a matter of
 * taste: every ledger entry records the rating each player carried *into* that
 * game, and a replay restores those on the way past. Overwriting a played
 * rating would leave every one of those entries describing a state that never
 * existed, and the first correction anybody made to any game since would
 * silently undo the edit. `games === 0` is exactly the condition under which no
 * ledger entry mentions this player at all, so nothing here can be unwound by a
 * replay it never appears in.
 *
 * A callable rather than a rule loosened for admins, for the same reason
 * `setAppAdmin` is one: `rating` is function-owned, and the freeze in
 * `firestore.rules` is what stops a player writing their own. Handing admins a
 * client-side write to the field would mean the rule can no longer say "never",
 * and "never, unless the claim says otherwise" is a much weaker thing to have
 * guarding the ladder.
 */

/** The displayed scale. Elo either side of it is reachable, but only by playing. */
const MIN_DISPLAY = 0;
const MAX_DISPLAY = 100;

/** Firestore takes at most 30 refs per `getAll`, and it throws when handed none. */
const READ_CHUNK = 30;

/** How many lineups to invalidate at once. Enough to be quick, not enough to fan out. */
const REPICK_CONCURRENCY = 10;

/**
 * The games whose lineup this player's rating could still change: ones they
 * have said In to, that haven't kicked off, and that nobody has confirmed.
 *
 * Found through a collection-group query on their responses rather than by
 * walking every season's calendar — `responses.uid` is already indexed for it,
 * being what the app's own "my answers everywhere" listener runs on.
 *
 * Deliberately not every game with an unrated player in it. Changing a member's
 * rating also moves the season's seed average, and therefore what every *other*
 * unrated player in that season is worth to the optimizer — but chasing that
 * would mean rebuilding most of the calendar for a second-order nudge, and the
 * next answer on any of those games rebuilds it anyway.
 */
const gamesToRepick = async (uid: string): Promise<{ seasonId: string; gameId: string }[]> => {
	const responsesSnap = await db.collectionGroup('responses').where('uid', '==', uid).get();

	const playing = responsesSnap.docs.filter(doc => (doc.data() as GameResponse).status === 'in');

	// `.../games/{gameId}/responses/{uid}` — up to the game, then up again to
	// the season it belongs to.
	const gameRefs = playing
		.map(doc => doc.ref.parent.parent)
		.filter((ref): ref is NonNullable<typeof ref> => ref !== null && ref.parent.parent !== null);

	const now = new Date().toISOString();
	const affected: { seasonId: string; gameId: string }[] = [];

	for (const chunk of chunksOf(gameRefs, READ_CHUNK)) {
		for (const gameSnap of await db.getAll(...chunk)) {
			const game = gameSnap.data() as { kickoff?: string; resultFinalisedAt?: string } | undefined;

			// A game already played is a record of what happened, and a confirmed
			// one has a lineup the ledger was computed against. Neither is re-picked
			// here for the same reason `runTeamRebuild` refuses to.
			if (!game?.kickoff || game.kickoff < now || game.resultFinalisedAt) continue;

			affected.push({ seasonId: gameSnap.ref.parent.parent!.id, gameId: gameSnap.id });
		}
	}

	return affected;
};

export const setStartingRating = onCall<{ uid: string; rating: number | null }>(
	{ region: REGION },
	instrument('setStartingRating', async request => {
		const callerUid = requireAppAdmin(request);

		const { uid, rating } = request.data;
		if (!uid) throw new HttpsError('invalid-argument', 'A uid is required.');

		// `null` clears it; anything else has to be a real number on the scale the
		// admin was shown. Checked rather than clamped, because a request carrying
		// 500 is a bug somewhere and quietly storing 100 would hide it.
		if (rating !== null && (typeof rating !== 'number' || !Number.isFinite(rating))) {
			throw new HttpsError('invalid-argument', 'A rating must be a number, or null to clear it.');
		}

		if (rating !== null && (rating < MIN_DISPLAY || rating > MAX_DISPLAY)) {
			throw new HttpsError('invalid-argument', `A rating must be between ${MIN_DISPLAY} and ${MAX_DISPLAY}.`);
		}

		// The profile has to exist. Unlike `setAppAdmin`, which can promote
		// somebody who has never opened the app, there is nothing to rate about an
		// account with no profile — and creating one here to hang a rating off
		// would put a player in every roster who has never signed in.
		const ref = db.doc(`users/${uid}`);
		const snapshot = await ref.get();

		if (!snapshot.exists) throw new HttpsError('not-found', 'That player has no profile yet.');

		const profile = snapshot.data() as AppUser;

		if (hasPlayed(profile.rating)) {
			throw new HttpsError(
				'failed-precondition',
				'They have already played a rated game, so their rating is the ladder’s now.'
			);
		}

		await ref.set(
			{
				rating:
					rating === null
						? FieldValue.delete()
						: createStartingRating(fromDisplayRating(rating), new Date().toISOString()),
			},
			{ merge: true }
		);

		// Lineups already built for upcoming games were picked with this player at
		// the season seed. Without this the balancer keeps using the old number
		// until somebody else happens to answer, which reads exactly like the
		// rating having been ignored.
		//
		// Batched rather than one at a time: somebody who has answered a whole
		// season in advance is a long serial chain of transactions inside a request
		// an admin is watching. Bounded rather than unbounded, so that same person
		// cannot open a transaction per game at once.
		const repick = await gamesToRepick(uid);

		for (const batch of chunksOf(repick, REPICK_CONCURRENCY)) {
			await Promise.all(batch.map(game => invalidateTeams(game.seasonId, game.gameId)));
		}

		logger.info('Set a starting rating', { uid, rating, by: callerUid, repicked: repick.length });

		return { ok: true };
	})
);
