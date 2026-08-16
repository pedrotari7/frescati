import { getMotmTurnout, isMotmVotingOpen, tallyMotmVotes } from './motm';
import type { MotmVote } from './types';

const vote = (uid: string, votedFor: string): MotmVote => ({
	uid,
	votedFor,
	votedAt: '2026-09-02T09:00:00.000Z',
});

describe('tallyMotmVotes', () => {
	it('gives it to whoever got the most', () => {
		const tally = tallyMotmVotes([vote('a', 'x'), vote('b', 'x'), vote('c', 'y')]);

		expect(tally.winners).toEqual(['x']);
		expect(tally.counts).toEqual([
			{ uid: 'x', votes: 2 },
			{ uid: 'y', votes: 1 },
		]);
	});

	it('shares it between everybody level on the most', () => {
		expect(tallyMotmVotes([vote('a', 'x'), vote('b', 'y'), vote('c', 'z')]).winners).toEqual(['x', 'y', 'z']);
	});

	it('has no winner when nobody voted', () => {
		expect(tallyMotmVotes([])).toEqual({ winners: [], counts: [] });
	});

	it('counts one vote per voter however the documents arrived', () => {
		const tally = tallyMotmVotes([vote('a', 'x'), vote('a', 'x')]);

		expect(tally.counts).toEqual([{ uid: 'x', votes: 2 }]);
	});

	// Two devices reading the same decided game have to list the same names in
	// the same order, and a Firestore query makes no promises about which order
	// documents come back in.
	it('breaks a tie in the ordering by uid rather than by arrival', () => {
		const forwards = tallyMotmVotes([vote('a', 'zoe'), vote('b', 'adam')]);
		const backwards = tallyMotmVotes([vote('b', 'adam'), vote('a', 'zoe')]);

		expect(forwards).toEqual(backwards);
		expect(forwards.counts.map(count => count.uid)).toEqual(['adam', 'zoe']);
	});
});

describe('getMotmTurnout', () => {
	const lineup = [
		{ index: 0, uids: ['a', 'b'] },
		{ index: 1, uids: ['c', 'd'] },
	];

	it('splits the lineup by who has answered', () => {
		expect(getMotmTurnout(lineup, ['c', 'a'])).toEqual({ voted: ['a', 'c'], pending: ['b', 'd'] });
	});

	it('has everybody pending before the first vote', () => {
		expect(getMotmTurnout(lineup, [])).toEqual({ voted: [], pending: ['a', 'b', 'c', 'd'] });
	});

	it('has nobody pending once they have all answered', () => {
		expect(getMotmTurnout(lineup, ['a', 'b', 'c', 'd']).pending).toEqual([]);
	});

	// The rules check the team sheet at both ends of a vote, so this cannot
	// happen — but the two halves on screen have to sum to the lineup regardless
	// of what is in the collection, or the count reads wrong.
	it('ignores a voter who is not in the lineup', () => {
		expect(getMotmTurnout(lineup, ['a', 'stranger'])).toEqual({ voted: ['a'], pending: ['b', 'c', 'd'] });
	});

	// Both halves come back in team-sheet order rather than the order the votes
	// arrived, so the strip on screen doesn't reshuffle itself as people answer.
	it('keeps both halves in lineup order', () => {
		expect(getMotmTurnout(lineup, ['d', 'b'])).toEqual({ voted: ['b', 'd'], pending: ['a', 'c'] });
	});
});

describe('isMotmVotingOpen', () => {
	it('is open until the deadline and shut after it', () => {
		expect(isMotmVotingOpen(2_000, 1_999)).toBe(true);
		expect(isMotmVotingOpen(2_000, 2_000)).toBe(false);
	});

	// Covers both ends of a game's life: never confirmed, and already counted.
	it('is shut when there is no window at all', () => {
		expect(isMotmVotingOpen(undefined, 1)).toBe(false);
	});
});
