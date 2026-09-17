import { fireEvent, render, screen } from '@testing-library/react';
import PlayedSection from './PlayedSection';

const noop = () => {};

describe('PlayedSection', () => {
	// A heading with a Show button that reveals nothing is worse than no heading,
	// and a season opens with no games played at all.
	it('draws nothing at all when nothing has been played', () => {
		const { container } = render(
			<PlayedSection count={0} open={false} onToggle={noop}>
				<p>Last week</p>
			</PlayedSection>
		);

		expect(container).toBeEmptyDOMElement();
	});

	it('counts the games in its heading', () => {
		render(
			<PlayedSection count={7} open={false} onToggle={noop}>
				<p>Last week</p>
			</PlayedSection>
		);

		expect(screen.getByText('Played (7)')).toBeInTheDocument();
	});

	// The point of the thing: closed it costs a heading and a count rather than
	// a scroll past twenty rows of football that has already happened.
	it('holds the rows back until it is opened', () => {
		const { rerender } = render(
			<PlayedSection count={1} open={false} onToggle={noop}>
				<p>Last week</p>
			</PlayedSection>
		);

		expect(screen.queryByText('Last week')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();

		rerender(
			<PlayedSection count={1} open onToggle={noop}>
				<p>Last week</p>
			</PlayedSection>
		);

		expect(screen.getByText('Last week')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
	});

	// The open state belongs to the screen, so the button only reports the tap.
	it('reports a tap without deciding what it means', () => {
		const onToggle = vi.fn();

		render(
			<PlayedSection count={1} open={false} onToggle={onToggle}>
				<p>Last week</p>
			</PlayedSection>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Show' }));

		expect(onToggle).toHaveBeenCalledTimes(1);
	});
});
