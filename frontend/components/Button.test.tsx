import { act, fireEvent, render, screen } from '@testing-library/react';
import Button from './Button';

describe('Button', () => {
	it('renders its children and fires onClick', async () => {
		const onClick = jest.fn();

		render(<Button onClick={onClick}>Save</Button>);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		});

		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('is disabled while a passed disabled prop is true', () => {
		render(<Button disabled>Save</Button>);

		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it('disables itself and shows a spinner while an async onClick is pending', async () => {
		let resolveClick: () => void = () => {};
		const onClick = jest.fn(
			() =>
				new Promise<void>(resolve => {
					resolveClick = resolve;
				})
		);

		render(<Button onClick={onClick}>Save</Button>);
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();

		await act(async () => {
			resolveClick();
		});

		expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('does nothing when clicked with no onClick handler', () => {
		render(<Button>Save</Button>);

		expect(() => fireEvent.click(screen.getByRole('button', { name: 'Save' }))).not.toThrow();
	});
});
