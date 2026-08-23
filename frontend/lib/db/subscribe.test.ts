import type { DocumentReference, Query, QueryDocumentSnapshot } from 'firebase/firestore';

const mockOnSnapshot = jest.fn();

jest.mock('firebase/firestore', () => ({
	onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

import { asData, subscribeToCollection, subscribeToDoc } from './subscribe';

/**
 * The plumbing under every listener in `lib/db`.
 *
 * Worth pinning directly rather than through the thirteen callers: the whole
 * point of these two is that an absent document is a value and not an error:
 * no response means no response, no match means not played, and that rule now
 * lives in one place where it used to be written out at each call site.
 */

/** Firestore hands the callback back; the caller returns it as the unsubscribe. */
const unsubscribe = () => {};

/** Runs `subscribe`, then returns the snapshot handler Firestore would call. */
const capture = () => {
	const [, onNext, onError] = mockOnSnapshot.mock.calls[0] as [
		unknown,
		(snapshot: unknown) => void,
		(error: Error) => void,
	];

	return { onNext, onError };
};

const docSnapshot = (data: Record<string, unknown> | null) =>
	({ id: 'doc-id', exists: () => data !== null, data: () => data ?? undefined }) as unknown as QueryDocumentSnapshot;

const ref = {} as DocumentReference;
const query = {} as Query;

beforeEach(() => {
	jest.clearAllMocks();
	mockOnSnapshot.mockReturnValue(unsubscribe);
});

describe('subscribeToDoc', () => {
	it('maps a document that is there', () => {
		const onChange = jest.fn();
		subscribeToDoc(ref, snapshot => snapshot.data() as { name: string }, onChange, jest.fn());

		capture().onNext(docSnapshot({ name: 'Anna' }));

		expect(onChange).toHaveBeenCalledWith({ name: 'Anna' });
	});

	// The third state. A missing document is an answer, not a failure.
	it('reports null for a document that is not there', () => {
		const onChange = jest.fn();
		subscribeToDoc(ref, snapshot => snapshot.data(), onChange, jest.fn());

		capture().onNext(docSnapshot(null));

		expect(onChange).toHaveBeenCalledWith(null);
	});

	// The mapper types `data()` as non-optional, which is only sound because it
	// never runs on an absent document. If that ever stops being true the mappers
	// start dereferencing undefined.
	it('never runs the mapper on an absent document', () => {
		const toModel = jest.fn();
		subscribeToDoc(ref, toModel, jest.fn(), jest.fn());

		capture().onNext(docSnapshot(null));

		expect(toModel).not.toHaveBeenCalled();
	});

	it('passes the error straight through', () => {
		const onError = jest.fn();
		const failure = new Error('permission-denied');
		subscribeToDoc(ref, snapshot => snapshot.data(), jest.fn(), onError);

		capture().onError(failure);

		expect(onError).toHaveBeenCalledWith(failure);
	});

	it('hands back the unsubscribe Firestore returned', () => {
		expect(subscribeToDoc(ref, snapshot => snapshot.data(), jest.fn(), jest.fn())).toBe(unsubscribe);
	});
});

describe('subscribeToCollection', () => {
	it('gives the mapper every document at once', () => {
		const onChange = jest.fn();
		subscribeToCollection(query, docs => docs.map(doc => doc.id), onChange, jest.fn());

		capture().onNext({ docs: [{ id: 'a' }, { id: 'b' }] });

		expect(onChange).toHaveBeenCalledWith(['a', 'b']);
	});

	// Taking the whole array rather than mapping one at a time is what lets the
	// callers that must sort, profiles, kit, do it inside the subscription.
	it('lets the mapper reorder what came back', () => {
		const onChange = jest.fn();
		subscribeToCollection(query, docs => [...docs].map(doc => doc.id).sort(), onChange, jest.fn());

		capture().onNext({ docs: [{ id: 'b' }, { id: 'a' }] });

		expect(onChange).toHaveBeenCalledWith(['a', 'b']);
	});

	it('reports an empty collection as an empty list', () => {
		const onChange = jest.fn();
		subscribeToCollection(query, asData<{ x: number }>(), onChange, jest.fn());

		capture().onNext({ docs: [] });

		expect(onChange).toHaveBeenCalledWith([]);
	});

	it('passes the error straight through', () => {
		const onError = jest.fn();
		const failure = new Error('permission-denied');
		subscribeToCollection(query, asData(), jest.fn(), onError);

		capture().onError(failure);

		expect(onError).toHaveBeenCalledWith(failure);
	});
});

describe('asData', () => {
	it('casts each document, keeping the query order', () => {
		const docs = [{ data: () => ({ order: 1 }) }, { data: () => ({ order: 0 }) }];

		expect(asData<{ order: number }>()(docs as never)).toEqual([{ order: 1 }, { order: 0 }]);
	});
});
