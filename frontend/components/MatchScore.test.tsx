import { fireEvent, render, screen } from '@testing-library/react';
import type { Fixture } from '@shared/tournament';
import type { TournamentMatch } from '@shared/types';
import MatchScore from './MatchScore';

const fixture: Fixture = { order: 0, teamA: 0, teamB: 1 };

const match = (overrides: Partial<TournamentMatch>): TournamentMatch => ({
	order: 0,
	teamA: 0,
	teamB: 1,
	scoreA: 0,
	scoreB: 0,
	updatedBy: 'someone',
	updatedAt: '2026-09-01T19:00:00.000Z',
	...overrides,
});

describe('MatchScore', () => {
	it('shows a dash on both sides for an unplayed match', () => {
		render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={jest.fn()} onClear={jest.fn()} />
		);

		expect(screen.getAllByText('–')).toHaveLength(2);
	});

	it('shows the recorded score once a match has been played', () => {
		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 3, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('3')).toBeInTheDocument();
		expect(screen.getByText('1')).toBeInTheDocument();
	});

	it('names the fixture order and side size', () => {
		render(
			<MatchScore
				fixture={{ order: 2, teamA: 0, teamB: 1 }}
				match={undefined}
				sideSize={6}
				canScore
				onScore={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Match 3 · 6 a side')).toBeInTheDocument();
	});

	it('sends a first score of zero for the untouched side when the other side is stepped', () => {
		const onScore = jest.fn();

		render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={onScore} onClear={jest.fn()} />
		);

		fireEvent.click(screen.getByRole('button', { name: 'Team A one more' }));

		expect(onScore).toHaveBeenCalledWith(1, 0);
	});

	it('increments and decrements an existing score', () => {
		const onScore = jest.fn();

		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={onScore}
				onClear={jest.fn()}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Team B one more' }));
		expect(onScore).toHaveBeenCalledWith(2, 2);

		fireEvent.click(screen.getByRole('button', { name: 'Team A one fewer' }));
		expect(onScore).toHaveBeenCalledWith(1, 1);
	});

	it('never steps a score below zero', () => {
		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 0, scoreB: 0 })}
				sideSize={5}
				canScore
				onScore={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: 'Team A one fewer' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Team B one fewer' })).toBeDisabled();
	});

	it('disables both steppers and hides Clear when the caller cannot score', () => {
		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 1 })}
				sideSize={5}
				canScore={false}
				onScore={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: 'Team A one more' })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
	});

	it('clears a played match', () => {
		const onClear = jest.fn();

		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={jest.fn()}
				onClear={onClear}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it('has no Clear button for an unplayed match even when scoring is allowed', () => {
		render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={jest.fn()} onClear={jest.fn()} />
		);

		expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
	});
});
