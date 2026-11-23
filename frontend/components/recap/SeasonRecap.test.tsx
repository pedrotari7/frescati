import { fireEvent, render, screen } from '@testing-library/react';
import type { RecapInput } from '@shared/recap';
import type { AppUser, Game, RatingLedgerEntry, Season } from '@shared/types';
import { markRecapWatched } from '../../lib/db/users';
import SeasonRecap from './SeasonRecap';

/**
 * Which slides a viewer gets, and when watching to the end is written down.
 *
 * The data hooks are mocked rather than driven, as `MotmVoteCallout`'s are: what
 * they return is the only input the cases differ on, and the arithmetic behind
 * every slide has its own suite in `shared/recap.test.ts`.
 */

const SEASON_ID = 'autumn';

const season = (overrides: Partial<Season> = {}) =>
	({
		id: SEASON_ID,
		name: 'Autumn 2026',
		memberUids: ['anna', 'bosse'],
		venue: { name: 'Frescati IP' },
		slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'UTC' },
		recapReadyAt: '2026-11-01T00:00:00.000Z',
		...overrides,
	}) as Season;

const entry = (gameId: string, day: number, positions: Record<string, number>) =>
	({
		seasonId: SEASON_ID,
		gameId,
		kickoff: `2026-09-${String(day).padStart(2, '0')}T17:00:00.000Z`,
		kickoffMillis: Date.parse(`2026-09-${String(day).padStart(2, '0')}T17:00:00.000Z`),
		positions,
		before: {},
		after: {},
	}) as unknown as RatingLedgerEntry;

const INPUT: RecapInput = {
	seasonId: SEASON_ID,
	memberUids: ['anna', 'bosse'],
	games: [{ id: 'g1', status: 'played' } as Game, { id: 'g2', status: 'played' } as Game],
	entries: [entry('g1', 1, { anna: 0, bosse: 1 }), entry('g2', 8, { anna: 0, bosse: 1 })],
	responses: {},
	motm: {},
	matches: {},
};

const mockSeason = {
	seasonId: SEASON_ID,
	season: season() as Season | null,
	games: [] as Game[],
	loading: false,
	error: null as Error | null,
	retry: vi.fn(),
};
const mockRecap = {
	input: INPUT as RecapInput | null,
	ratedCount: 2,
	gameCount: 2,
	error: null as Error | null,
	retry: vi.fn(),
};
const mockAuth = { user: { uid: 'anna', isAppAdmin: false } as { uid: string; isAppAdmin: boolean } | null };
const mockMe = { user: { uid: 'anna', displayName: 'Anna' } as AppUser | null, loading: false };
const mockUsers = {
	usersByUid: new Map<string, AppUser>([
		['anna', { uid: 'anna', displayName: 'Anna' } as AppUser],
		['bosse', { uid: 'bosse', displayName: 'Bosse' } as AppUser],
	]),
};

