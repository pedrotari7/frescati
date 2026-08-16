/**
 * Man of the match.
 *
 * The one thing in the app the ladder cannot work out for itself. Everything
 * else about a rating comes off the scoreboard — who was on which team, how
 * that team finished, how it was expected to. None of that sees the player who
 * held a losing side together for an hour, and no amount of arithmetic over the
 * scorelines ever will. So it is put to the people who were there.
 *
 * Pure, like the rest of `shared/`: the sweep that closes a vote and the screen
 * that shows it counting have to agree exactly on who won, including on the
 * evening two people tie.
 */

import type { MotmVote, TournamentTeam } from './types';

/**
 * How long the vote stays open after the game is confirmed.
 *
 * Counted from the confirmation rather than from kickoff, because that is when
 * people are asked: confirming is what publishes the table, sends the
 * notification and gives the vote something to be about. In the ordinary case
 * `AUTO_FINALISE_HOURS` does that a day after the game, so a Tuesday is decided
 * by Friday.
 *
 * Two days rather than an evening. A vote is worth having only if most of the
 * squad get to it, and half a football group has its phone face down until the
 * weekend.
 */
export const MOTM_VOTING_HOURS = 48;

/** One player's share of the vote, once counting is over. */
export interface MotmCount {
	uid: string;
	votes: number;
}

export interface MotmTally {
	/**
	 * Everybody level on the most votes. Empty when nobody voted at all.
	 *
	 * A list rather than a winner, because a tie is a real outcome and picking
	 * between two people on a coin toss would be inventing a result the group
	 * didn't produce — the same reasoning that has teams level on every
	 * tie-break share a finishing position rather than one of them being handed
	 * it. What they share is the bonus; see `applyMotmBonus`.
	 */
	winners: string[];
	/** Every player who got a vote, most first. Ordered for display. */
	counts: MotmCount[];
}

/**
 * Count the votes.
 *
 * Ordering inside a tie is by uid rather than by whatever order the documents
 * came back in, so two devices looking at the same decided game list the same
 * names in the same order.
 */
export const tallyMotmVotes = (votes: MotmVote[]): MotmTally => {
	const totals = new Map<string, number>();

	for (const vote of votes) totals.set(vote.votedFor, (totals.get(vote.votedFor) ?? 0) + 1);

	const counts = [...totals.entries()]
		.map(([uid, count]) => ({ uid, votes: count }))
		.sort((a, b) => b.votes - a.votes || (a.uid < b.uid ? -1 : 1));

	const most = counts[0]?.votes ?? 0;

	return { winners: counts.filter(count => count.votes === most).map(count => count.uid), counts };
};

/** Who has answered and who hasn't, both in team-sheet order. */
export interface MotmTurnout {
	voted: string[];
	pending: string[];
}

/**
 * Split the lineup by who has voted.
 *
 * The one thing about a vote in progress that everybody may see. Turnout is not
 * a tally: knowing that eight people have answered says nothing about what any
 * of them said, so there is no early lead here for the rest of the squad to
 * fall in behind — which is the only reason the votes themselves are sealed.
 * What it does answer is the question the group actually asks on a Thursday,
 * which is who still needs chasing.
 *
 * Read against the lineup rather than taken at face value, so both halves are
 * drawn from the same set of people and always sum to it. A vote from somebody
 * who never played cannot be cast — rules check the team sheet at both ends —
 * but the arithmetic on screen should not depend on that holding.
 */
export const getMotmTurnout = (teams: TournamentTeam[], voterUids: string[]): MotmTurnout => {
	const voters = new Set(voterUids);
	const lineup = teams.flatMap(team => team.uids);

	return {
		voted: lineup.filter(uid => voters.has(uid)),
		pending: lineup.filter(uid => !voters.has(uid)),
	};
};

/**
 * Whether the vote is still open, from the window stored on the game.
 *
 * Absent means closed, and covers both ends of a game's life: one that has not
 * been confirmed yet, and one whose votes have been counted — the sweep clears
 * the field as it writes the decision, which is what takes the game out of its
 * query for good.
 */
export const isMotmVotingOpen = (until: number | undefined, now: number): boolean => until !== undefined && now < until;
