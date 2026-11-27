import { fireEvent, render, screen } from '@testing-library/react';
import type { FullTimeCard as Card } from '@shared/fullTime';
import FullTimeCard from './FullTimeCard';

vi.mock('../recap/Confetti', () => ({ default: () => <div data-testid='confetti' /> }));

const card: Card = {
	seasonId: 's',
	gameId: 'g',
	kickoff: '2026-11-24T18:00:00.000Z',
	finalisedAt: '2026-11-24T21:00:00.000Z',
	team: 1,
	position: 0,
	shared: false,
	teamCount: 3,
	record: { won: 3, drawn: 1, lost: 0 },
	before: 1100,
	after: 1110,
	delta: 10,
	highlights: [{ kind: 'runExtended', count: 4 }],
};

const renderCard = (overrides: Partial<Card> = {}) => {
	const onShare = vi.fn();
	const onDone = vi.fn();
	render(
		<FullTimeCard card={{ ...card, ...overrides }} timezone='Europe/Stockholm' onShare={onShare} onDone={onDone} />
	);

	return { onShare, onDone };
};

describe('FullTimeCard', () => {
	it('says full time and the date', () => {
		renderCard();

		expect(screen.getByText('Full time')).toBeInTheDocument();
		expect(screen.getByText('Tuesday 24 Nov')).toBeInTheDocument();
	});

	it('shows the team, where it finished and its record', () => {
		renderCard();

		expect(screen.getByText('Team B')).toBeInTheDocument();
		expect(screen.getByText('1st of 3')).toBeInTheDocument();
		expect(screen.getByText('W 3 · D 1 · L 0')).toBeInTheDocument();
	});

	it('says level first on a shared top place', () => {
		renderCard({ shared: true });

		expect(screen.getByText('Level first')).toBeInTheDocument();
	});

	it('shows the rating move with the badge the rest of the app uses', () => {
		renderCard();

		expect(screen.getByLabelText('Rating')).toHaveTextContent('72');
		expect(screen.getByText('+2')).toBeInTheDocument();
	});

	it('tells each highlight', () => {
		renderCard();

		expect(screen.getByText('4 wins in a row')).toBeInTheDocument();
	});

	it('throws confetti for a win', () => {
		renderCard();
		expect(screen.getByTestId('confetti')).toBeInTheDocument();
	});

	it('throws no confetti for anything but a win', () => {
		renderCard({ position: 1 });
		expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
	});

	it('shares and closes', () => {
		const { onShare, onDone } = renderCard();

		fireEvent.click(screen.getByRole('button', { name: 'Share' }));
		fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		expect(onShare).toHaveBeenCalled();
		expect(onDone).toHaveBeenCalled();
	});
});
