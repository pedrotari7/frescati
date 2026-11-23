import { act, renderHook } from '@testing-library/react';
import type { RatingLedgerEntry } from '@shared/types';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

import { claimRecapSession, useRecapTakeover } from './useRecapTakeover';

const played = [{ gameId: 'g1', positions: { anna: 0, bosse: 1 } } as unknown as RatingLedgerEntry];

type Props = Parameters<typeof useRecapTakeover>[0];

const props = (overrides: Partial<Props> = {}): Props => ({
	seasonId: 'autumn',
	readyAt: '2026-11-01T00:00:00.000Z',
	entries: played,
	uid: 'anna',
	watched: [],
	ready: true,
	...overrides,
});

const render = (overrides: Partial<Props> = {}) =>
	renderHook((current: Props) => useRecapTakeover(current), { initialProps: props(overrides) });

const setVisibility = (state: 'visible' | 'hidden') =>
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

describe('useRecapTakeover', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setVisibility('visible');
		window.sessionStorage.clear();
	});

	it('opens the recap for somebody who played and has not watched it', () => {
		render();

		expect(mockPush).toHaveBeenCalledWith('/s/autumn/recap');
	});

	it('leaves a season that is not over alone', () => {
		render({ readyAt: undefined });

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('leaves somebody who already watched it alone', () => {
		render({ watched: ['spring', 'autumn'] });

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('leaves somebody who never played alone', () => {
		render({ uid: 'zoe' });

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('waits until it knows', () => {
		const { rerender } = render({ ready: false });
		expect(mockPush).not.toHaveBeenCalled();

		rerender(props());
		expect(mockPush).toHaveBeenCalledTimes(1);
	});

	// Pushed, not replaced: the chevron goes back before it goes to `backHref`,
	// and a replace would make that back step skip the season home entirely.
	it('leaves the season home behind it, so Back returns there', () => {
		render();

		expect(mockReplace).not.toHaveBeenCalled();
	});

	// A notification or a profile link opens the recap with nothing claimed, so
	// closing it would otherwise land here and be sent straight back.
	it('stays put when the recap was already opened this session', () => {
		claimRecapSession('autumn');
		render();

		expect(mockPush).not.toHaveBeenCalled();
	});

	// Back out of the recap lands here again, and has to stay here.
	it('takes over once a session, so closing it early is not a loop', () => {
		render().unmount();
		render();

		expect(mockPush).toHaveBeenCalledTimes(1);
	});

	it('does not take over when it cannot remember having done so', () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});

		render();

		expect(mockPush).not.toHaveBeenCalled();
		setItem.mockRestore();
	});

	it('takes over on a return to the app, not only on a load', () => {
		setVisibility('hidden');
		render();
		expect(mockPush).not.toHaveBeenCalled();

		act(() => {
			setVisibility('visible');
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(mockPush).toHaveBeenCalledWith('/s/autumn/recap');
	});
});
