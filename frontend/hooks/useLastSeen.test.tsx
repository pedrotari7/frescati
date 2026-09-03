import { act, renderHook } from '@testing-library/react';

const mockRecordVisit = vi.fn().mockResolvedValue(undefined);
const mockCaptureError = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/db/users', () => ({ recordVisit: (...args: unknown[]) => mockRecordVisit(...args) }));
vi.mock('../lib/sentry', () => ({ captureError: (...args: unknown[]) => mockCaptureError(...args) }));

import { useLastSeen } from './useLastSeen';

/** `visibilityState` is read-only, so the whole property gets swapped out. */
const setVisibility = (state: 'visible' | 'hidden') =>
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

const becomes = (state: 'visible' | 'hidden') =>
	act(() => {
		setVisibility(state);
		document.dispatchEvent(new Event('visibilitychange'));
	});

describe('useLastSeen', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers().setSystemTime(new Date('2026-08-12T19:00:00.000Z'));
		setVisibility('visible');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// The sign-in write already stamped this instant; writing it again from here
	// would be two writes for one arrival.
	it('writes nothing on a page that loaded in the foreground', () => {
		renderHook(() => useLastSeen('anna'));

		expect(mockRecordVisit).not.toHaveBeenCalled();
	});

	it('records the visit when the app comes back to the foreground', () => {
		renderHook(() => useLastSeen('anna'));

		act(() => setVisibility('hidden'));
		vi.setSystemTime(new Date('2026-08-12T21:30:00.000Z'));
		becomes('visible');

		expect(mockRecordVisit).toHaveBeenCalledWith('anna', '2026-08-12T21:30:00.000Z');
	});

	// The whole point of the field: a phone in a pocket is not somebody
	// visiting, and neither is a tab behind forty others.
	it('records nothing on the app going into the background', () => {
		renderHook(() => useLastSeen('anna'));

		becomes('hidden');

		expect(mockRecordVisit).not.toHaveBeenCalled();
	});

	it('treats a flick to another tab and back as one visit', () => {
		renderHook(() => useLastSeen('anna'));

		for (let i = 0; i < 5; i++) {
			becomes('hidden');
			vi.setSystemTime(new Date(Date.now() + 20_000));
			becomes('visible');
		}

		expect(mockRecordVisit).not.toHaveBeenCalled();
	});

	// A page that loaded hidden was never stamped by the sign-in write, so
	// reaching the screen at all is the arrival, no gap to sit out.
	it('records the first sight of a page that loaded in a background tab', () => {
		setVisibility('hidden');
		renderHook(() => useLastSeen('anna'));

		vi.setSystemTime(new Date('2026-08-12T19:00:30.000Z'));
		becomes('visible');

		expect(mockRecordVisit).toHaveBeenCalledWith('anna', '2026-08-12T19:00:30.000Z');
	});

	it('does nothing at all with nobody signed in', () => {
		renderHook(() => useLastSeen(undefined));

		act(() => setVisibility('hidden'));
		vi.setSystemTime(new Date('2026-08-12T21:30:00.000Z'));
		becomes('visible');

		expect(mockRecordVisit).not.toHaveBeenCalled();
	});

	// Optimistic: the gap moved before the write landed, so a failure that left
	// it there would sit out ten minutes on the strength of a write that never
	// happened.
	it('retries on the next return after a failed write', async () => {
		mockRecordVisit.mockRejectedValueOnce(new Error('offline'));
		renderHook(() => useLastSeen('anna'));

		act(() => setVisibility('hidden'));
		vi.setSystemTime(new Date('2026-08-12T21:30:00.000Z'));
		becomes('visible');

		await act(async () => {
			await Promise.resolve();
		});

		expect(mockCaptureError).toHaveBeenCalled();

		act(() => setVisibility('hidden'));
		vi.setSystemTime(new Date('2026-08-12T21:30:20.000Z'));
		becomes('visible');

		expect(mockRecordVisit).toHaveBeenCalledTimes(2);
	});

	it('stops listening once it unmounts', () => {
		const removeSpy = vi.spyOn(document, 'removeEventListener');
		const { unmount } = renderHook(() => useLastSeen('anna'));

		unmount();

		expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
		removeSpy.mockRestore();
	});
});
