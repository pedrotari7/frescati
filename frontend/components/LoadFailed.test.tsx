import { act, fireEvent, render, screen } from '@testing-library/react';
import LoadFailed from './LoadFailed';

describe('LoadFailed', () => {
	it('says what it could not load', () => {
		render(<LoadFailed what='this season' />);

		expect(screen.getByText(/Couldn't load this season/)).toBeInTheDocument();
	});

	it('offers no retry when there is nothing to retry with', () => {
		render(<LoadFailed what='this season' />);

		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('calls onRetry when the button is pressed', async () => {
		const onRetry = jest.fn();
		render(<LoadFailed what='the teams' onRetry={onRetry} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		});

		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
