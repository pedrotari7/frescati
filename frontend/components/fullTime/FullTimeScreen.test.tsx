import { fireEvent, render, screen } from '@testing-library/react';
import type { FullTimeCard } from '@shared/fullTime';
import FullTimeScreen from './FullTimeScreen';

const card: FullTimeCard = {
	seasonId: 's',
	gameId: 'g',
	kickoff: '2026-11-24T18:00:00.000Z',
	finalisedAt: '2026-11-24T21:00:00.000Z',
	team: 0,
	position: 1,
	shared: false,
	teamCount: 2,
	record: { won: 0, drawn: 0, lost: 1 },
	before: 1000,
	after: 990,
	delta: -10,
	highlights: [],
};

const mock = {
	card: null as FullTimeCard | null,
	loading: false,
	error: null as Error | null,
	canGoBack: false,
	isAppAdmin: false,
	asked: [] as (string | null)[],
};
const router = { back: vi.fn(), push: vi.fn() };
const seen = { mark: vi.fn(), claim: vi.fn() };
const backTo = vi.fn();
const share = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'me', isAppAdmin: mock.isAppAdmin } }) }));
vi.mock('../AppHistory', () => ({ useAppHistory: () => ({ canGoBack: mock.canGoBack }) }));
vi.mock('../SeasonProvider', () => ({ useSeasonContext: () => ({ season: { slot: { timezone: 'UTC' } } }) }));
vi.mock('../../hooks/useFullTimeCard', () => ({
	useFullTimeCard: (_season: string, _game: string, uid: string | null) => {
		mock.asked.push(uid);
		return { card: mock.card, loading: mock.loading, error: mock.error, retry: vi.fn() };
	},
}));
vi.mock('../../lib/fullTimeSeen', () => ({
	markFullTimeSeen: (seasonId: string, at: string) => seen.mark(seasonId, at),
	claimFullTimeSession: (gameId: string) => seen.claim(gameId),
}));
vi.mock('./FullTimeCard', () => ({
	default: ({ onShare, onDone }: { onShare: () => void; onDone: () => void }) => (
		<div>
			<button onClick={onShare}>Share</button>
			<button onClick={onDone}>Done</button>
		</div>
	),
}));
vi.mock('./useShareCard', () => ({ useShareCard: () => ({ swatches: null, share }) }));
vi.mock('../SeasonShell', () => ({
	default: ({ backHref, children }: { backHref?: string; children: React.ReactNode }) => {
		backTo(backHref);
		return <main>{children}</main>;
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	mock.card = null;
	mock.loading = false;
	mock.error = null;
	mock.canGoBack = false;
	mock.isAppAdmin = false;
	mock.asked = [];
});

describe('FullTimeScreen', () => {
	it('goes back to the season home while loading', () => {
		mock.loading = true;
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		expect(backTo).toHaveBeenCalledWith('/s/s');
	});

	it('goes back to the season home when the read failed', () => {
		mock.error = new Error('offline');
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		expect(backTo).toHaveBeenCalledWith('/s/s');
		expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
	});

	it('tells somebody who did not play', () => {
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		expect(screen.getByText('You did not play in this game')).toBeInTheDocument();
	});

	it('claims the session so the home does not send them straight back', () => {
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		expect(seen.claim).toHaveBeenCalledWith('g');
	});

	it('marks the card seen and goes back on Done', () => {
		mock.card = card;
		mock.canGoBack = true;
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		expect(seen.mark).toHaveBeenCalledWith('s', card.finalisedAt);
		expect(router.back).toHaveBeenCalled();
	});

	it('goes up to the season home on Done when there is no back', () => {
		mock.card = card;
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		expect(router.push).toHaveBeenCalledWith('/s/s');
	});

	it('shares the image and marks the card seen', () => {
		mock.card = card;
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		fireEvent.click(screen.getByRole('button', { name: 'Share' }));

		expect(share).toHaveBeenCalled();
		expect(seen.mark).toHaveBeenCalledWith('s', card.finalisedAt);
	});

	it('marks the card seen as soon as it is shown, so leaving by the chevron counts', () => {
		mock.card = card;
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		expect(seen.mark).toHaveBeenCalledWith('s', card.finalisedAt);
	});

	it('marks nothing seen while there is no card', () => {
		render(<FullTimeScreen seasonId='s' gameId='g' />);

		expect(seen.mark).not.toHaveBeenCalled();
	});

	describe('as a preview', () => {
		it('shows an app admin the player they asked for', () => {
			mock.isAppAdmin = true;
			mock.card = card;
			render(<FullTimeScreen seasonId='s' gameId='g' preview player='ana' />);

			expect(mock.asked.at(-1)).toBe('ana');
			expect(screen.getByText('Preview')).toBeInTheDocument();
		});

		it('marks nothing seen and claims nothing, so the real card still takes over', () => {
			mock.isAppAdmin = true;
			mock.card = card;
			render(<FullTimeScreen seasonId='s' gameId='g' preview player='ana' />);

			fireEvent.click(screen.getByRole('button', { name: 'Done' }));
			fireEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(seen.mark).not.toHaveBeenCalled();
			expect(seen.claim).not.toHaveBeenCalled();
		});

		it('names the player who did not play, rather than saying you did not', () => {
			mock.isAppAdmin = true;
			render(<FullTimeScreen seasonId='s' gameId='g' preview player='ana' />);

			expect(screen.getByText('They did not play in this game')).toBeInTheDocument();
		});

		it('shows anybody else only their own card', () => {
			mock.card = card;
			render(<FullTimeScreen seasonId='s' gameId='g' preview player='ana' />);

			expect(mock.asked.at(-1)).toBe('me');
			expect(screen.queryByText('Preview')).not.toBeInTheDocument();
		});
	});
});
