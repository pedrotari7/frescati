import { fireEvent, render, screen } from '@testing-library/react';
import DatePicker from './DatePicker';

describe('DatePicker', () => {
	it('shows a placeholder when there is no value', () => {
		render(<DatePicker value='' onChange={vi.fn()} />);

		expect(screen.getByText('Select a date')).toBeInTheDocument();
	});

	it('shows the formatted date when there is a value', () => {
		render(<DatePicker value='2026-09-01' onChange={vi.fn()} />);

		expect(screen.getByText('Tue 1 Sep')).toBeInTheDocument();
	});

	it('opens a calendar with week numbers on click', async () => {
		render(<DatePicker value='2026-09-01' onChange={vi.fn()} />);

		fireEvent.click(screen.getByRole('button'));

		expect(await screen.findByText('Wk')).toBeInTheDocument();
		// ISO week 36 of 2026 contains 1 September.
		expect(screen.getByText('36')).toBeInTheDocument();
	});

	it('reports the picked date and closes the calendar', async () => {
		const onChange = vi.fn();
		render(<DatePicker value='2026-09-01' onChange={onChange} />);

		fireEvent.click(screen.getByRole('button'));

		const day = await screen.findByRole('button', { name: /September 15th, 2026/i });
		fireEvent.click(day);

		expect(onChange).toHaveBeenCalledWith('2026-09-15');
		expect(screen.queryByText('Wk')).not.toBeInTheDocument();
	});
});
