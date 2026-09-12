import * as stylex from '@stylexjs/stylex';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Fixture } from '@shared/tournament';
import type { TournamentMatch } from '@shared/types';
import { colors } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import MatchScore from './MatchScore';

const fixture: Fixture = { order: 0, teamA: 0, teamB: 1 };

/*
 * The three lengths a side's band can have, written out rather than read off the
 * component.
 *
 * A class list says whether two elements are painted differently. It cannot say
 * which of them is shorter, so the figures themselves are the pin. Move either
 * reach and this fails, and whoever moved it has to decide again whether a draw
 * still stops short of the middle and a win still runs past it, which is the
 * whole difference between the two.
 */
const expected = stylex.create({
	won: { width: '58%', opacity: 1 },
	drew: { width: '34%', opacity: 1 },
	unpainted: { width: 0, opacity: 0 },

	/* What the two numbers are painted. The team's colour, or white where the
	   number stands on that team's own fill and would not read in it, or the
	   faint of a match with no score at all. */
	teamB: { color: colors.teamB },
	onFill: { color: colors.ink },
	unscored: { color: colors.faint },
});

/**
 * The two bands, in fixture order.
 *
 * Direct children of the row and the only aria-hidden ones, which is as close to
 * a name as decoration gets. The `>` is load-bearing: the icons inside the
 * steppers are hidden from a screen reader too.
 *
 * The count is asserted here rather than in each test. Every test below reads
 * the two sides as a pair or a loop, so a selector that stopped matching would
 * let all four of them pass against a row carrying no bands at all.
 */
const bandsOf = (container: HTMLElement) => {
	const bands = Array.from(container.querySelectorAll('li > [aria-hidden="true"]'));

	expect(bands).toHaveLength(2);

	return bands.map(stylesOf);
};

/** The two numbers, in fixture order. */
const scoresOf = () => [stylesOf(screen.getByTestId('score-Team A')), stylesOf(screen.getByTestId('score-Team B'))];

/** What the row itself carries, which is where the wash is or is not. */
const rowOf = (container: HTMLElement) => stylesOf(container.querySelector('li'));

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
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={vi.fn()} onClear={vi.fn()} />
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
				onScore={vi.fn()}
				onClear={vi.fn()}
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
				sideSize={4}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByText('Match 3 · 4 a side')).toBeInTheDocument();
	});

	it('sends a first score of zero for the untouched side when the other side is stepped', () => {
		const onScore = vi.fn();

		render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={onScore} onClear={vi.fn()} />
		);

		fireEvent.click(screen.getByRole('button', { name: 'Team A one more' }));

		expect(onScore).toHaveBeenCalledWith(1, 0);
	});

	it('increments and decrements an existing score', () => {
		const onScore = vi.fn();

		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={onScore}
				onClear={vi.fn()}
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
				onScore={vi.fn()}
				onClear={vi.fn()}
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
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: 'Team A one more' })).toBeDisabled();
		expect(screen.queryByRole('button', { name: /^Clear the score/ })).not.toBeInTheDocument();
	});

	it('clears a played match', () => {
		const onClear = vi.fn();

		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={onClear}
			/>
		);

		// Labelled with its match rather than just "Clear": a scoreboard draws
		// one of these per fixture.
		fireEvent.click(screen.getByRole('button', { name: 'Clear the score for match 1' }));

		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it('has no Clear button for an unplayed match even when scoring is allowed', () => {
		render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={vi.fn()} onClear={vi.fn()} />
		);

		expect(screen.queryByRole('button', { name: /^Clear the score/ })).not.toBeInTheDocument();
	});

	it('fills the winning side of the row and leaves the beaten one alone', () => {
		const { container } = render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 3, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		const [a, b] = bandsOf(container);

		expect(a).toEqual(expect.arrayContaining(stylesFor(expected.won)));
		expect(b).toEqual(expect.arrayContaining(stylesFor(expected.unpainted)));
	});

	it('fills the side that won whichever side of the fixture that is', () => {
		const { container } = render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 1, scoreB: 3 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		const [a, b] = bandsOf(container);

		expect(a).toEqual(expect.arrayContaining(stylesFor(expected.unpainted)));
		expect(b).toEqual(expect.arrayContaining(stylesFor(expected.won)));
	});

	it('fills both sides of a draw, and shorter than a win', () => {
		const { container } = render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 2 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		for (const side of bandsOf(container)) {
			expect(side).toEqual(expect.arrayContaining(stylesFor(expected.drew)));
			expect(side).not.toEqual(expect.arrayContaining(stylesFor(expected.won)));
		}
	});

	it('takes the wash off once there is a result to show instead', () => {
		// The wash and the fill are the same idea drawn twice, and a row wearing
		// both reads as painted whatever happened on it. A 1-0 and a 0-0 one
		// above the other were indistinguishable until this.
		const unplayed = render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={vi.fn()} onClear={vi.fn()} />
		);
		const washed = rowOf(unplayed.container);
		unplayed.unmount();

		const { container } = render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 3, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		// A background image either way, so the comparison is against the row
		// that has no result rather than against a property being absent.
		expect(rowOf(container)).not.toEqual(washed);
	});

	it('lifts a score off its own fill and leaves the other in its team colour', () => {
		// The team's colour on 55% of that same colour is about 2:1, so a number
		// standing on a fill goes white and the fill under it says whose it is.
		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 3, scoreB: 1 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		const [a, b] = scoresOf();

		expect(a).toEqual(expect.arrayContaining(stylesFor(expected.onFill)));
		expect(b).toEqual(expect.arrayContaining(stylesFor(expected.teamB)));
	});

	it('lifts both scores off a draw, since both sides are filled', () => {
		render(
			<MatchScore
				fixture={fixture}
				match={match({ scoreA: 2, scoreB: 2 })}
				sideSize={5}
				canScore
				onScore={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		for (const side of scoresOf()) {
			expect(side).toEqual(expect.arrayContaining(stylesFor(expected.onFill)));
		}
	});

	it('leaves an unscored match dimmed rather than lifted or coloured', () => {
		render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={vi.fn()} onClear={vi.fn()} />
		);

		// The third state, and the reason the tone is picked per side rather than
		// per row. An en dash in white would read as a side that had won nothing
		// and an en dash in cyan as one still to play, and only one of those is
		// what no match document means.
		for (const side of scoresOf()) {
			expect(side).toEqual(expect.arrayContaining(stylesFor(expected.unscored)));
			expect(side).not.toEqual(expect.arrayContaining(stylesFor(expected.onFill)));
		}
	});

	it('paints neither side of a match nobody has played', () => {
		// The state a scoreboard spends most of its life in, and the one that has
		// to look exactly as it did before any of this. A band here would read a
		// result off a match with no document at all.
		const { container } = render(
			<MatchScore fixture={fixture} match={undefined} sideSize={5} canScore onScore={vi.fn()} onClear={vi.fn()} />
		);

		for (const side of bandsOf(container)) {
			expect(side).toEqual(expect.arrayContaining(stylesFor(expected.unpainted)));
		}
	});
});
