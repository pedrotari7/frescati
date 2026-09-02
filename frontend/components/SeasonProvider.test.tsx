import { act, render, screen } from '@testing-library/react';
import type { Due, Game, GameResponse, Season } from '@shared/types';
import { SeasonProvider, useSeasonContext } from './SeasonProvider';

/**
 * What every screen under /s/ reads to draw itself.
 *
 * The piece worth pinning is the failure path. Nine screens branch on `error`
 * before they branch on the data, and offer `retry` as the way back, and both
 * of those pass through here from two separate listeners, either of which can
 * fail on its own.
 */

const mockSeason = { season: null as Season | null, loading: true, error: null as Error | null, retry: jest.fn() };
const mockGames = { games: [] as Game[], loading: true, error: null as Error | null, retry: jest.fn() };
const mockAnswers = {
	myResponses: {} as Record<string, GameResponse>,
	loading: true,
	error: null as Error | null,
	retry: jest.fn(),
};
const mockBooks = { dues: [] as Due[], loading: false, error: null as Error | null, retry: jest.fn() };
const mockAuth = { user: { uid: 'anna', isAppAdmin: false } as { uid: string; isAppAdmin: boolean } | null };

jest.mock('../hooks/useData', () => ({
	useSeason: () => mockSeason,
	useGames: () => mockGames,
	useDues: () => mockBooks,
}));

jest.mock('../hooks/useMyResponses', () => ({ useMyResponses: () => mockAnswers }));

jest.mock('../lib/auth', () => ({ useAuth: () => mockAuth }));
jest.mock('./SeasonScope', () => ({ useSeasonScope: () => ({ seasonId: null, remember: jest.fn() }) }));

const Probe = () => {
	const { loading, error, retry, isMember, isAdmin, role, myResponses, debt, debtLock } = useSeasonContext();
	const answer = myResponses['game-1']?.status ?? 'unanswered';
	const lock = debtLock ? `locked-at-${debtLock.outstanding}-${debtLock.href}` : 'unlocked';

	return (
		<button type='button' onClick={retry}>
			{`${loading ? 'loading' : 'ready'} ${error?.message ?? 'no-error'} ${isMember} ${isAdmin} ${role} ${answer} ${debt.standing} ${lock}`}
		</button>
	);
};

const renderProvider = () =>
	render(
		<SeasonProvider seasonId='season-1'>
			<Probe />
		</SeasonProvider>
	);

const state = () => screen.getByRole('button').textContent;

beforeEach(() => {
	mockSeason.season = null;
	mockSeason.loading = true;
	mockSeason.error = null;
	mockSeason.retry = jest.fn();

	mockGames.games = [];
	mockGames.loading = true;
	mockGames.error = null;
	mockGames.retry = jest.fn();

	mockAnswers.myResponses = {};
	mockAnswers.loading = true;
	mockAnswers.error = null;
	mockAnswers.retry = jest.fn();

	mockBooks.dues = [];
	mockBooks.loading = false;
	mockBooks.error = null;
	mockBooks.retry = jest.fn();

	mockAuth.user = { uid: 'anna', isAppAdmin: false };
});

