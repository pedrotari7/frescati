import { render, screen } from '@testing-library/react';
import type { TournamentResult } from '@shared/types';
import FullTimeLink from './FullTimeLink';

const mock = { result: null as TournamentResult | null, asked: [] as (string | null)[], from: null as string | null };

vi.mock('../lib/fullTimeFrom', () => ({
	get FULL_TIME_FROM() {
		return mock.from;
	},
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../hooks/useData', () => ({
	useTournamentResult: (seasonId: string | null) => {
		mock.asked.push(seasonId);
		return { result: mock.result, loading: false, error: null };
	},
}));

const KICKOFF = '2026-11-24T18:00:00.000Z';

const rated = (uid: string) => ({ changes: [{ uid, before: 1000, after: 1010, delta: 10 }] }) as TournamentResult;

beforeEach(() => {
	mock.result = null;
	mock.asked = [];
	mock.from = null;
});

describe('FullTimeLink', () => {
	it('links a player to their card on a played game', () => {
		mock.result = rated('me');
		render(<FullTimeLink seasonId='s' gameId='g' kickoff={KICKOFF} played />);

		expect(screen.getByRole('link', { name: /your full-time card/i })).toHaveAttribute(
			'href',
			'/s/s/g/g/full-time'
		);
	});

	it('is not there for somebody the result did not rate', () => {
		mock.result = rated('someone-else');
		render(<FullTimeLink seasonId='s' gameId='g' kickoff={KICKOFF} played />);

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('does not read the result before the game is played', () => {
		render(<FullTimeLink seasonId='s' gameId='g' kickoff={KICKOFF} played={false} />);

		expect(mock.asked.every(seasonId => seasonId === null)).toBe(true);
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('is not there for a game played before full-time cards began', () => {
		mock.result = rated('me');
		mock.from = '2026-11-27T23:00:00.000Z';
		render(<FullTimeLink seasonId='s' gameId='g' kickoff={KICKOFF} played />);

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});
});
