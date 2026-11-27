import { act, renderHook } from '@testing-library/react';
import type { Game, GameResponse, RatingLedgerEntry, Season } from '@shared/types';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const ledger = { entries: [] as RatingLedgerEntry[], loading: false };

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'anna' } }) }));
vi.mock('./useData', () => ({ useSeasonLedger: () => ({ ...ledger, error: null, retry: vi.fn() }) }));

import { useFullTimeTakeover } from './useFullTimeTakeover';

const NOW = Date.parse('2026-11-25T10:00:00.000Z');

const confirmed = (gameId: string, finalisedAt: string, positions: Record<string, number> = { anna: 0, bosse: 1 }) =>
	({ seasonId: 'autumn', gameId, finalisedAt, positions }) as unknown as RatingLedgerEntry;

const season = { id: 'autumn', responseDeadlineHours: 3 } as Season;

type Props = Parameters<typeof useFullTimeTakeover>[0];

const props = (overrides: Partial<Props> = {}): Props => ({
	season,
	games: [],
	myResponses: {},
	ready: true,
	...overrides,
});

const render = (overrides: Partial<Props> = {}) =>
	renderHook((current: Props) => useFullTimeTakeover(current), { initialProps: props(overrides) });

const setVisibility = (state: 'visible' | 'hidden') =>
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

describe('useFullTimeTakeover', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		setVisibility('visible');
		window.sessionStorage.clear();
		window.localStorage.clear();
		ledger.entries = [confirmed('g1', '2026-11-24T21:00:00.000Z')];
		ledger.loading = false;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('opens the card of a game they just played', () => {
		render();

		expect(mockPush).toHaveBeenCalledWith('/s/autumn/g/g1/full-time');
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it('leaves a finished season to its recap', () => {
		render({ season: { ...season, recapReadyAt: '2026-11-24T21:00:00.000Z' } });

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('leaves a game they are playing in now to the live redirect', () => {
		const live = {
			id: 'g2',
			status: 'scheduled',
			kickoff: '2026-11-25T09:30:00.000Z',
			endsAt: '2026-11-25T11:00:00.000Z',
		} as Game;
		const myResponses = { g2: { status: 'in' } as GameResponse };

		render({ games: [live], myResponses });

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('waits until the page is visible', () => {
		setVisibility('hidden');
		render();

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('waits for the ledger', () => {
		ledger.loading = true;
		render();

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('does not jump when it cannot record that it did', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		render();

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('jumps once a session, not again on a return to the foreground', () => {
		render();
		setVisibility('hidden');
		act(() => document.dispatchEvent(new Event('visibilitychange')));
		setVisibility('visible');
		act(() => document.dispatchEvent(new Event('visibilitychange')));

		expect(mockPush).toHaveBeenCalledTimes(1);
	});

	it('jumps on a return to the foreground if the load was in the background', () => {
		setVisibility('hidden');
		render();
		setVisibility('visible');
		act(() => document.dispatchEvent(new Event('visibilitychange')));

		expect(mockPush).toHaveBeenCalledTimes(1);
	});

	it('stays put once this device has seen the card', () => {
		window.localStorage.setItem('frescati:full-time-seen', '2026-11-24T21:00:00.000Z');
		render();

		expect(mockPush).not.toHaveBeenCalled();
	});
});
