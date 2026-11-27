import { render, screen } from '@testing-library/react';
import type { TournamentResult } from '@shared/types';
import FullTimeLink from './FullTimeLink';

const mock = { result: null as TournamentResult | null, asked: [] as (string | null)[] };

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../hooks/useData', () => ({
	useTournamentResult: (seasonId: string | null) => {
		mock.asked.push(seasonId);
		return { result: mock.result, loading: false, error: null };
	},
}));

const rated = (uid: string) => ({ changes: [{ uid, before: 1000, after: 1010, delta: 10 }] }) as TournamentResult;

beforeEach(() => {
	mock.result = null;
	mock.asked = [];
});

describe('FullTimeLink', () => {
	it('links a player to their card on a played game', () => {
		mock.result = rated('me');
		render(<FullTimeLink seasonId='s' gameId='g' played />);

		expect(screen.getByRole('link', { name: /your full-time card/i })).toHaveAttribute(
			'href',
			'/s/s/g/g/full-time'
		);
	});

	it('is not there for somebody the result did not rate', () => {
		mock.result = rated('someone-else');
		render(<FullTimeLink seasonId='s' gameId='g' played />);

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('does not read the result before the game is played', () => {
		render(<FullTimeLink seasonId='s' gameId='g' played={false} />);

		expect(mock.asked.every(seasonId => seasonId === null)).toBe(true);
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});
});
