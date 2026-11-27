import { render, screen, within } from '@testing-library/react';
import Odds from './Odds';

const personOf = (uid: string) => ({ uid, displayName: uid.toUpperCase(), photoURL: null });

describe('Odds', () => {
	it('names what the numbers are', () => {
		render(
			<Odds
				odds={[
					{ team: 0, percent: 60 },
					{ team: 1, percent: 40 },
				]}
				squads={[]}
				personOf={personOf}
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
				squads={[]}
				personOf={personOf}
			/>
		);

		expect(screen.getByRole('listitem', { name: 'Team A, 41%' })).toBeInTheDocument();
		expect(screen.getByRole('listitem', { name: 'Team B, 33%' })).toBeInTheDocument();
		expect(screen.getByRole('listitem', { name: 'Team C, 26%' })).toBeInTheDocument();
	});

	it('shows the faces on each team, and how many more there are past six', () => {
		render(
			<Odds
				odds={[
					{ team: 0, percent: 55 },
					{ team: 1, percent: 45 },
				]}
				squads={[
					['a1', 'a2'],
					['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
				]}
				personOf={personOf}
			/>
		);

		const teamA = screen.getByRole('listitem', { name: 'Team A, 55%' });
		expect(within(teamA).getByTitle('A1')).toBeInTheDocument();
		expect(within(teamA).getByTitle('A2')).toBeInTheDocument();

		const teamB = screen.getByRole('listitem', { name: 'Team B, 45%' });
		expect(within(teamB).queryByTitle('B7')).not.toBeInTheDocument();
		expect(within(teamB).getByText('+2')).toBeInTheDocument();
	});
});
