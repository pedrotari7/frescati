import { render, screen } from '@testing-library/react';
import type { Due, Game, Season } from '@shared/types';
import type { DebtStanding } from '@shared/finances';
import SeasonDebtNotice from './SeasonDebtNotice';

jest.mock('./Toast', () => ({
	useToast: () => ({ notify: jest.fn(), warn: jest.fn() }),
}));

const season = (overrides: Partial<Season> = {}): Season =>
	({
		id: 'season-1',
		name: 'Fall 2026',
		slot: { timezone: 'Europe/Stockholm' },
		fees: { total: 0, perGame: 70, swish: '0701234567' },
		...overrides,
	}) as Season;

const games = [{ id: 'game-1', kickoff: '2026-03-10T18:00:00.000Z' }] as Game[];

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

const notice = (debt: DebtStanding, seasonOverrides: Partial<Season> = {}) =>
	render(<SeasonDebtNotice debt={debt} season={season(seasonOverrides)} games={games} displayName='Anna Berg' />);

describe('SeasonDebtNotice', () => {
	it('says nothing at all to somebody who is paid up', () => {
		const { container } = notice({ standing: 'clear' });

		expect(container).toBeEmptyDOMElement();
	});

	// The first thought somebody blocked by a number has is that the number is
	// wrong, and a charge you cannot see is a charge you cannot dispute.
	it('itemises the charges the total is made of', () => {
		notice({
			standing: 'blocked',
			outstanding: 140,
			dues: [charge(), charge({ id: 'entry_anna', kind: 'entry', gameId: undefined, amount: 70 })],
		});

		expect(screen.getByText('140 kr')).toBeInTheDocument();
		expect(screen.getByText('Tue 10 Mar')).toBeInTheDocument();
		expect(screen.getByText('Entry fee')).toBeInTheDocument();
	});

	it('tells a blocked player what it costs them, and what still works', () => {
		notice({ standing: 'blocked', outstanding: 70, dues: [charge()] });

		expect(screen.getByText(/cannot sign up for another game/)).toBeInTheDocument();
		expect(screen.getByText(/Saying you cannot make it still works/)).toBeInTheDocument();
	});

	// An admin owes their share and is never locked out by it, so the line under
	// the same amount has to be a different line.
	it('tells an admin what they owe without claiming anything is locked', () => {
		notice({ standing: 'owing', outstanding: 70, dues: [charge()] });

		expect(screen.getByText(/nothing is locked/)).toBeInTheDocument();
		expect(screen.queryByText(/cannot sign up for another game/)).not.toBeInTheDocument();
	});

	it('offers Swish when the season collects through it', () => {
		notice({ standing: 'blocked', outstanding: 70, dues: [charge()] });

		expect(screen.getByText('Pay with Swish')).toBeInTheDocument();
	});

	it('says who to ask when it does not', () => {
		const noSwish = { fees: { total: 0, perGame: 70 } };

		notice({ standing: 'blocked', outstanding: 70, dues: [charge()] }, noSwish);

		expect(screen.queryByText('Pay with Swish')).not.toBeInTheDocument();
		expect(screen.getByText(/ask an admin where to send it/)).toBeInTheDocument();
	});

	// Paying and being marked paid are separate events, and only an admin can do
	// the second. Without this the notice reads as a thing that clears itself.
	it('says a payment has to be marked before this clears', () => {
		notice({ standing: 'blocked', outstanding: 70, dues: [charge()] });

		expect(screen.getByText(/An admin has to mark the payment/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /See the whole book/ })).toHaveAttribute(
			'href',
			'/s/season-1/finances'
		);
	});
});
