import { renderHook } from '@testing-library/react';
import type { Game, GameResponse, Season, TournamentTeams } from '@shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '@shared/types';
import { useProgramme } from './useProgramme';

const season = { id: 's', slot: { durationMinutes: 90, timezone: 'Europe/Stockholm' } } as unknown as Season;
const game = { id: 'g', kickoffMillis: 1_000 } as unknown as Game;

const response = (uid: string, status: 'in' | 'out', role: 'member' | 'extra' = 'member') =>
	({ uid, status, role }) as GameResponse;

const mocks = {
	responses: [] as GameResponse[],
	teams: null as TournamentTeams | null,
	ledgerEnabled: [] as boolean[],
};

vi.mock('../components/SeasonProvider', () => ({
	useSeasonContext: () => ({ season, games: [game], loading: false, error: null, retry: vi.fn() }),
}));
vi.mock('./useData', () => ({
	useResponses: () => ({ responses: mocks.responses, loading: false, error: null }),
	useTournamentTeams: () => ({ teams: mocks.teams, loading: false, error: null }),
	useUsersByUid: () => ({ users: [], usersByUid: new Map(), loading: false, error: null }),
	useLedger: (enabled: boolean) => {
		mocks.ledgerEnabled.push(enabled);
		return { entries: [], loading: false, error: null, retry: vi.fn() };
	},
}));

const lineup = (squads: string[][]): TournamentTeams =>
	({
		teams: squads.map((uids, index) => ({ index, uids })),
		elos: Object.fromEntries(squads.flat().map((uid, index) => [uid, 1000 + index * 10])),
		settings: DEFAULT_BALANCE_SETTINGS,
	}) as unknown as TournamentTeams;

const players = (count: number) => Array.from({ length: count }, (_, index) => `p${index}`);

beforeEach(() => {
	mocks.responses = [];
	mocks.teams = null;
	mocks.ledgerEnabled = [];
});

describe('useProgramme', () => {
	it('counts confirmed answers of In and nothing else', () => {
		mocks.responses = [
			response('in-member', 'in'),
			response('out-member', 'out'),
			response('waiting', 'in', 'extra'),
		];

		const { result } = renderHook(() => useProgramme('s', 'g', true));

		expect(result.current.programme?.pool).toEqual(['in-member']);
	});

	it('has no odds below eight players', () => {
		mocks.responses = players(7).map(uid => response(uid, 'in'));
		mocks.teams = lineup([players(7).slice(0, 4), players(7).slice(4)]);

		const { result } = renderHook(() => useProgramme('s', 'g', true));

		expect(result.current.programme?.odds).toBeNull();
	});

	it('has odds totalling 100 for three teams', () => {
		const uids = players(12);
		mocks.responses = uids.map(uid => response(uid, 'in'));
		mocks.teams = lineup([uids.slice(0, 4), uids.slice(4, 8), uids.slice(8)]);

		const { result } = renderHook(() => useProgramme('s', 'g', true));
		const odds = result.current.programme?.odds ?? [];

		expect(odds).toHaveLength(3);
		expect(odds.reduce((total, row) => total + row.percent, 0)).toBe(100);
	});

	it('gives the same odds on a re-render with the same lineup', () => {
		const uids = players(12);
		mocks.responses = uids.map(uid => response(uid, 'in'));
		mocks.teams = lineup([uids.slice(0, 4), uids.slice(4, 8), uids.slice(8)]);

		const { result, rerender } = renderHook(() => useProgramme('s', 'g', true));
		const first = result.current.programme?.odds;
		mocks.teams = { ...mocks.teams };
		rerender();

		expect(result.current.programme?.odds).toEqual(first);
	});

	it('opens no ledger listener and has no programme when switched off', () => {
		const { result } = renderHook(() => useProgramme('s', 'g', false));

		expect(mocks.ledgerEnabled.every(enabled => !enabled)).toBe(true);
		expect(result.current.programme).toBeNull();
	});
});
