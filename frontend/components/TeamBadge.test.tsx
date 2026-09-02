import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { colors } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import TeamBadge, { teamName, teamStyle } from './TeamBadge';

/* B's bib, as a fill rather than as ink. */
const expected = stylex.create({ filled: { backgroundColor: colors.teamB } });

describe('teamName', () => {
	it('names the first four teams A through D', () => {
		expect([0, 1, 2, 3].map(teamName)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('falls back to a 1-indexed number past the known styles', () => {
		expect(teamName(4)).toBe('5');
	});
});

describe('teamStyle', () => {
	it('gives each of the four teams a different colour', () => {
		const fills = [0, 1, 2, 3].map(index => teamStyle(index).fill);

		expect(new Set(fills).size).toBe(4);
	});

	it('falls back to the first bib rather than to nothing', () => {
		expect(teamStyle(9)).toBe(teamStyle(0));
	});
});

describe('TeamBadge', () => {
	it('shows the team letter', () => {
		render(<TeamBadge index={2} />);

		expect(screen.getByText('C')).toBeInTheDocument();
	});

	it('fills the badge with the team colour rather than tinting the letter', () => {
		render(<TeamBadge index={1} />);

		expect(stylesOf(screen.getByText('B'))).toEqual(expect.arrayContaining(stylesFor(expected.filled)));
	});
});
