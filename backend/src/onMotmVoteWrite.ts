import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { REGION } from './lib/firebase';
import { recountMotmVoters } from './lib/motm';
import { instrument } from './lib/sentry';

/**
 * Keeps the public turnout list in step with the votes underneath it.
 *
 * The votes are readable by nobody but the people who cast them, so this is the
 * only way the group can be told how many of them there are. The same bind
 * `counts` on the game document is in, and the same answer: a function writes
 * down the one thing about a private collection everybody is allowed to know.
 *
 * What it publishes is who, never what. That distinction is the entire reason
 * this is allowed to exist while the vote is open: the votes stay sealed because
 * a running total turns an early lead into a bandwagon, and a list of names with
 * no picks attached gives nobody anything to fall in behind. It gives the squad
 * the one useful thing instead, which is who still needs asking.
 *
 * Fires on every vote written, changed or withdrawn. A mind changed twice is
 * still one voter, and the recount arrives at that without having to know which
 * of the three just happened.
 */
export const onMotmVoteWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/games/{gameId}/motmVotes/{uid}', region: REGION },
	instrument('onMotmVoteWrite', async event => {
		const { seasonId, gameId } = event.params;

		const voted = await recountMotmVoters(seasonId, gameId);

		logger.debug('Recounted the man-of-the-match turnout', { seasonId, gameId, voted });
	})
);
