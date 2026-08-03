import { render, screen } from '@testing-library/react';
import type { TeamStanding } from '@shared/types';
import StandingsTable from './StandingsTable';

const standing = (overrides: Partial<TeamStanding> & Pick<TeamStanding, 'team' | 'position'>): TeamStanding => ({
	played: 3,
	won: 0,
	drawn: 0,
	lost: 0,
	goalsFor: 0,
	goalsAgainst: 0,
	goalDifference: 0,
	points: 0,
	...overrides,
});

describe('StandingsTable', () => {
	it('orders rows by position, not by input order', () => {
		render(
			<StandingsTable
				standings={[standing({ team: 1, position: 1 }), standing({ team: 0, position: 0 })]}
				unequal={false}
			/>
		);

		const teamCells = screen.getAllByRole('row').slice(1).map(row => row.querySelectorAll('td')[1]?.textContent);
		expect(teamCells).toEqual(['A', 'B']);
	});

	it('marks first, second, third and fourth with ordinals', () => {
		render(
			<StandingsTable
				standings={[
					standing({ team: 0, position: 0 }),
					standing({ team: 1, position: 1 }),
					standing({ team: 2, position: 2 }),
					standing({ team: 3, position: 3 }),
				]}
				unequal={false}
			/>
		);

		expect(screen.getByText('1st')).toBeInTheDocument();
		expect(screen.getByText('2nd')).toBeInTheDocument();
		expect(screen.getByText('3rd')).toBeInTheDocument();
		expect(screen.getByText('4th')).toBeInTheDocument();
	});

	it('flags a shared position on every row that shares it', () => {
		render(
			<StandingsTable
				standings={[standing({ team: 0, position: 0 }), standing({ team: 1, position: 0 })]}
				unequal={false}
			/>
		);

		expect(screen.getAllByText('=1st')).toHaveLength(2);
	});

	it('signs a positive goal difference but not a negative one', () => {
		render(
			<StandingsTable
				standings={[
					standing({ team: 0, position: 0, goalDifference: 4 }),
					standing({ team: 1, position: 1, goalDifference: -4 }),
				]}
				unequal={false}
			/>
		);

		expect(screen.getByText('+4')).toBeInTheDocument();
		expect(screen.getByText('-4')).toBeInTheDocument();
	});

	it('explains points-per-match ordering only when the games played are unequal', () => {
		const { rerender } = render(<StandingsTable standings={[standing({ team: 0, position: 0 })]} unequal={false} />);

		expect(screen.queryByText(/points per match/)).not.toBeInTheDocument();

		rerender(<StandingsTable standings={[standing({ team: 0, position: 0 })]} unequal={true} />);

		expect(screen.getByText(/points per match/)).toBeInTheDocument();
	});
});
