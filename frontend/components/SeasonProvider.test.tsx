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

const season = { season: null as Season | null, loading: true, error: null as Error | null, retry: jest.fn() };
const games = { games: [] as Game[], loading: true, error: null as Error | null, retry: jest.fn() };
const answers = {
	myResponses: {} as Record<string, GameResponse>,
	loading: true,
	error: null as Error | null,
	retry: jest.fn(),
};
const books = { dues: [] as Due[], loading: false, error: null as Error | null, retry: jest.fn() };
const auth = { user: { uid: 'anna', isAppAdmin: false } as { uid: string; isAppAdmin: boolean } | null };

jest.mock('../hooks/useData', () => ({
	useSeason: () => season,
	useGames: () => games,
	useDues: () => books,
}));

jest.mock('../hooks/useMyResponses', () => ({ useMyResponses: () => answers }));

jest.mock('../lib/auth', () => ({ useAuth: () => auth }));
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
	season.season = null;
	season.loading = true;
	season.error = null;
	season.retry = jest.fn();

	games.games = [];
	games.loading = true;
	games.error = null;
	games.retry = jest.fn();

	answers.myResponses = {};
	answers.loading = true;
	answers.error = null;
	answers.retry = jest.fn();

	books.dues = [];
	books.loading = false;
	books.error = null;
	books.retry = jest.fn();

	auth.user = { uid: 'anna', isAppAdmin: false };
});

describe('SeasonProvider', () => {
	it('is loading while any listener still is', () => {
		season.loading = false;
		renderProvider();

		expect(state()).toContain('loading');
	});

	// The one that is easy to forget, because nothing on a screen is missing
	// while it is outstanding: a game the user answered draws as one they have
	// not, and then corrects itself a frame later.
	it('is loading while only the answers are outstanding', () => {
		season.loading = false;
		games.loading = false;
		answers.loading = true;
		renderProvider();

		expect(state()).toContain('loading');
	});

	it('is ready once all three have landed', () => {
		season.loading = false;
		games.loading = false;
		answers.loading = false;
		renderProvider();

		expect(state()).toContain('ready');
	});

	it('hands every screen the answers the signed-in user has given', () => {
		season.loading = false;
		games.loading = false;
		answers.loading = false;
		answers.myResponses = { 'game-1': { status: 'in' } as GameResponse };
		renderProvider();

		expect(state()).toContain('in');
	});

	describe('when a listener fails', () => {
		// Any of the three on its own. The screens draw one failure state, so
		// the provider has to surface whichever broke rather than only the
		// season.
		it('surfaces the season listener failing', () => {
			season.error = new Error('season-denied');
			renderProvider();

			expect(state()).toContain('season-denied');
		});

		it('surfaces the games listener failing', () => {
			games.error = new Error('games-denied');
			renderProvider();

			expect(state()).toContain('games-denied');
		});

		// Losing this one is the quiet failure: nothing is missing from the
		// screen, every game just claims you never answered it.
		it('surfaces the answers listener failing', () => {
			answers.error = new Error('answers-denied');
			renderProvider();

			expect(state()).toContain('answers-denied');
		});

		// A screen only knows something behind it failed, not which listener it
		// was, and re-subscribing a healthy one costs a snapshot it was going to
		// be handed anyway.
		it('retries every listener together', () => {
			season.error = new Error('offline');
			renderProvider();

			act(() => {
				screen.getByRole('button').click();
			});

			expect(season.retry).toHaveBeenCalledTimes(1);
			expect(games.retry).toHaveBeenCalledTimes(1);
			expect(answers.retry).toHaveBeenCalledTimes(1);
			expect(books.retry).toHaveBeenCalledTimes(1);
		});
	});

	describe('who is looking', () => {
		const withSeason = (overrides: Partial<Season>) => {
			season.season = { id: 'season-1', memberUids: [], adminUids: [], ...overrides } as Season;
			season.loading = false;
			games.loading = false;
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
			season.season = { id: 'season-1', memberUids: ['anna'], adminUids: [], ...overrides } as Season;
			season.loading = false;
			games.loading = false;
			answers.loading = false;
		};

		it('locks the In button of somebody who owes, and says how much', () => {
			landed();
			books.dues = [charge(), charge({ id: 'game-2_anna', gameId: 'game-2' })];
			renderProvider();

			expect(state()).toContain('blocked locked-at-140-/s/season-1/finances');
		});

		it('leaves somebody who has paid up alone', () => {
			landed();
			books.dues = [charge({ status: 'paid', settledAt: '2026-08-02T00:00:00.000Z', settledBy: 'bob' })];
			renderProvider();

			expect(state()).toContain('clear unlocked');
		});

		// A season admin owes their share like everybody else. The season usually
		// collects to their own Swish number, which Swish refuses to pay, and an
		// admin who cannot sign up cannot mark the payment that would unlock them.
		it('tells a season admin what they owe without locking them out', () => {
			landed({ adminUids: ['anna'] });
			books.dues = [charge()];
			renderProvider();

			expect(state()).toContain('owing unlocked');
		});

		it('exempts an app admin the same way', () => {
			landed();
			auth.user = { uid: 'anna', isAppAdmin: true };
			books.dues = [charge()];
			renderProvider();

			expect(state()).toContain('owing unlocked');
		});

		// A debt nobody has heard about yet draws a live In button the rules will
		// refuse, so the books are one of the four things `loading` covers.
		it('waits for the books before claiming anybody is clear', () => {
			landed();
			books.loading = true;
			renderProvider();

			expect(state()).toContain('loading');
		});

		// Failing open on purpose. The rule is the gate either way, so a dropped
		// books listener costs a refused write, not a failure screen over the
		// whole season and not a lock nobody can see the reason for.
		it('stops claiming anybody is blocked when the books listener drops', () => {
			landed();
			books.dues = [charge()];
			books.error = new Error('dues-denied');
			renderProvider();

			expect(state()).toContain('no-error');
			expect(state()).toContain('clear unlocked');
		});
	});
});
