import { act, renderHook } from '@testing-library/react';
import type { Game, GameResponse, Season } from '@shared/types';

const mockReplace = jest.fn();
const mockPush = jest.fn();

// A fresh object per render on purpose. The hook must not treat a changed
// router identity as a fresh arrival, and a memoised mock would hide it.
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

import { useLiveGameRedirect } from './useLiveGameRedirect';

const season = { responseDeadlineHours: 24 } as Season;

const tonight = {
	id: 'tonight',
	kickoff: '2026-08-12T19:00:00.000Z',
	endsAt: '2026-08-12T20:30:00.000Z',
	status: 'scheduled',
} as Game;

const nextWeek = {
	...tonight,
	id: 'next-week',
	kickoff: '2026-08-19T19:00:00.000Z',
	endsAt: '2026-08-19T20:30:00.000Z',
} as Game;

const IN_TONIGHT: Record<string, Pick<GameResponse, 'status'>> = { tonight: { status: 'in' } };

type Props = Parameters<typeof useLiveGameRedirect>[0];

const props = (overrides: Partial<Props> = {}): Props => ({
	seasonId: 'season-1',
	season,
	games: [tonight, nextWeek],
	myResponses: IN_TONIGHT,
	ready: true,
	...overrides,
});

const render = (overrides: Partial<Props> = {}) =>
	renderHook((current: Props) => useLiveGameRedirect(current), { initialProps: props(overrides) });

/** `visibilityState` is read-only, so the whole property gets swapped out. */
const setVisibility = (state: 'visible' | 'hidden') =>
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

const becomes = (state: 'visible' | 'hidden') =>
	act(() => {
		setVisibility(state);
		document.dispatchEvent(new Event('visibilitychange'));
	});

describe('useLiveGameRedirect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers().setSystemTime(new Date('2026-08-12T19:30:00.000Z'));
		setVisibility('visible');
		window.sessionStorage.clear();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('opens the game somebody is playing in right now', () => {
		render();

		expect(mockReplace).toHaveBeenCalledWith('/s/season-1/g/tonight');
	});

	// Push would leave the season page on the stack, so Back would land right
	// back here and be sent onward again.
	it('replaces rather than pushes', () => {
		render();

		expect(mockPush).not.toHaveBeenCalled();
	});

	it.each([
		['they said Out', { tonight: { status: 'out' } } as Record<string, Pick<GameResponse, 'status'>>],
		['they never answered', {}],
	])('stays put when %s', (_case, myResponses) => {
		render({ myResponses });

		expect(mockReplace).not.toHaveBeenCalled();
	});

	it('stays put when no game is on', () => {
		jest.setSystemTime(new Date('2026-08-12T18:00:00.000Z'));
		render();

		expect(mockReplace).not.toHaveBeenCalled();
	});

	// "No answer" and "the answer hasn't arrived yet" look identical, so the
	// decision waits rather than reading an empty first snapshot as absence.
	it('waits for the data, then goes', () => {
		const { rerender } = render({ ready: false });

		expect(mockReplace).not.toHaveBeenCalled();

		rerender(props());

		expect(mockReplace).toHaveBeenCalledWith('/s/season-1/g/tonight');
	});

	// The back button out of the game page has to work: the season page remounts,
	// and without the mark it would bounce straight back.
	it('only sends them once per game', () => {
		render().unmount();
		expect(mockReplace).toHaveBeenCalledTimes(1);

		render();
		expect(mockReplace).toHaveBeenCalledTimes(1);
	});

	// An installed app can sit in one document for weeks, so the mark is the game
	// id — spending it on one game must not silence every game after it.
	it('sends them again for a different game', () => {
		render().unmount();

		jest.setSystemTime(new Date('2026-08-19T19:30:00.000Z'));
		render({ myResponses: { 'next-week': { status: 'in' } } });

		expect(mockReplace).toHaveBeenLastCalledWith('/s/season-1/g/next-week');
	});

	// The resume, which for a phone is most arrivals: the app was opened before
	// kickoff and comes back to the foreground once the game is under way.
	it('goes on returning to the foreground', () => {
		jest.setSystemTime(new Date('2026-08-12T18:00:00.000Z'));
		render();

		act(() => setVisibility('hidden'));
		jest.setSystemTime(new Date('2026-08-12T19:30:00.000Z'));
		becomes('visible');

		expect(mockReplace).toHaveBeenCalledWith('/s/season-1/g/tonight');
	});

	// Someone already reading the season page when kickoff passes has entered the
	// app; the page must not move under their thumb.
	it('does not go as kickoff passes under an open page', () => {
		jest.setSystemTime(new Date('2026-08-12T18:00:00.000Z'));
		const { rerender } = render();

		jest.setSystemTime(new Date('2026-08-12T19:30:00.000Z'));
		rerender(props());

		expect(mockReplace).not.toHaveBeenCalled();
	});

	it('does nothing while the app is backgrounded', () => {
		setVisibility('hidden');
		render();

		expect(mockReplace).not.toHaveBeenCalled();
	});

	// Storage throws in Safari's private mode. Unable to record the jump means
	// not taking it — an unrecorded redirect is one Back can't escape.
	it('stays put when the jump cannot be recorded', () => {
		jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});

		render();

		expect(mockReplace).not.toHaveBeenCalled();
		jest.restoreAllMocks();
	});

	it('stops listening once the page is gone', () => {
		const removeSpy = jest.spyOn(document, 'removeEventListener');

		render().unmount();

		expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
		removeSpy.mockRestore();
	});
});