vi.mock('../SeasonProvider', () => ({ useSeasonContext: () => mockSeason }));
vi.mock('../SeasonShell', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../hooks/useSeasonRecap', () => ({ useSeasonRecap: () => mockRecap }));
vi.mock('../../hooks/useData', () => ({ useUser: () => mockMe, useUsersByUid: () => mockUsers }));
vi.mock('../../lib/auth', () => ({ useAuth: () => mockAuth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../../lib/db/users', () => ({ markRecapWatched: vi.fn().mockResolvedValue(undefined) }));

const mark = markRecapWatched as ReturnType<typeof vi.fn>;

/** Tap forward until the story stops moving, and report how many slides it showed. */
const watchToTheEnd = () => {
	let seen = 1;

	while (!screen.queryByRole('button', { name: 'Next' })?.hasAttribute('disabled')) {
		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		seen++;
		if (seen > 40) throw new Error('The story never ended');
	}

	return seen;
};

beforeEach(() => {
	mockSeason.season = season();
	mockSeason.loading = false;
	mockSeason.error = null;
	window.sessionStorage.clear();
	mockRecap.input = INPUT;
	mockRecap.ratedCount = 2;
	mockRecap.gameCount = 2;
	mockRecap.error = null;
	mockAuth.user = { uid: 'anna', isAppAdmin: false };
	mockMe.user = { uid: 'anna', displayName: 'Anna' } as AppUser;
	mark.mockClear();
});

describe('SeasonRecap', () => {
	it('waits for the season to be over', () => {
		mockSeason.season = season({ recapReadyAt: undefined });

		render(<SeasonRecap />);

		expect(screen.getByText('The recap opens once every game this season has been rated.')).toBeInTheDocument();
	});

	it('opens on the season and remembers that you watched it to the end', () => {
		render(<SeasonRecap />);

		expect(screen.getByText('Autumn 2026')).toBeInTheDocument();
		watchToTheEnd();

		expect(screen.getByText('See you next season')).toBeInTheDocument();
		expect(mark).toHaveBeenCalledTimes(1);
		expect(mark).toHaveBeenCalledWith('anna', SEASON_ID);
	});

	it('ends on your own season when you played in it', () => {
		render(<SeasonRecap />);
		watchToTheEnd();
		fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

		expect(screen.getAllByText('Your season').length).toBeGreaterThan(0);
	});

	it('does not write it down twice', () => {
		mockMe.user = { uid: 'anna', displayName: 'Anna', recapsWatched: [SEASON_ID] } as AppUser;

		render(<SeasonRecap />);
		watchToTheEnd();

		expect(mark).not.toHaveBeenCalled();
	});

	it('lets an app admin preview a season still being played, and never counts it as watched', () => {
		mockSeason.season = season({ recapReadyAt: undefined });
		mockAuth.user = { uid: 'anna', isAppAdmin: true };
		mockRecap.gameCount = 5;

		render(<SeasonRecap preview />);

		expect(screen.getByText('Preview, 2 of 5 games')).toBeInTheDocument();
		watchToTheEnd();
		expect(mark).not.toHaveBeenCalled();
	});

	it('keeps the preview to app admins', () => {
		mockSeason.season = season({ recapReadyAt: undefined });

		render(<SeasonRecap preview />);

		expect(screen.getByText('The recap opens once every game this season has been rated.')).toBeInTheDocument();
	});

	it("shows somebody else's season from their profile, without counting it as yours", () => {
		render(<SeasonRecap player='bosse' />);
		watchToTheEnd();
		fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

		expect(screen.getAllByText("Bosse's season").length).toBeGreaterThan(0);
		expect(mark).not.toHaveBeenCalled();
	});

	it('gives somebody who never played the club and the awards, and nothing of their own', () => {
		mockAuth.user = { uid: 'zoe', isAppAdmin: false };
		mockMe.user = { uid: 'zoe', displayName: 'Zoe' } as AppUser;

		render(<SeasonRecap />);
		watchToTheEnd();

		expect(screen.queryByText('Your season')).not.toBeInTheDocument();
		expect(mark).toHaveBeenCalledWith('zoe', SEASON_ID);
	});

	it('says so when the season could not be read', () => {
		mockRecap.input = null;
		mockRecap.error = new Error('offline');

		render(<SeasonRecap />);

		expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
	});
	// Opened from a notification or a profile, nothing else has claimed the
	// session, and closing it would land on a home that sends you straight back.
	it('tells the season home it has already been shown this session', () => {
		render(<SeasonRecap />);

		expect(window.sessionStorage.getItem('frescati:recap')).toBe(SEASON_ID);
	});

	it('says so when the season is gone, rather than waiting for it', () => {
		mockSeason.season = null;
		mockRecap.input = null;

		render(<SeasonRecap />);

		expect(screen.getByText('This season is gone')).toBeInTheDocument();
	});

	it('offers to try again when the season itself could not be read', () => {
		mockSeason.season = null;
		mockSeason.error = new Error('offline');
		mockRecap.input = null;

		render(<SeasonRecap />);
		fireEvent.click(screen.getByRole('button', { name: /try again/i }));

		expect(mockSeason.retry).toHaveBeenCalled();
	});
});
