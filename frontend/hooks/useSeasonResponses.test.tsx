import { act, renderHook, waitFor } from '@testing-library/react';
import type { Game } from '@shared/types';
import type { SeasonResponses } from '@shared/availability';

/**
 * The one read in `hooks/` that isn't a listener, and the four ways it goes
 * wrong.
 *
 * A subscription re-fires by itself when the data moves, so the hooks around
 * this one have nothing to get right about when they run. This one does: it
 * reads once, and what it re-reads on is a joined list of game ids rather than
 * the array they came out of. That is not a tidiness thing, `games` is a fresh
 * array on every headcount tick and the Club tab sits open all week, so keying
 * on it would be thirty queries every time somebody tapped In.
 *
 * Two more are the ordinary hazards of a promise on a screen: a read that lands
 * after the screen moved on, and one that fails and has to say so rather than
 * draw an empty season. The fourth is the one that cost a CI run. Dropping a
 * late answer is not enough here, because the answer is not the expensive part:
 * a season is thirty queries and every response document comes back as its own
 * message, so a read nobody cancels goes on filling the connection of whatever
 * screen you opened next. So the cleanup has to reach the read itself, and this
 * checks that it does.
 */

jest.mock('../lib/db/responses', () => ({ fetchSeasonResponses: jest.fn() }));
jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));

import { fetchSeasonResponses } from '../lib/db/responses';
import { captureError } from '../lib/sentry';
import { useSeasonResponses } from './useSeasonResponses';

const fetched = fetchSeasonResponses as jest.MockedFunction<typeof fetchSeasonResponses>;

const SEASON = 'season-1';

const game = (id: string, status: Game['status'] = 'scheduled') => ({ id, status });

const answers: SeasonResponses = {
	g1: { ana: { uid: 'ana', status: 'in', role: 'member', respondedAt: '', updatedAt: '' } },
};

beforeEach(() => {
	jest.clearAllMocks();
	fetched.mockResolvedValue(answers);
});

describe('useSeasonResponses', () => {
	it('reads every game that still counts, once', async () => {
		const { result } = renderHook(() => useSeasonResponses(SEASON, [game('g1'), game('g2')]));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(fetched).toHaveBeenCalledTimes(1);
		expect(fetched).toHaveBeenCalledWith(SEASON, ['g1', 'g2'], expect.any(Function));
		expect(result.current.responses).toBe(answers);
		expect(result.current.error).toBeNull();
	});

	it('leaves out the games nobody was asked about', async () => {
		renderHook(() => useSeasonResponses(SEASON, [game('g1'), game('g2', 'cancelled')]));

		await waitFor(() => expect(fetched).toHaveBeenCalledWith(SEASON, ['g1'], expect.any(Function)));
	});

	// The reason the effect is keyed on the ids and not on `games`.
	it('does not read again when the same games arrive in a new array', async () => {
		const { rerender } = renderHook(({ games }) => useSeasonResponses(SEASON, games), {
			initialProps: { games: [game('g1')] },
		});

		await waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));

		rerender({ games: [game('g1')] });

		expect(fetched).toHaveBeenCalledTimes(1);
	});

	it('reads again when a game is added', async () => {
		const { rerender } = renderHook(({ games }) => useSeasonResponses(SEASON, games), {
			initialProps: { games: [game('g1')] },
		});

		await waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));

		rerender({ games: [game('g1'), game('g2')] });

		await waitFor(() => expect(fetched).toHaveBeenLastCalledWith(SEASON, ['g1', 'g2'], expect.any(Function)));
	});

	it('asks for nothing when there is no season or no game to ask about', async () => {
		const { result } = renderHook(() => useSeasonResponses(null, [game('g1')]));

		await waitFor(() => expect(result.current.loading).toBe(false));

		renderHook(() => useSeasonResponses(SEASON, []));

		expect(fetched).not.toHaveBeenCalled();
		expect(result.current.responses).toEqual({});
	});

	it('reports a failed read instead of an empty season, and says so to Sentry', async () => {
		const failure = new Error('offline');

		fetched.mockRejectedValueOnce(failure);

		const { result } = renderHook(() => useSeasonResponses(SEASON, [game('g1')]));

		await waitFor(() => expect(result.current.error).toBe(failure));

		expect(result.current.responses).toEqual({});
		expect(result.current.loading).toBe(false);
		expect(captureError).toHaveBeenCalledWith(failure, { source: 'seasonResponses' });
	});

	it('retries the same read', async () => {
		fetched.mockRejectedValueOnce(new Error('offline'));

		const { result } = renderHook(() => useSeasonResponses(SEASON, [game('g1')]));

		await waitFor(() => expect(result.current.error).not.toBeNull());

		act(() => result.current.retry());

		await waitFor(() => expect(result.current.responses).toBe(answers));

		expect(result.current.error).toBeNull();
		expect(fetched).toHaveBeenCalledTimes(2);
	});

	// A phone that opened Club, went back and opened another season: the first
	// read is still out, and it must not land on top of the second one.
	it('drops a read that lands after the screen has gone', async () => {
		let land: (responses: SeasonResponses) => void = () => {};

		fetched.mockReturnValueOnce(new Promise(resolve => (land = resolve)));

		const { result, unmount } = renderHook(() => useSeasonResponses(SEASON, [game('g1')]));

		unmount();
		await act(async () => land(answers));

		expect(result.current.responses).toEqual({});
	});

	// The half that matters on a tab people walk through. Ignoring the answer
	// still leaves the queries behind it in the air, on somebody else's screen.
	it('calls the read off when the screen goes', async () => {
		const { unmount } = renderHook(() => useSeasonResponses(SEASON, [game('g1')]));

		await waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));

		const stillWanted = fetched.mock.calls[0][2] as () => boolean;

		expect(stillWanted()).toBe(true);
		unmount();
		expect(stillWanted()).toBe(false);
	});

	it('calls the first read off when a second one starts', async () => {
		const { result, rerender } = renderHook(({ games }) => useSeasonResponses(SEASON, games), {
			initialProps: { games: [game('g1')] },
		});

		await waitFor(() => expect(result.current.loading).toBe(false));

		const stillWanted = fetched.mock.calls[0][2] as () => boolean;

		rerender({ games: [game('g1'), game('g2')] });

		expect(stillWanted()).toBe(false);

		await waitFor(() => expect(result.current.loading).toBe(false));
	});

	it('does not take an abandoned read for a season nobody answered', async () => {
		const { result, rerender } = renderHook(({ games }) => useSeasonResponses(SEASON, games), {
			initialProps: { games: [game('g1')] },
		});

		await waitFor(() => expect(result.current.responses).toBe(answers));

		fetched.mockResolvedValueOnce(null);
		rerender({ games: [game('g1'), game('g2')] });

		await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2));

		expect(result.current.responses).toBe(answers);
	});
});
