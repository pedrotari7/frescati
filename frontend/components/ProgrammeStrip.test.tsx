import { render, screen } from '@testing-library/react';
import type { Game, Season } from '@shared/types';
import type { Programme } from '../hooks/useProgramme';
import ProgrammeLink from './ProgrammeLink';
import ProgrammeStrip from './ProgrammeStrip';

const mock = { programme: null as Programme | null, enabled: [] as boolean[] };

vi.mock('../hooks/useProgramme', () => ({
	useProgramme: (_season: string, _game: string, enabled: boolean) => {
		mock.enabled.push(enabled);
		return { programme: enabled ? mock.programme : null, loading: false, error: null, retry: vi.fn() };
	},
}));
vi.mock('../hooks/useData', () => ({
	useUsersByUid: () => ({ usersByUid: new Map([['ana', { displayName: 'Ana' }]]) }),
}));

const season = { id: 's', responseDeadlineHours: 3, slot: { timezone: 'UTC' } } as unknown as Season;
const game = {
	id: 'g',
	kickoff: '2026-09-01T17:00:00.000Z',
	endsAt: '2026-09-01T18:30:00.000Z',
	status: 'scheduled',
} as Game;
const gameDay = new Date('2026-09-01T09:00:00.000Z');
const dayBefore = new Date('2026-08-31T09:00:00.000Z');

const base: Programme = { pool: ['ana'], odds: null, form: [], rivalry: null, storylines: [] };

beforeEach(() => {
	mock.programme = null;
	mock.enabled = [];
});

describe('ProgrammeStrip', () => {
	it('draws nothing the day before, and opens no listener', () => {
		const { container } = render(<ProgrammeStrip game={game} season={season} now={dayBefore} />);

		expect(container).toBeEmptyDOMElement();
		expect(mock.enabled.every(enabled => !enabled)).toBe(true);
	});

	it('shows the odds on game day', () => {
		mock.programme = {
			...base,
			odds: [
				{ team: 0, percent: 41 },
				{ team: 1, percent: 33 },
				{ team: 2, percent: 26 },
			],
		};
		render(<ProgrammeStrip game={game} season={season} now={gameDay} />);

		const link = screen.getByRole('link', { name: /matchday programme/i });
		expect(link).toHaveAttribute('href', '/s/s/g/g/programme');
		expect(link).toHaveTextContent('A 41% · B 33% · C 26%');
	});

	it('leads with a storyline before there are teams', () => {
		mock.programme = { ...base, storylines: [{ kind: 'debut', uid: 'ana' }] };
		render(<ProgrammeStrip game={game} season={season} now={gameDay} />);

		expect(screen.getByRole('link', { name: /matchday programme/i })).toHaveTextContent('First game for Ana');
	});

	it('still points to the programme with nothing to lead with', () => {
		mock.programme = base;
		render(<ProgrammeStrip game={game} season={season} now={gameDay} />);

		expect(screen.getByRole('link', { name: /matchday programme/i })).toBeInTheDocument();
	});
});

describe('ProgrammeLink', () => {
	it('is there on game day', () => {
		render(<ProgrammeLink game={game} season={season} now={gameDay} />);

		expect(screen.getByRole('link', { name: /matchday programme/i })).toHaveAttribute('href', '/s/s/g/g/programme');
	});

	it('is not there the day before', () => {
		render(<ProgrammeLink game={game} season={season} now={dayBefore} />);

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});
});
