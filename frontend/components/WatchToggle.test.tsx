import { fireEvent, render, screen } from '@testing-library/react';
import WatchToggle from './WatchToggle';

describe('WatchToggle', () => {
	// The icon is the whole control, so the accessible name is the only thing
	// carrying what it does, there is no visible label to fall back on.
	it('says what it will do, not just what it is', () => {
		const { rerender } = render(<WatchToggle watching={false} onChange={jest.fn()} />);

		expect(screen.getByRole('switch', { name: 'Notify me when answers change' })).toBeInTheDocument();

		rerender(<WatchToggle watching onChange={jest.fn()} />);

		expect(screen.getByRole('switch', { name: 'Stop notifying me when answers change' })).toBeInTheDocument();
	});

	it('reports the state to assistive tech', () => {
		const { rerender } = render(<WatchToggle watching={false} onChange={jest.fn()} />);

		expect(screen.getByRole('switch')).not.toBeChecked();

		rerender(<WatchToggle watching onChange={jest.fn()} />);

		expect(screen.getByRole('switch')).toBeChecked();
	});

	it('calls onChange with the flipped value', () => {
		const onChange = jest.fn();
		const { rerender } = render(<WatchToggle watching={false} onChange={onChange} />);

		fireEvent.click(screen.getByRole('switch'));
		expect(onChange).toHaveBeenLastCalledWith(true);

		rerender(<WatchToggle watching onChange={onChange} />);

		fireEvent.click(screen.getByRole('switch'));
		expect(onChange).toHaveBeenLastCalledWith(false);
	});

	it('does not fire onChange while disabled', () => {
		const onChange = jest.fn();
		render(<WatchToggle watching={false} disabled onChange={onChange} />);

		fireEvent.click(screen.getByRole('switch'));

		expect(onChange).not.toHaveBeenCalled();
	});
});
