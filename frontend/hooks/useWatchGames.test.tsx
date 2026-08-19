import { act, renderHook } from '@testing-library/react';

const mockWatchGame = jest.fn().mockResolvedValue(undefined);
const mockUnwatchGame = jest.fn().mockResolvedValue(undefined);
const mockSubscribe = jest.fn();
const mockAuth = { user: { uid: 'anna' } as { uid: string } | null };

/** The last `onChange` handed to the subscription, so a test can deliver one. */
let deliver: ((gameIds: Set<string>) => void) | null = null;

jest.mock('../lib/db/watchers', () => ({
	watchGame: (...args: unknown[]) => mockWatchGame(...args),
	unwatchGame: (...args: unknown[]) => mockUnwatchGame(...args),
	subscribeToMyWatching: (uid: string, onChange: (gameIds: Set<string>) => void, onError: (e: Error) => void) => {
		deliver = onChange;

		return mockSubscribe(uid, onChange, onError) ?? (() => {});
	},
}));

jest.mock('../lib/auth', () => ({ useAuth: () => mockAuth }));

import { useWatchGames } from './useWatchGames';

beforeEach(() => {
	jest.clearAllMocks();
	deliver = null;
	mockAuth.user = { uid: 'anna' };
	mockSubscribe.mockReturnValue(() => {});
});

describe('useWatchGames', () => {
	// The toggle hands back what the switch should become, and this is what
	// decides which of the two writes that is. Backwards, the bell inverts.
	it('follows on true and unfollows on false', () => {
		const { result } = renderHook(() => useWatchGames('season-1'));

		result.current.toggleWatch('game-1', true);
		expect(mockWatchGame).toHaveBeenCalledWith('season-1', 'game-1', 'anna');
		expect(mockUnwatchGame).not.toHaveBeenCalled();

		result.current.toggleWatch('game-1', false);
		expect(mockUnwatchGame).toHaveBeenCalledWith('season-1', 'game-1', 'anna');
	});

	// The whole reason this takes a season rather than a game: one listener
	// answers for every row on the calendar, so a screen full of bells costs
	// exactly one subscription.
	it('answers for every game off a single subscription', () => {
		const { result } = renderHook(() => useWatchGames('season-1'));

		expect(mockSubscribe).toHaveBeenCalledTimes(1);
		expect(mockSubscribe).toHaveBeenCalledWith('anna', expect.any(Function), expect.any(Function));

		act(() => deliver?.(new Set(['game-1', 'game-3'])));

		expect(result.current.isWatching('game-1')).toBe(true);
		expect(result.current.isWatching('game-2')).toBe(false);
		expect(result.current.isWatching('game-3')).toBe(true);
	});

	// Off is both the default and the safe thing to draw: an on switch that
	// flicks off a moment later reads as a lost setting.
	it('says it is following nothing until the first snapshot lands', () => {
		const { result } = renderHook(() => useWatchGames('season-1'));

		expect(result.current.isWatching('game-1')).toBe(false);
	});

	// The caller's cue to draw no bell rather than a dead one — and the write
	// has to refuse too, in case one is drawn anyway.
	it('cannot watch, or write, with nobody signed in', () => {
		mockAuth.user = null;

		const { result } = renderHook(() => useWatchGames('season-1'));

		expect(result.current.canWatch).toBe(false);
		expect(mockSubscribe).not.toHaveBeenCalled();

		result.current.toggleWatch('game-1', true);
		expect(mockWatchGame).not.toHaveBeenCalled();
	});

	it('writes nothing before the season is known', () => {
		const { result } = renderHook(() => useWatchGames(null));

		result.current.toggleWatch('game-1', true);

		expect(mockWatchGame).not.toHaveBeenCalled();
	});
});
