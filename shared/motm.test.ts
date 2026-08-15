import { isMotmVotingOpen, tallyMotmVotes } from './motm';
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
