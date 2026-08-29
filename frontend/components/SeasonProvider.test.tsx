import { act, render, screen } from '@testing-library/react';
import type { Game, GameResponse, Season } from '@shared/types';
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

jest.mock('../hooks/useData', () => ({
	useSeason: () => season,
	useGames: () => games,
}));

jest.mock('../hooks/useMyResponses', () => ({ useMyResponses: () => answers }));

jest.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'anna', isAppAdmin: false } }) }));
jest.mock('./SeasonScope', () => ({ useSeasonScope: () => ({ seasonId: null, remember: jest.fn() }) }));

const Probe = () => {
	const { loading, error, retry, isMember, isAdmin, role, myResponses } = useSeasonContext();
	const answer = myResponses['game-1']?.status ?? 'unanswered';

	return (
		<button type='button' onClick={retry}>
			{`${loading ? 'loading' : 'ready'} ${error?.message ?? 'no-error'} ${isMember} ${isAdmin} ${role} ${answer}`}
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
});
