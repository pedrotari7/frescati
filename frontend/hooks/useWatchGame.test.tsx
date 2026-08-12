import { renderHook } from '@testing-library/react';

const mockWatchGame = jest.fn().mockResolvedValue(undefined);
const mockUnwatchGame = jest.fn().mockResolvedValue(undefined);
const mockUseWatching = jest.fn((_seasonId: string | null, _gameId: string | null, _uid: string | null) => ({
	watching: false,
	loading: false,
	error: null as Error | null,
}));
const mockAuth = { user: { uid: 'anna' } as { uid: string } | null };

jest.mock('../lib/db/watchers', () => ({
	watchGame: (...args: unknown[]) => mockWatchGame(...args),
	unwatchGame: (...args: unknown[]) => mockUnwatchGame(...args),
}));

jest.mock('./useData', () => ({
	useWatching: (seasonId: string | null, gameId: string | null, uid: string | null) =>
		mockUseWatching(seasonId, gameId, uid),
}));

jest.mock('../lib/auth', () => ({ useAuth: () => mockAuth }));

import { useWatchGame } from './useWatchGame';

beforeEach(() => {
	jest.clearAllMocks();
	mockAuth.user = { uid: 'anna' };
	mockUseWatching.mockReturnValue({ watching: false, loading: false, error: null });
});

describe('useWatchGame', () => {
	// The toggle hands back what the switch should become, and this is what
	// decides which of the two writes that is. Backwards, the bell inverts.
	it('follows on true and unfollows on false', async () => {
		const { result } = renderHook(() => useWatchGame('season-1', 'game-1'));

		result.current.toggleWatch(true);
		expect(mockWatchGame).toHaveBeenCalledWith('season-1', 'game-1', 'anna');
		expect(mockUnwatchGame).not.toHaveBeenCalled();

		result.current.toggleWatch(false);
		expect(mockUnwatchGame).toHaveBeenCalledWith('season-1', 'game-1', 'anna');
	});

	it('reports whatever the subscription says, for the uid that is signed in', () => {
		mockUseWatching.mockReturnValue({ watching: true, loading: false, error: null });

		const { result } = renderHook(() => useWatchGame('season-1', 'game-1'));

		expect(result.current.watching).toBe(true);
		expect(mockUseWatching).toHaveBeenCalledWith('season-1', 'game-1', 'anna');
	});

	// The caller's cue to draw no bell rather than a dead one — and the write
	// has to refuse too, in case one is drawn anyway.
	it('cannot watch, or write, with nobody signed in', () => {
		mockAuth.user = null;

		const { result } = renderHook(() => useWatchGame('season-1', 'game-1'));

		expect(result.current.canWatch).toBe(false);

		result.current.toggleWatch(true);
		expect(mockWatchGame).not.toHaveBeenCalled();
	});

	it('writes nothing before the game is known', () => {
		const { result } = renderHook(() => useWatchGame('season-1', null));

		result.current.toggleWatch(true);

		expect(mockWatchGame).not.toHaveBeenCalled();
	});
});
