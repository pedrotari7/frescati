import { render, screen } from '@testing-library/react';
import type { Programme as ProgrammeData } from '../../hooks/useProgramme';
import Programme from './Programme';

const mock = {
	programme: null as ProgrammeData | null,
	loading: false,
	error: null as Error | null,
};

vi.mock('../../hooks/useProgramme', () => ({
	useProgramme: () => ({ ...mock, retry: vi.fn() }),
}));
const context = {
	loading: false,
	games: [{ id: 'g', kickoff: '2026-11-24T18:00:00.000Z' }],
};

vi.mock('../SeasonProvider', () => ({
	useSeasonContext: () => ({
		season: { id: 's', slot: { timezone: 'Europe/Stockholm' } },
		games: context.games,
		loading: context.loading,
	}),
}));
vi.mock('../../hooks/useData', () => ({
	useUsersByUid: () => ({ usersByUid: new Map([['ana', { displayName: 'Ana' }]]) }),
}));

const backTo = vi.fn();
vi.mock('../SeasonShell', () => ({
	default: ({ backHref, title, children }: { backHref?: string; title: string; children: React.ReactNode }) => {
		backTo(backHref);
		return (
			<main>
				<h1>{title}</h1>
				{children}
			</main>
		);
	},
}));

const empty: ProgrammeData = { pool: [], odds: null, form: [], rivalry: null, storylines: [] };

beforeEach(() => {
	mock.programme = null;
	mock.loading = false;
	mock.error = null;
	backTo.mockClear();
	context.loading = false;
	context.games = [{ id: 'g', kickoff: '2026-11-24T18:00:00.000Z' }];
});

describe('Programme', () => {
	it('goes back to the game while loading', () => {
		mock.loading = true;
		render(<Programme seasonId='s' gameId='g' />);

		expect(backTo).toHaveBeenCalledWith('/s/s/g/g');
	});

	it('goes back to the game when the read failed', () => {
		mock.error = new Error('offline');
		render(<Programme seasonId='s' gameId='g' />);

		expect(backTo).toHaveBeenCalledWith('/s/s/g/g');
		expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
	});

	it('says so when nobody is in yet', () => {
		mock.programme = empty;
		render(<Programme seasonId='s' gameId='g' />);

		expect(screen.getByText('Nobody has said they are in yet')).toBeInTheDocument();
	});

	it('draws the sections it has something for', () => {
		mock.programme = {
			...empty,
			pool: ['ana'],
			form: [{ uid: 'ana', results: ['W'] }],
			storylines: [{ kind: 'debut', uid: 'ana' }],
		};
		render(<Programme seasonId='s' gameId='g' />);

		expect(screen.getByRole('heading', { name: 'Matchday' })).toBeInTheDocument();
		expect(screen.getByText('First game for Ana')).toBeInTheDocument();
		expect(screen.queryByText('Chance of topping the table')).not.toBeInTheDocument();
	});

	it('says so when the game is not in the season, rather than loading forever', () => {
		context.games = [];
		render(<Programme seasonId='s' gameId='gone' />);

		expect(screen.getByText('Game not found')).toBeInTheDocument();
		expect(backTo).toHaveBeenCalledWith('/s/s/g/gone');
	});
});
