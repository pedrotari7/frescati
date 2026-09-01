const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	onSnapshot: jest.fn(),
	deleteDoc: jest.fn(),
	deleteField: jest.fn(),
	getDoc: jest.fn(),
	setDoc: jest.fn(),
	updateDoc: jest.fn(),
}));

jest.mock('./paths', () => ({
	responseDoc: () => ({}),
	responsesCol: (_seasonId: string, gameId: string) => ({ gameId }),
}));

import { fetchSeasonResponses } from './responses';

/**
 * The one read in `lib/db` that paces itself.
 *
 * Everything else here either opens a listener or writes a document, so there is
 * nothing to pin about the order it happens in. This one is a season of queries
 * fired from a tab people walk through on their way somewhere else, and both
 * halves of that are load bearing: eight at a time so the answers don't arrive
 * all at once, and stopping between rounds so the ones nobody is waiting for
 * are never sent.
 */

const gameIds = (count: number) => Array.from({ length: count }, (_, at) => `g${at + 1}`);

/** Let every pending microtask and timer run, so the loop reaches its next round. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** A read nothing resolves until this test says so. */
const held = () => {
	const waiting: ((snapshot: unknown) => void)[] = [];

	mockGetDocs.mockImplementation(() => new Promise(resolve => waiting.push(resolve)));

	return {
		inFlight: () => waiting.length,
		answer: () => waiting.splice(0).forEach(resolve => resolve({ docs: [] })),
	};
};

beforeEach(() => {
	jest.clearAllMocks();
});

describe('fetchSeasonResponses', () => {
	it('keys an answer by the document id, not the uid field beside it', async () => {
		mockGetDocs.mockResolvedValue({ docs: [{ id: 'ana', data: () => ({ uid: 'nina', status: 'in' }) }] });

		await expect(fetchSeasonResponses('s1', ['g1'])).resolves.toEqual({
			g1: { ana: { uid: 'nina', status: 'in' } },
		});
	});

	it('reads eight games at a time rather than a season at once', async () => {
		const reads = held();
		const season = fetchSeasonResponses('s1', gameIds(20));

		await settle();
		expect(reads.inFlight()).toBe(8);

		reads.answer();
		await settle();
		expect(reads.inFlight()).toBe(8);

		reads.answer();
		await settle();
		expect(reads.inFlight()).toBe(4);

		reads.answer();
		await expect(season).resolves.toEqual(Object.fromEntries(gameIds(20).map(id => [id, {}])));
	});

	// The Club tab unmounting is what says no, and the round already in the air
	// is the most it can cost.
	it('sends nothing more once nobody wants the answer', async () => {
		const reads = held();
		let wanted = true;
		const season = fetchSeasonResponses('s1', gameIds(20), () => wanted);

		await settle();
		expect(mockGetDocs).toHaveBeenCalledTimes(8);

		wanted = false;
		reads.answer();

		// null rather than the eight games it did read: a caller drawing a partial
		// season would show people as never having answered games they answered.
		await expect(season).resolves.toBeNull();
		expect(mockGetDocs).toHaveBeenCalledTimes(8);
	});

	it('asks before the first round, so a screen already gone reads nothing at all', async () => {
		await expect(fetchSeasonResponses('s1', gameIds(20), () => false)).resolves.toBeNull();

		expect(mockGetDocs).not.toHaveBeenCalled();
	});
});
