import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { MotmVote, Season, TournamentMotm, TournamentMotmVoters, TournamentTeams } from '../../../shared/types';
import { MOTM_VOTING_HOURS, tallyMotmVotes } from '../../../shared/motm';
import { formatGameWhen } from '../../../shared/format';
import { db } from './firebase';
import { sendGamePush } from './push';

/**
 * Running the man-of-the-match vote.
 *
 * Two moments, and everything between them is people tapping a name:
 *
 *  * **Opening** — the confirmation that publishes the table also asks the
 *    question, because that is the first point at which there is a table to
 *    argue about and a squad who all know how it went.
 *  * **Closing** — a sweep counts what came in, writes the decision down, and
 *    asks for a replay of the ladder. The bonus lands through
 *    `computeGameRatings` like everything else a game does to a rating, which is
 *    what keeps it survivable: a correction to a scoreline months later rewinds
 *    past this game and rebuilds it, vote included, rather than losing it.
 *
 * Between them the only thing published is the turnout: who has answered, never
 * what they answered. That is the whole of what a vote in progress may say about
 * itself.
 *
 * The decision document is the record, not the votes. They stay where they are
 * — a replay is not a recount — but nothing reads them again.
 */

const gameRef = (seasonId: string, gameId: string) => db.doc(`seasons/${seasonId}/games/${gameId}`);

const motmRef = (seasonId: string, gameId: string) => gameRef(seasonId, gameId).collection('tournament').doc('motm');

const votersRef = (seasonId: string, gameId: string) =>
	gameRef(seasonId, gameId).collection('tournament').doc('motmVoters');

/**
 * The counted vote for a game, or `null` while it is still open — or was never
 * opened at all.
 *
 * Read by `computeGameRatings` on every pass over a game, which is why this is
 * a document rather than a tally done on the fly: a replay has to arrive at the
 * same winner the app announced, including on the evening two people tied.
 */
export const getMotmDecision = async (seasonId: string, gameId: string): Promise<TournamentMotm | null> => {
	const snapshot = await motmRef(seasonId, gameId).get();

	return snapshot.exists ? (snapshot.data() as TournamentMotm) : null;
};

/**
 * Re-derive the public turnout list from the votes actually stored under the
 * game, and return how many there are.
 *
 * The votes are private to their owners, so nobody's client can work out that
 * eight people have answered — this is the same situation `counts` on the game
 * document is in, and it gets the same answer: a function writes down what a
 * client is not allowed to read. What it writes down is uids and nothing else.
 * The picks stay where they are.
 *
 * Recomputed from scratch rather than added to, like every other counter here:
 * a delta applied twice, and triggers do retry, silently corrupts the list.
 * Transactional for the same reason `recountGame` is — two votes landing
 * together would otherwise each write the total they read before the other.
 *
 * Read off the document ids rather than the `uid` field, the way `closeMotmVote`
 * does: the id is the voter by construction.
 *
 * A counted vote is left with no list at all. The turnout is the sum of the
 * published totals by then, so keeping this would be a second copy of a number
 * already on screen — and the decision, not the clock, is what says the counting
 * has happened, which is what makes a vote landing in the same moment as the
 * sweep unable to resurrect it.
 */
export const recountMotmVoters = async (seasonId: string, gameId: string): Promise<number> =>
	db.runTransaction(async transaction => {
		const [decision, votesSnap] = await Promise.all([
			transaction.get(motmRef(seasonId, gameId)),
			transaction.get(gameRef(seasonId, gameId).collection('motmVotes')),
		]);

		const uids = decision.exists ? [] : votesSnap.docs.map(doc => doc.id).sort();

		// No document rather than an empty list, the same third state the vote
		// itself uses: nobody has answered yet, which is not the same as a vote
		// that has been counted.
		if (uids.length === 0) {
			transaction.delete(votersRef(seasonId, gameId));

			return 0;
		}

		const voters: TournamentMotmVoters = { uids, updatedAt: new Date().toISOString() };

		transaction.set(votersRef(seasonId, gameId), voters);

		return uids.length;
	});

