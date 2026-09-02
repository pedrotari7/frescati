import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { colors } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import StatusPill from './StatusPill';

/*
 * The colours the tones are meant to come out as, written here so the test says
 * which one it means. A property compiles to the same class wherever it is
 * written, so carrying that class is carrying that colour.
 */
const expected = stylex.create({
	muted: { color: colors.muted },
	in: { color: colors.in },
	out: { color: colors.out },
});

const caller = stylex.create({ spaced: { marginLeft: 8 } });

describe('StatusPill', () => {
	it('defaults to the neutral tone', () => {
		render(<StatusPill>Waiting</StatusPill>);

		expect(stylesOf(screen.getByText('Waiting'))).toEqual(expect.arrayContaining(stylesFor(expected.muted)));
	});

	it('renders the tone-specific text colour', () => {
		render(<StatusPill tone='in'>In</StatusPill>);

		expect(stylesOf(screen.getByText('In'))).toEqual(expect.arrayContaining(stylesFor(expected.in)));
	});

	it('accepts a caller style alongside the tone', () => {
		render(
			<StatusPill tone='out' sx={caller.spaced}>
				Out
			</StatusPill>
		);

		expect(stylesOf(screen.getByText('Out'))).toEqual(
			expect.arrayContaining(stylesFor(expected.out, caller.spaced))
		);
	});
});
