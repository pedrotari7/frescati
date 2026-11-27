import { renderHook } from '@testing-library/react';
import type { RatingLedgerEntry, TournamentResult } from '@shared/types';
import { useFullTimeCard } from './useFullTimeCard';

const entry = {
	seasonId: 's',
	gameId: 'g',
	kickoff: '2026-11-20T18:00:00.000Z',
	kickoffMillis: Date.parse('2026-11-20T18:00:00.000Z'),
	finalisedAt: '2026-11-20T21:00:00.000Z',
	positions: { me: 0, you: 1 },
	teams: { me: 0, you: 1 },
	before: { me: { elo: 1000, games: 1 }, you: { elo: 1000, games: 1 } },
	after: { me: { elo: 1010, games: 2 }, you: { elo: 990, games: 2 } },
} as unknown as RatingLedgerEntry;

const result = {
	standings: [
		{ team: 0, position: 0, played: 1, won: 1, drawn: 0, lost: 0 },
		{ team: 1, position: 1, played: 1, won: 0, drawn: 0, lost: 1 },
	],
	changes: [
		{ uid: 'me', before: 1000, after: 1010, delta: 10 },
		{ uid: 'you', before: 1000, after: 990, delta: -10 },
	],
	finalisedAt: '2026-11-20T21:00:00.000Z',
	finalisedBy: null,
} as unknown as TournamentResult;

vi.mock('./useData', () => ({
	usePlayerLedger: (uid: string | null) => ({ entries: uid ? [entry] : [], loading: false, error: null }),
	useSeasonLedger: () => ({ entries: [entry], loading: false, error: null, retry: vi.fn() }),
	useTournamentResult: () => ({ result, loading: false, error: null }),
}));

describe('useFullTimeCard', () => {
	it('builds the card for somebody who played', () => {
		const { result: hook } = renderHook(() => useFullTimeCard('s', 'g', 'me'));

		expect(hook.current.card).toMatchObject({ gameId: 'g', position: 0, delta: 10 });
	});

	it('has no card for somebody who did not play', () => {
		const { result: hook } = renderHook(() => useFullTimeCard('s', 'g', 'stranger'));

		expect(hook.current.card).toBeNull();
	});
});