/**
 * Open the vote and tell the people who played that it is open.
 *
 * Called after a confirmation applies, and only after one that actually did
 * something — a replay re-confirms every game in its window and must not send a
 * fresh round of notifications for a Tuesday six weeks ago.
 *
 * Silent about a game with no lineup: below `MIN_TOURNAMENT_PLAYERS` there are
 * no teams, nothing to rate and nobody a vote could be about.
 *
 * A game that has already been decided is left alone. That is not a
 * theoretical case: clearing every score un-rates a game and puts it back in
 * the sweep's queue, so without this a second confirmation would reopen a vote
 * the group had already had and replay the ladder against a different answer.
 */
export const openMotmVoting = async (seasonId: string, gameId: string, season: Season): Promise<boolean> => {
	const [teamsSnap, decision] = await Promise.all([
		gameRef(seasonId, gameId).collection('tournament').doc('teams').get(),
		getMotmDecision(seasonId, gameId),
	]);

	if (!teamsSnap.exists || decision) return false;

	const lineup = teamsSnap.data() as TournamentTeams;
	const uids = lineup.teams.flatMap(team => team.uids);

	if (uids.length === 0) return false;

	const game = await gameRef(seasonId, gameId).get();
	const kickoff = (game.data()?.kickoff as string | undefined) ?? new Date().toISOString();

	// Counted from now rather than from kickoff: the window is time to answer a
	// question that is only being asked at this moment, and a game confirmed
	// late would otherwise open and close in the same breath.
	await gameRef(seasonId, gameId).update({
		motmVotingUntilMillis: Date.now() + MOTM_VOTING_HOURS * 3_600_000,
	});

	const sent = await sendGamePush(uids, 'motm', {
		when: formatGameWhen(kickoff, season.slot.timezone),
		// Straight to the team sheet, where the vote is — the game page is a
		// headcount for a game that has already been played.
		url: `/s/${seasonId}/g/${gameId}/tournament`,
		gameId,
	});

	logger.info('Opened the man-of-the-match vote', { seasonId, gameId, players: uids.length, ...sent });

	return true;
};

/**
 * Count one game's votes and shut the door.
 *
 * The two writes are what matter and they are ordered: the decision goes down
 * first, then the window is deleted. The other order would leave a moment where
 * the vote is neither open nor decided — during which a replay would rate the
 * game as though nobody had voted — and a crash in that gap would leave it that
 * way for good.
 *
 * Returns whether the result is worth replaying the ladder for. A game nobody
 * voted in changes no rating, so it is closed without disturbing anything.
 */
export const closeMotmVote = async (seasonId: string, gameId: string): Promise<boolean> => {
	const votesSnap = await gameRef(seasonId, gameId).collection('motmVotes').get();

	// Read off the document ids rather than the `uid` field, the same way
	// `getWatcherUids` does: the id is the voter by construction, since rules
	// only let somebody write their own.
	const votes = votesSnap.docs.map(doc => ({ ...(doc.data() as MotmVote), uid: doc.id }));
	const { winners, counts } = tallyMotmVotes(votes);

	const decision: TournamentMotm = { winners, counts, decidedAt: new Date().toISOString() };

	await motmRef(seasonId, gameId).set(decision);
	await gameRef(seasonId, gameId).update({ motmVotingUntilMillis: FieldValue.delete() });

	// Last, and after the decision on purpose: from here the turnout is the sum
	// of the totals just published, so a list of who answered is a second copy of
	// a number already on screen. It goes for the same reason the window does.
	await votersRef(seasonId, gameId).delete();

	logger.info('Counted a man-of-the-match vote', { seasonId, gameId, votes: votes.length, winners });

	return winners.length > 0;
};
