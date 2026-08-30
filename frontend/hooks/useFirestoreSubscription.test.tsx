import { act, renderHook } from '@testing-library/react';
import { useFirestoreSubscription } from './useFirestoreSubscription';

jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));

/**
 * The plumbing under every `onSnapshot` in the app.
 *
 * Worth its own file rather than being left to the fifteen hooks in `useData`
 * that wrap it: what they assert is that they pass the right ids, and every one
 * of them shares this loading, error and retry behaviour. A break here breaks
 * all fifteen at once and none of their tests would notice.
 */

/** A subscription whose callbacks the test drives by hand. */
const controllable = () => {
	const unsubscribe = jest.fn();
	const calls: { onChange: (value: string) => void; onError: (error: Error) => void }[] = [];

	const subscribe = jest.fn((onChange: (value: string) => void, onError: (error: Error) => void) => {
		calls.push({ onChange, onError });
		return unsubscribe;
	});

	return { subscribe, unsubscribe, latest: () => calls[calls.length - 1] };
};

describe('useFirestoreSubscription', () => {
	it('starts loading and settles on the first snapshot', () => {
		const { subscribe, latest } = controllable();

		const { result } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

		expect(result.current).toMatchObject({ data: '', loading: true, error: null });

		act(() => latest().onChange('landed'));

		expect(result.current).toMatchObject({ data: 'landed', loading: false, error: null });
	});

	it('settles into not-loading without subscribing when the inputs are not ready', () => {
		const { result } = renderHook(() => useFirestoreSubscription('', null, [], 'test'));

		expect(result.current.loading).toBe(false);
	});

	it('tears the listener down on unmount', () => {
		const { subscribe, unsubscribe } = controllable();

		renderHook(() => useFirestoreSubscription('', subscribe, [], 'test')).unmount();

		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	describe('when the listener fails', () => {
		it('reports the error and stops loading', () => {
			const { subscribe, latest } = controllable();
			const { result } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

			act(() => latest().onError(new Error('permission-denied')));

			expect(result.current.loading).toBe(false);
			expect(result.current.error).toEqual(new Error('permission-denied'));
		});

		// The screens branch on `error` before they branch on the data, so a
		// failure that left the initial value looking like real data is exactly
		// the "Season not found" this was all about.
		it('leaves the data where it was rather than inventing any', () => {
			const { subscribe, latest } = controllable();
			const { result } = renderHook(() => useFirestoreSubscription('nothing yet', subscribe, [], 'test'));

			act(() => latest().onError(new Error('offline')));

			expect(result.current.data).toBe('nothing yet');
		});
	});

	/**
	 * The effect that re-subscribes runs after the render that scheduled it, so
	 * for one render the hook is still holding the answer to the question it has
	 * stopped asking. Handing that back as settled is what let an admin sweep the
	 * season books against a book they had not been allowed to read yet.
	 *
	 * Every render is collected rather than read off `result.current`, because
	 * `rerender` flushes the effect and by then the hook has corrected itself.
	 */
	describe('when the deps change', () => {
		const renderWithId = () => {
			const { subscribe, latest } = controllable();
			const seen: { data: string; loading: boolean }[] = [];

			const { rerender } = renderHook(
				({ id }: { id: string }) => {
					const current = useFirestoreSubscription('', subscribe, [id], 'test');

					seen.push({ data: current.data, loading: current.loading });

					return current;
				},
				{ initialProps: { id: 'first' } }
			);

			return { latest, seen, rerender };
		};

		it('never reports the previous subscription as settled', () => {
			const { latest, seen, rerender } = renderWithId();

			act(() => latest().onChange('the first answer'));

			const before = seen.length;

			act(() => rerender({ id: 'second' }));

			expect(seen[before]).toEqual({ data: 'the first answer', loading: true });
		});

		it('settles again once the new subscription lands', () => {
			const { latest, seen, rerender } = renderWithId();

			act(() => latest().onChange('the first answer'));
			act(() => rerender({ id: 'second' }));
			act(() => latest().onChange('the second answer'));

			expect(seen[seen.length - 1]).toEqual({ data: 'the second answer', loading: false });
		});
	});

	describe('retry', () => {
		// Firestore drops a listener for good once it has handed one to
		// `onError`, so there is nothing to resume, the only way back is a
		// fresh `onSnapshot`, and this is the whole reason `LoadFailed` can
		// offer a button rather than telling somebody to reload the page.
		it('subscribes again', () => {
			const { subscribe, latest } = controllable();
			const { result } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

			act(() => latest().onError(new Error('offline')));
			expect(subscribe).toHaveBeenCalledTimes(1);

			act(() => result.current.retry());

			expect(subscribe).toHaveBeenCalledTimes(2);
		});

		it('drops the old listener rather than leaving two running', () => {
			const { subscribe, unsubscribe } = controllable();
			const { result } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

			act(() => result.current.retry());

			expect(unsubscribe).toHaveBeenCalledTimes(1);
		});

		it('goes back to loading, so the screen stops showing the failure', () => {
			const { subscribe, latest } = controllable();
			const { result } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

			act(() => latest().onError(new Error('offline')));
			act(() => result.current.retry());

			expect(result.current.loading).toBe(true);
		});

		it('clears the error once the retry lands', () => {
			const { subscribe, latest } = controllable();
			const { result } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

			act(() => latest().onError(new Error('offline')));
			act(() => result.current.retry());
			act(() => latest().onChange('back'));

			expect(result.current).toMatchObject({ data: 'back', loading: false, error: null });
		});

		// Held across renders so a screen can pass it straight to a button
		// without the retry itself being the reason that button re-renders.
		it('keeps the same identity across renders', () => {
			const { subscribe } = controllable();
			const { result, rerender } = renderHook(() => useFirestoreSubscription('', subscribe, [], 'test'));

			const first = result.current.retry;
			rerender();

			expect(result.current.retry).toBe(first);
		});
	});
});
