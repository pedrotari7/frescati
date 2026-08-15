import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import type { Game } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { closeMotmVote } from './lib/motm';
import { requestRatingReplay } from './lib/finalise';
import { HOURLY, instrumentSchedule, reportError } from './lib/sentry';

/**
 * Counts the man-of-the-match votes that have run out of time.
 *
 * The query is the whole design. `motmVotingUntilMillis` is on the game only
 * while its vote is open — set by the confirmation that opened it, deleted by
 * the count below — so this asks for the handful of games currently voting and
 * nothing else, however long the back catalogue gets. No composite index, no
 * lower bound to age out of, and no state to reconcile: a game either has a
 * window or it doesn't.
 *
 * The bonus is applied by **replaying the ladder** rather than by adjusting the
 * winner in place. It is the same reason a corrected scoreline is: every game
 * rated after this one was rated against the ratings this one produced, so
 * there is no arithmetic that inserts ten Elo into the middle of that chain.
 * `computeGameRatings` reads the decision back on the way past and the bonus
 * falls out of the ordinary rating pass — which is also what makes it survive
 * every replay after this one, rather than being a one-off adjustment the next
 * correction quietly erases.
 */
export const closeMotmVoting = onSchedule(
	{ schedule: 'every 1 hours', region: REGION, timeoutSeconds: 300 },
	// Two consecutive misses before raising, like the confirmation sweep beside
	// it: nothing here has a deadline. A vote counted an hour late reaches the
	// same answer, because what can still be voted on is decided by the window
	// stored on the game rather than by when this happens to run.
	instrumentSchedule(
		'closeMotmVoting',
		{ schedule: HOURLY, checkinMargin: 20, maxRuntime: 10, failureIssueThreshold: 2 },
		async () => {
			const due = await db.collectionGroup('games').where('motmVotingUntilMillis', '<=', Date.now()).get();

			let counted = 0;
			let decided = 0;

			for (const doc of due.docs) {
				const game = doc.data() as Game;

				try {
					const hasWinner = await closeMotmVote(game.seasonId, doc.id);
					counted++;

					// A game nobody voted in is closed and left alone: no winner
					// means no bonus, and replaying the ladder to arrive at exactly
					// the ratings it already holds is a rewind of every game since
					// for nothing.
					if (!hasWinner) continue;

					await requestRatingReplay(game.kickoffMillis ?? Date.parse(game.kickoff));
					decided++;
				} catch (error) {
					// One wedged game must not leave every other vote open. The
					// window stays put, so the next hour tries again — which is
					// exactly the failure that repeats weekly with nothing to show
					// for it, and why this is reported rather than only logged.
					reportError(
						'Could not count a man-of-the-match vote',
						{ seasonId: game.seasonId, gameId: doc.id },
						error
					);
				}
			}

			logger.info('Closed the man-of-the-match votes that were due', { due: due.size, counted, decided });
		}
	)
);
