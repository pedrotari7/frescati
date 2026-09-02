import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { colors } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import RatingMovement from './RatingMovement';

const expected = stylex.create({ gain: { color: colors.in }, loss: { color: colors.out } });

/* A size of the caller's own, which has to beat the 12px the badge defaults to. */
const caller = stylex.create({ smaller: { fontSize: 11 } });

/**
 * The zero rule is the whole reason this component exists, the team sheet and
 * the player profile each documented it and then implemented it differently,
 * with nothing pinning either. These are the two behaviours that divergence
 * turned on.
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

	// A real game routinely moves somebody by less than a point on the displayed
	// scale, and `+0` reads as a result rather than as rounding.
	it('draws nothing when the change rounds away', () => {
		const { container } = render(<RatingMovement delta={0} />);

		expect(container).toBeEmptyDOMElement();
	});

	it('draws the flat placeholder instead when given one', () => {
		render(<RatingMovement delta={0} flat={<span>—</span>} />);

		expect(screen.getByText('—')).toBeInTheDocument();
	});

	// An unrated game, not a game worth nothing. The two must not look alike.
	it('draws nothing for a game with no rating yet', () => {
		const { container } = render(<RatingMovement delta={undefined} flat={<span>—</span>} />);

		expect(container).toBeEmptyDOMElement();
	});

	// One class per property, so the caller's size being on the element is the
	// component's own size not being on it.
	it('takes a caller-chosen size', () => {
		render(<RatingMovement delta={30} sx={caller.smaller} />);

		expect(stylesOf(screen.getByText('+6'))).toEqual(expect.arrayContaining(stylesFor(caller.smaller)));
	});
});
