import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { colors } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import RatingMovement from './RatingMovement';

const expected = stylex.create({
	gain: { color: colors.in },
	loss: { color: colors.out },
	level: { color: colors.faint },
});

/* A size of the caller's own, which has to beat the 12px the badge defaults to. */
const caller = stylex.create({ smaller: { fontSize: 11 } });

/**
 * A display point is five Elo, so most of these are about the deltas under one.
 * The badge has to keep the direction the rounding took away, and it has to
 * tell that apart from a game that moved nobody.
 */
describe('RatingMovement', () => {
	it('signs a gain and colours it', () => {
		render(<RatingMovement delta={30} />);

		expect(stylesOf(screen.getByText('+6'))).toEqual(expect.arrayContaining(stylesFor(expected.gain)));
	});

	it('colours a loss without adding a sign of its own', () => {
		render(<RatingMovement delta={-30} />);

		expect(stylesOf(screen.getByText('-6'))).toEqual(expect.arrayContaining(stylesFor(expected.loss)));
	});

	// The squad in the middle of a team sheet, between two reading +2 and -2.
	// Blank said the game did nothing to them, which is not what happened.
	it('signs a gain that rounds away', () => {
		render(<RatingMovement delta={1} />);

		expect(stylesOf(screen.getByText('+0'))).toEqual(expect.arrayContaining(stylesFor(expected.gain)));
	});

	it('signs a loss that rounds away', () => {
		render(<RatingMovement delta={-1} />);

		expect(stylesOf(screen.getByText('-0'))).toEqual(expect.arrayContaining(stylesFor(expected.loss)));
	});

	// Nothing to round and no direction to report, so it takes neither colour.
	it('leaves a movement of exactly nothing unsigned', () => {
		render(<RatingMovement delta={0} />);

		expect(stylesOf(screen.getByText('0'))).toEqual(expect.arrayContaining(stylesFor(expected.level)));
	});

	// An unrated game, not a game worth nothing. The two must not look alike.
	it('draws nothing for a game with no rating yet', () => {
		const { container } = render(<RatingMovement delta={undefined} />);

		expect(container).toBeEmptyDOMElement();
	});

	// One class per property, so the caller's size being on the element is the
	// component's own size not being on it.
	it('takes a caller-chosen size', () => {
		render(<RatingMovement delta={30} sx={caller.smaller} />);

		expect(stylesOf(screen.getByText('+6'))).toEqual(expect.arrayContaining(stylesFor(caller.smaller)));
	});
});
