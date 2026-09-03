import { fireEvent, render, screen } from '@testing-library/react';
import Toggle from './Toggle';

describe('Toggle', () => {
	it('renders the label and optional description', () => {
		render(<Toggle label='Reminders' description='A nudge before kickoff' checked={false} onChange={vi.fn()} />);

		expect(screen.getByText('Reminders')).toBeInTheDocument();
		expect(screen.getByText('A nudge before kickoff')).toBeInTheDocument();
	});

	it('reflects the checked state to assistive tech', () => {
		render(<Toggle label='Reminders' checked onChange={vi.fn()} />);

		expect(screen.getByRole('switch')).toBeChecked();
	});

	it('calls onChange with the flipped value when toggled', () => {
		const onChange = vi.fn();
		render(<Toggle label='Reminders' checked={false} onChange={onChange} />);

		fireEvent.click(screen.getByRole('switch'));

		expect(onChange).toHaveBeenCalledWith(true);
	});

	it('does not fire onChange while disabled', () => {
		const onChange = vi.fn();
		render(<Toggle label='Reminders' checked={false} disabled onChange={onChange} />);

		fireEvent.click(screen.getByRole('switch'));

		expect(onChange).not.toHaveBeenCalled();
	});
});
