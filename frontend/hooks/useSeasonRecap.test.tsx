import { act, renderHook, waitFor } from '@testing-library/react';
import type { Game, RatingLedgerEntry, Season } from '@shared/types';
import { fetchRecapGames } from '../lib/db/recap';
import { useSeasonRecap } from './useSeasonRecap';

const mockLedger = {
	entries: [{ seasonId: 'autumn', gameId: 'g1' } as RatingLedgerEntry],
	loading: false,
	error: null as Error | null,
	retry: vi.fn(),
};
const mockResponses = { responses: {}, loading: false, error: null as Error | null, retry: vi.fn() };

vi.mock('./useData', () => ({ useSeasonLedger: () => mockLedger }));
vi.mock('./useSeasonResponses', () => ({ useSeasonResponses: () => mockResponses }));
vi.mock('../lib/db/recap', () => ({ fetchRecapGames: vi.fn() }));
vi.mock('../lib/sentry', () => ({ captureError: vi.fn() }));

const fetchGames = fetchRecapGames as ReturnType<typeof vi.fn>;

const season = { id: 'autumn', memberUids: [] } as unknown as Season;
const games = [{ id: 'g1', status: 'played' } as Game];

beforeEach(() => {
	vi.clearAllMocks();
	mockLedger.loading = false;
	mockLedger.error = null;
	fetchGames.mockResolvedValue({ motm: {}, matches: {} });
});

describe('useSeasonRecap', () => {
	it('is ready once everything has landed', async () => {
		const { result } = renderHook(() => useSeasonRecap(season, games, false));

		await waitFor(() => expect(result.current.input).not.toBeNull());
	});

	// Before the games land, the responses read has nothing to key on and says
	// it is done with nothing, which would draw a season with no answers in it.
	it('waits for the season and its games', async () => {
		const { result } = renderHook(() => useSeasonRecap(season, [], true));

		await act(async () => {});
		expect(result.current.input).toBeNull();
	});

	it('gets past a failed read on retry', async () => {
		fetchGames.mockRejectedValueOnce(new Error('offline'));
		const { result } = renderHook(() => useSeasonRecap(season, games, false));

		await waitFor(() => expect(result.current.error).not.toBeNull());

		act(() => result.current.retry());

		await waitFor(() => expect(result.current.input).not.toBeNull());
		expect(result.current.error).toBeNull();
		expect(mockLedger.retry).toHaveBeenCalled();
		expect(mockResponses.retry).toHaveBeenCalled();
	});
});
