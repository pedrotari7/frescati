import { render, screen } from '@testing-library/react';
import RatingMovement from './RatingMovement';

/**
 * The zero rule is the whole reason this component exists, the team sheet and
 * the player profile each documented it and then implemented it differently,
 * with nothing pinning either. These are the two behaviours that divergence
 * turned on.
 */
describe('RatingMovement', () => {
	it('signs a gain and colours it', () => {
		render(<RatingMovement delta={30} />);

		expect(screen.getByText('+6')).toHaveClass('text-in');
	});

	it('colours a loss without adding a sign of its own', () => {
		render(<RatingMovement delta={-30} />);

		expect(screen.getByText('-6')).toHaveClass('text-out');
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

	it('takes a caller-chosen size', () => {
		render(<RatingMovement delta={30} className='text-[11px]' />);

		expect(screen.getByText('+6')).toHaveClass('text-[11px]');
	});
});
