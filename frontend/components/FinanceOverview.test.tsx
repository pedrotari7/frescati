import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import type { FinanceSummary } from '@shared/finances';
import { colors } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import FinanceOverview from './FinanceOverview';

/* A headline the group is square on reads green, one it is carrying reads red. */
const expected = stylex.create({ covered: { color: colors.in }, overdrawn: { color: colors.out } });

const books = (
	entry: Partial<FinanceSummary['entry']> = {},
	extras: Partial<FinanceSummary['extras']> = {}
): FinanceSummary => ({
	entry: { charged: 0, collected: 0, outstanding: 0, waived: 0, target: 0, short: 0, ...entry },
	extras: { charged: 0, collected: 0, outstanding: 0, waived: 0, spent: 0, balance: 0, ...extras },
});

describe('FinanceOverview', () => {
	it('says the season is free when nobody has set a bill', () => {
		render(<FinanceOverview summary={books()} memberCount={18} />);

		expect(screen.getByTestId('season-shortfall')).toHaveTextContent('Free');
		expect(screen.getByText('No bill has been set for this season.')).toBeInTheDocument();
	});

	it('leads with what is left of the bill, and says what it is split between', () => {
		render(
			<FinanceOverview
				summary={books({ charged: 31248, collected: 29504, outstanding: 1744, target: 31240, short: 1736 })}
				memberCount={18}
			/>
		);

		expect(screen.getByTestId('season-shortfall')).toHaveTextContent('1 736 kr to go');
		expect(screen.getByText('31 240 kr for the season, split between 18 members.')).toBeInTheDocument();
	});

	/**
	 * Rounding the shares up means a full squad usually pays a few kronor over the
	 * bill, so the covered case is what a finished season looks like rather than an
	 * exact match, and it must not read as change the group is owed.
	 */
	it('reads as paid for once the collected shares cover the bill', () => {
		render(<FinanceOverview summary={books({ collected: 31248, target: 31240, short: 0 })} memberCount={18} />);

		expect(screen.getByTestId('season-shortfall')).toHaveTextContent('Paid for');
		expect(stylesOf(screen.getByTestId('season-shortfall'))).toEqual(
			expect.arrayContaining(stylesFor(expected.covered))
		);
	});

	it('names the one member a bill is split between without pluralising them', () => {
		render(<FinanceOverview summary={books({ target: 900, short: 900 })} memberCount={1} />);

		expect(screen.getByText('900 kr for the season, split between 1 member.')).toBeInTheDocument();
	});

	it('draws the written-off row only when something has been written off', () => {
		const { unmount } = render(<FinanceOverview summary={books({ target: 900, short: 900 })} memberCount={2} />);

		expect(screen.queryByText('Written off')).not.toBeInTheDocument();

		unmount();
		render(<FinanceOverview summary={books({ target: 900, short: 900, waived: 450 })} memberCount={2} />);

		expect(screen.getByText('Written off')).toBeInTheDocument();
	});

	/** The ball cost more than the two guests put in, so the group is carrying it. */
	it('shows an equipment pot in the red as a negative balance', () => {
		render(<FinanceOverview summary={books({}, { collected: 140, spent: 450, balance: -310 })} memberCount={18} />);

		expect(screen.getByTestId('equipment-balance')).toHaveTextContent('-310 kr');
		expect(stylesOf(screen.getByTestId('equipment-balance'))).toEqual(
			expect.arrayContaining(stylesFor(expected.overdrawn))
		);
	});
});
