import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Game, Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { AUTO_FINALISE_HOURS } from '../../shared/tournament';
import { drainAbandonedReplays, finaliseGame, requestRatingReplay } from './lib/finalise';
import { HOURLY, instrument, instrumentSchedule, reportError } from './lib/sentry';

const isSeasonAdmin = async (seasonId: string, uid: string, isAppAdmin: boolean): Promise<boolean> => {
	if (isAppAdmin) return true;

	const snapshot = await db.doc(`seasons/${seasonId}`).get();

	return ((snapshot.data() as Season | undefined)?.adminUids ?? []).includes(uid);
};

/**
 * Confirm a game on demand.
 *
 * A callable rather than a flag on the game, because applying ratings is
 * privileged work with a real failure mode — a game applied twice would rate
 * the same result against the ratings the first pass produced — and the person
 * tapping the button deserves to be told which of those happened. The app has
 * no API layer and doesn't want one, but `setAppAdmin` already establishes that
 * privileged actions arrive this way.
 */
export const finaliseTournament = onCall<{ seasonId?: string; gameId?: string }>(
	{ region: REGION, timeoutSeconds: 300 },
	instrument('finaliseTournament', async request => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

		const { seasonId, gameId } = request.data ?? {};
		if (!seasonId || !gameId) throw new HttpsError('invalid-argument', 'Which game?');

		if (!(await isSeasonAdmin(seasonId, uid, request.auth?.token?.admin === true))) {
			throw new HttpsError('permission-denied', 'Only a season admin can confirm results.');
		}

		const outcome = await finaliseGame(seasonId, gameId, uid);

		if (outcome === 'missing') throw new HttpsError('not-found', 'That game has gone.');
		if (outcome === 'already-finalised') {
			throw new HttpsError('failed-precondition', 'These results are already confirmed.');
		}
		if (outcome === 'nothing-to-rate') {
			throw new HttpsError('failed-precondition', 'Enter at least one score before confirming.');
		}
		// Somebody else's correction is being worked through the ladder. Nothing is
		// wrong and nothing was applied — worth saying so plainly rather than
		// leaving the button looking broken, because tapping again shortly works.
		if (outcome === 'busy') {
			throw new HttpsError('aborted', 'Ratings are being recalculated right now — try again in a moment.');
		}

		return { ok: true };
	})
);

/**
 * Confirms whatever nobody got round to confirming.
 *
 * Hourly, like the reminders. Without this an unconfirmed game silently never
 * counts and somebody notices three weeks later that the ladder has not moved —
 * which is precisely the failure an explicit-confirm-only design invites.
 *
 * A game with no scores at all is left alone rather than confirmed empty: it
 * has nothing to say about anybody, and confirming it would only close the
 * scoreboard on a game somebody might still be about to fill in. It keeps being
 * offered here for as long as that stays true, however late the scores arrive —
 * which is the point of this having no lower bound.
 *
 * Also the app's answer to a replay whose holder died mid-flight. The lease
 * frees itself, but nothing re-reads what that holder had been asked to do, so
 * a correction could sit recorded and unapplied until somebody happened to make
 * another one. This already exists to catch what got missed.
 */
export const finaliseDueTournaments = onSchedule(
	{ schedule: 'every 1 hours', region: REGION, timeoutSeconds: 300 },
	// Two consecutive misses before raising, unlike the reminders: nothing here
	// has a deadline — a game confirmed an hour late rates identically — so one
	// skipped run costs nothing and isn't worth waking anybody for.
	instrumentSchedule(
		'finaliseDueTournaments',
		{ schedule: HOURLY, checkinMargin: 20, maxRuntime: 10, failureIssueThreshold: 2 },
		async () => {
			const cutoff = new Date(Date.now() - AUTO_FINALISE_HOURS * 3600_000).toISOString();

			// Every unrated game that has had its window, with no lower bound.
			//
			// There used to be one, seven days back, to keep this off the whole back
			// catalogue every hour — necessary while a rated game stayed `scheduled`
			// forever and so matched this query for the rest of time. It also meant a
			// game whose scores were entered a week late fell out of the window and
			// was never rated at all, silently, while the screen went on promising it
			// would be.
			//
			// Confirming now marks the game `played`, so what comes back here is only
			// what genuinely still needs rating: a handful of games nobody scored,
			// which is exactly the set worth noticing.
			//
			// Filtered on status as well as kickoff so this rides the collection-group
			// index `sendReminders` already needs, rather than asking for another one.
			// Cancelled games have nothing to rate anyway.
			const games = await db
				.collectionGroup('games')
				.where('status', '==', 'scheduled')
				.where('kickoff', '<', cutoff)
				.get();

			let finalised = 0;
			let busy = 0;
			let retired = 0;

			for (const doc of games.docs) {
				const game = doc.data() as Game;

				// Rated before confirming began marking the status, so it is still
				// answering this query. Retire it and move on; the back catalogue
				// heals itself over the first run or two rather than needing a script.
				if (game.resultFinalisedAt) {
					await doc.ref.update({ status: 'played' }).catch(() => undefined);
					retired++;
					continue;
				}

				try {
					const outcome = await finaliseGame(game.seasonId, doc.id, null);

					if (outcome === 'finalised') finalised++;
					// The ladder was busy the whole time this waited. Nothing was
					// applied and nothing is wrong; next hour will get it.
					if (outcome === 'busy') busy++;
				} catch (error) {
					// One wedged game must not stop the rest of the week confirming.
					reportError('Could not auto-confirm a game', { seasonId: game.seasonId, gameId: doc.id }, error);
				}
			}

			// Last, so a replay abandoned by a crashed holder is picked up after
			// this sweep's confirmations rather than being rewound by them.
			const replayed = await drainAbandonedReplays();

			// `lingering` is the number this sweep looked at and could not rate,
			// which is almost always games nobody scored. It is the one figure here
			// that should stay small — a number that climbs week on week means games
			// are going unrated and nobody has noticed.
			logger.info('Auto-confirmed games past their window', {
				checked: games.size,
				finalised,
				busy,
				retired,
				replayed,
				lingering: games.size - finalised - retired,
			});
		}
	)
);

/**
 * Replays the ladder when a confirmed score is corrected.
 *
 * Only fires for games that are already confirmed — before that, scores move
 * constantly and nothing has been applied yet, so there is nothing to replay.
 *
 * Fires **per match document**, so an admin fixing three scorelines raises
 * three of these. `requestRatingReplay` is what makes that safe and cheap: the
 * first to take the ladder lock does the work, the other two lower a floor it
 * is already covering and return. Running the replay directly here would have
 * had three rewinds interleaving with each other's forward passes, and the
 * ladder would settle on an answer none of them computed.
 */
export const onMatchWrite = onDocumentWritten(
	{
		document: 'seasons/{seasonId}/games/{gameId}/matches/{order}',
		region: REGION,
		timeoutSeconds: 300,
	},
	instrument('onMatchWrite', async event => {
		const { seasonId, gameId } = event.params;

		const snapshot = await db.doc(`seasons/${seasonId}/games/${gameId}`).get();
		const game = snapshot.data() as Game | undefined;

		if (!game?.resultFinalisedAt) return;

		logger.info('Replaying after a correction to a confirmed game', { seasonId, gameId });

		await requestRatingReplay(game.kickoffMillis ?? Date.parse(game.kickoff));
	})
);
