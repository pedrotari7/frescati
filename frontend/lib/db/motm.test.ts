import type { QueryDocumentSnapshot } from 'firebase/firestore';

const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
	onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
	deleteDoc: vi.fn(),
	setDoc: vi.fn(),
}));

vi.mock('./paths', () => ({
	motmVoteDoc: () => ({}),
	tournamentMotmDoc: () => ({}),
	tournamentMotmVotersDoc: () => ({}),
}));

import { subscribeToMotm, subscribeToMotmVoters } from './motm';

/**
 * `subscribeToMotmVoters` is the one subscription that does not simply hand a
 * document to a mapper: it reaches into a field and falls back to a shared
 * empty array. Moving it onto `subscribeToDoc` changed its shape, so the
 * behaviour it had before is pinned here.
 */

const snapshot = (data: Record<string, unknown> | null) =>
	({ exists: () => data !== null, data: () => data ?? undefined }) as unknown as QueryDocumentSnapshot;

const emit = (value: unknown) => {
	const [, onNext] = mockOnSnapshot.mock.calls[0] as [unknown, (snapshot: unknown) => void];
	onNext(value);
};

beforeEach(() => {
	vi.clearAllMocks();
	mockOnSnapshot.mockReturnValue(() => {});
});

describe('subscribeToMotmVoters', () => {
	it('reports the uids while the vote is open', () => {
		const onChange = vi.fn();
		subscribeToMotmVoters('s1', 'g1', onChange, vi.fn());

		emit(snapshot({ uids: ['anna', 'marco'] }));

		expect(onChange).toHaveBeenCalledWith(['anna', 'marco']);
	});

	// Absent covers both ends of it: nobody has answered yet, and a vote that has
	// been counted, whose turnout is in the published totals instead.
	it('reports nobody when the document is not there', () => {
		const onChange = vi.fn();
		subscribeToMotmVoters('s1', 'g1', onChange, vi.fn());

		emit(snapshot(null));

		expect(onChange).toHaveBeenCalledWith([]);
	});

	it('hands back the same empty array every time, so a re-render is not a change', () => {
		const first = vi.fn();
		subscribeToMotmVoters('s1', 'g1', first, vi.fn());
		emit(snapshot(null));

		mockOnSnapshot.mockClear();

		const second = vi.fn();
		subscribeToMotmVoters('s1', 'g1', second, vi.fn());
		emit(snapshot(null));

		expect(first.mock.calls[0][0]).toBe(second.mock.calls[0][0]);
	});
});

describe('subscribeToMotm', () => {
	it('reports the counted vote once it exists', () => {
		const onChange = vi.fn();
		subscribeToMotm('s1', 'g1', onChange, vi.fn());

		emit(snapshot({ counts: [{ uid: 'anna', votes: 3 }] }));

		expect(onChange).toHaveBeenCalledWith({ counts: [{ uid: 'anna', votes: 3 }] });
	});

	// null covers a game nobody confirmed as well as one still being voted on.
	it('reports null while the vote is still open', () => {
		const onChange = vi.fn();
		subscribeToMotm('s1', 'g1', onChange, vi.fn());

		emit(snapshot(null));

		expect(onChange).toHaveBeenCalledWith(null);
	});
});
