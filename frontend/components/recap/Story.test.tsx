import { fireEvent, render, screen } from '@testing-library/react';
import Story from './Story';

const slides = ['One', 'Two', 'Three'].map(text => <p key={text}>{text}</p>);

describe('Story', () => {
	it('starts on the first slide with nothing behind it', () => {
		render(<Story slides={slides} onLast={vi.fn()} />);

		expect(screen.getByText('One')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
	});

	it('moves with the two halves of the screen', () => {
		render(<Story slides={slides} onLast={vi.fn()} />);

		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(screen.getByText('Two')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
		expect(screen.getByText('One')).toBeInTheDocument();
	});

	it('moves with the arrow keys', () => {
		render(<Story slides={slides} onLast={vi.fn()} />);

		fireEvent.keyDown(window, { key: 'ArrowRight' });
		expect(screen.getByText('Two')).toBeInTheDocument();

		fireEvent.keyDown(window, { key: 'ArrowLeft' });
		expect(screen.getByText('One')).toBeInTheDocument();
	});

	it('moves with a swipe, and ignores a tap that wandered', () => {
		render(<Story slides={slides} onLast={vi.fn()} />);
		const stage = screen.getByTestId('story');

		fireEvent.pointerDown(stage, { clientX: 200 });
		fireEvent.pointerUp(stage, { clientX: 100 });
		expect(screen.getByText('Two')).toBeInTheDocument();

		fireEvent.pointerDown(stage, { clientX: 100 });
		fireEvent.pointerUp(stage, { clientX: 120 });
		expect(screen.getByText('Two')).toBeInTheDocument();

		fireEvent.pointerDown(stage, { clientX: 100 });
		fireEvent.pointerUp(stage, { clientX: 200 });
		expect(screen.getByText('One')).toBeInTheDocument();
	});

	it('says when the last slide is reached, once, and goes no further', () => {
		const onLast = vi.fn();
		render(<Story slides={slides} onLast={onLast} />);

		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(onLast).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(screen.getByText('Three')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

		fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(onLast).toHaveBeenCalledTimes(1);
	});

	it('shows how far along it is', () => {
		render(<Story slides={slides} onLast={vi.fn()} />);

		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
	});
});