describe('SeasonProvider', () => {
	it('is loading while any listener still is', () => {
		mockSeason.loading = false;
		renderProvider();

		expect(state()).toContain('loading');
	});

	// The one that is easy to forget, because nothing on a screen is missing
	// while it is outstanding: a game the user answered draws as one they have
	// not, and then corrects itself a frame later.
	it('is loading while only the answers are outstanding', () => {
		mockSeason.loading = false;
		mockGames.loading = false;
		mockAnswers.loading = true;
		renderProvider();

		expect(state()).toContain('loading');
	});

	it('is ready once all three have landed', () => {
		mockSeason.loading = false;
		mockGames.loading = false;
		mockAnswers.loading = false;
		renderProvider();

		expect(state()).toContain('ready');
	});

	it('hands every screen the answers the signed-in user has given', () => {
		mockSeason.loading = false;
		mockGames.loading = false;
		mockAnswers.loading = false;
		mockAnswers.myResponses = { 'game-1': { status: 'in' } as GameResponse };
		renderProvider();

		expect(state()).toContain('in');
	});

	describe('when a listener fails', () => {
		// Any of the three on its own. The screens draw one failure state, so
		// the provider has to surface whichever broke rather than only the
		// season.
		it('surfaces the season listener failing', () => {
			mockSeason.error = new Error('season-denied');
			renderProvider();

			expect(state()).toContain('season-denied');
		});

		it('surfaces the games listener failing', () => {
			mockGames.error = new Error('games-denied');
			renderProvider();

			expect(state()).toContain('games-denied');
		});

		// Losing this one is the quiet failure: nothing is missing from the
		// screen, every game just claims you never answered it.
		it('surfaces the answers listener failing', () => {
			mockAnswers.error = new Error('answers-denied');
			renderProvider();

			expect(state()).toContain('answers-denied');
		});

		// A screen only knows something behind it failed, not which listener it
		// was, and re-subscribing a healthy one costs a snapshot it was going to
		// be handed anyway.
		it('retries every listener together', () => {
			mockSeason.error = new Error('offline');
			renderProvider();

			act(() => {
				screen.getByRole('button').click();
			});

			expect(mockSeason.retry).toHaveBeenCalledTimes(1);
			expect(mockGames.retry).toHaveBeenCalledTimes(1);
			expect(mockAnswers.retry).toHaveBeenCalledTimes(1);
			expect(mockBooks.retry).toHaveBeenCalledTimes(1);
		});
	});

	describe('who is looking', () => {
		const withSeason = (overrides: Partial<Season>) => {
			mockSeason.season = { id: 'season-1', memberUids: [], adminUids: [], ...overrides } as Season;
			mockSeason.loading = false;
			mockGames.loading = false;
		};

		it('reads a roster member as a member', () => {
			withSeason({ memberUids: ['anna'] });
			renderProvider();

			expect(state()).toContain('true false member');
		});

		it('reads anybody else as an extra', () => {
			withSeason({ memberUids: ['bob'] });
			renderProvider();

			expect(state()).toContain('false false extra');
		});

		it('reads a named season admin as an admin', () => {
			withSeason({ memberUids: ['anna'], adminUids: ['anna'] });
			renderProvider();

			expect(state()).toContain('true true member');
		});

		// Before the season has arrived there is nothing to check anybody
		// against, and guessing "member" would draw admin controls for a moment.
		it('claims nothing at all before the season lands', () => {
			renderProvider();

			expect(state()).toContain('false false extra');
		});
	});

	// The one derivation three screens read rather than repeat, because the part
	// worth getting wrong is which arm of the union locks an In button.
	describe('what they owe the season', () => {
		const charge = (overrides: Partial<Due> = {}): Due =>
			({
				id: 'game-1_anna',
				uid: 'anna',
				kind: 'game',
				amount: 70,
				gameId: 'game-1',
				status: 'owing',
				createdAt: '2026-08-01T00:00:00.000Z',
				...overrides,
			}) as Due;

		const landed = (overrides: Partial<Season> = {}) => {
			mockSeason.season = { id: 'season-1', memberUids: ['anna'], adminUids: [], ...overrides } as Season;
			mockSeason.loading = false;
			mockGames.loading = false;
			mockAnswers.loading = false;
		};

		it('locks the In button of somebody who owes, and says how much', () => {
			landed();
			mockBooks.dues = [charge(), charge({ id: 'game-2_anna', gameId: 'game-2' })];
			renderProvider();

			expect(state()).toContain('blocked locked-at-140-/s/season-1/finances');
		});

		it('leaves somebody who has paid up alone', () => {
			landed();
			mockBooks.dues = [charge({ status: 'paid', settledAt: '2026-08-02T00:00:00.000Z', settledBy: 'bob' })];
			renderProvider();

			expect(state()).toContain('clear unlocked');
		});

		// A season admin owes their share like everybody else. The season usually
		// collects to their own Swish number, which Swish refuses to pay, and an
		// admin who cannot sign up cannot mark the payment that would unlock them.
		it('tells a season admin what they owe without locking them out', () => {
			landed({ adminUids: ['anna'] });
			mockBooks.dues = [charge()];
			renderProvider();

			expect(state()).toContain('owing unlocked');
		});

		it('exempts an app admin the same way', () => {
			landed();
			mockAuth.user = { uid: 'anna', isAppAdmin: true };
			mockBooks.dues = [charge()];
			renderProvider();

			expect(state()).toContain('owing unlocked');
		});

		// A debt nobody has heard about yet draws a live In button the rules will
		// refuse, so the books are one of the four things `loading` covers.
		it('waits for the books before claiming anybody is clear', () => {
			landed();
			mockBooks.loading = true;
			renderProvider();

			expect(state()).toContain('loading');
		});

		// Failing open on purpose. The rule is the gate either way, so a dropped
		// books listener costs a refused write, not a failure screen over the
		// whole season and not a lock nobody can see the reason for.
		it('stops claiming anybody is blocked when the books listener drops', () => {
			landed();
			mockBooks.dues = [charge()];
			mockBooks.error = new Error('dues-denied');
			renderProvider();

			expect(state()).toContain('no-error');
			expect(state()).toContain('clear unlocked');
		});
	});
});
