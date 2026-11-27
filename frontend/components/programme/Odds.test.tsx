import { render, screen } from '@testing-library/react';
import Odds from './Odds';

describe('Odds', () => {
	it('names what the numbers are', () => {
		render(
			<Odds
				odds={[
					{ team: 0, percent: 60 },
					{ team: 1, percent: 40 },
				]}
			/>
		);

		expect(screen.getByText('Chance of topping the table')).toBeInTheDocument();
	});

	it('gives each team a row with its percentage', () => {
		render(
			<Odds
				odds={[
					{ team: 0, percent: 41 },
					{ team: 1, percent: 33 },
					{ team: 2, percent: 26 },
				]}
			/>
		);

		expect(screen.getByRole('listitem', { name: 'Team A, 41%' })).toBeInTheDocument();
		expect(screen.getByRole('listitem', { name: 'Team B, 33%' })).toBeInTheDocument();
		expect(screen.getByRole('listitem', { name: 'Team C, 26%' })).toBeInTheDocument();
	});
});
