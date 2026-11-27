import { fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, TournamentResult } from '@shared/types';
import MatchdayPreviewCard from './MatchdayPreviewCard';

const mock = { result: null as TournamentResult | null };

vi.mock('../../hooks/useData', () => ({
	useTournamentResult: () => ({ result: mock.result, loading: false, error: null }),
}));

const usersByUid = new Map([
	['ana', { uid: 'ana', displayName: 'Ana' } as AppUser],
	['joao', { uid: 'joao', displayName: 'João' } as AppUser],
]);

const rated = { changes: [{ uid: 'joao' }, { uid: 'ana' }] } as TournamentResult;

beforeEach(() => {
	mock.result = null;
});

describe('MatchdayPreviewCard', () => {
	it('asks for a game when none is picked', () => {
		render(<MatchdayPreviewCard seasonId='s' gameId={null} usersByUid={usersByUid} />);

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
		expect(screen.getByText('Pick a game above to preview its programme and full-time cards.')).toBeInTheDocument();
	});

	it('opens the programme for the picked game, whatever the day', () => {
		render(<MatchdayPreviewCard seasonId='s' gameId='g' usersByUid={usersByUid} />);

		expect(screen.getByRole('link', { name: 'Preview programme' })).toHaveAttribute('href', '/s/s/g/g/programme');
	});

	it('says the game has no cards until its result is confirmed', () => {
		render(<MatchdayPreviewCard seasonId='s' gameId='g' usersByUid={usersByUid} />);

		expect(screen.queryByRole('link', { name: 'Preview card' })).not.toBeInTheDocument();
		expect(screen.getByText('No full-time cards until this game has a confirmed result.')).toBeInTheDocument();
	});

	it('lists everybody the result rated, by name, and previews the one picked', () => {
		mock.result = rated;
		render(<MatchdayPreviewCard seasonId='s' gameId='g' usersByUid={usersByUid} />);

		const picker = screen.getByRole('combobox', { name: 'Whose card' });
		expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Ana', 'João']);
		expect(screen.getByRole('link', { name: 'Preview card' })).toHaveAttribute(
			'href',
			'/s/s/g/g/full-time?preview=1&player=ana'
		);

		fireEvent.change(picker, { target: { value: 'joao' } });

		expect(screen.getByRole('link', { name: 'Preview card' })).toHaveAttribute(
			'href',
			'/s/s/g/g/full-time?preview=1&player=joao'
		);
	});
});
