import { act, renderHook } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
	beforeEach(() => {
		vi.useFakeTimers().setSystemTime(new Date('2026-09-01T17:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts on the current time', () => {
		const { result } = renderHook(() => useNow());

		expect(result.current.toISOString()).toBe('2026-09-01T17:00:00.000Z');
	});

	it('ticks again once the interval elapses', () => {
		const { result } = renderHook(() => useNow(30_000));

		act(() => {
			vi.advanceTimersByTime(30_000);
		});

		expect(result.current.toISOString()).toBe('2026-09-01T17:00:30.000Z');
	});

	it('ticks when the tab becomes visible again', () => {
		Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

		const { result } = renderHook(() => useNow());

		act(() => {
			vi.setSystemTime(new Date('2026-09-01T18:00:00.000Z'));
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(result.current.toISOString()).toBe('2026-09-01T18:00:00.000Z');
	});

	it('does not tick on a visibilitychange while backgrounded', () => {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

		const { result } = renderHook(() => useNow());
		const initial = result.current;

		act(() => {
			vi.setSystemTime(new Date('2026-09-01T18:00:00.000Z'));
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(result.current).toBe(initial);
	});

	it('clears the interval and listener on unmount', () => {
		const removeSpy = vi.spyOn(document, 'removeEventListener');
		const { unmount } = renderHook(() => useNow());

		unmount();

		expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
		removeSpy.mockRestore();
	});
});
