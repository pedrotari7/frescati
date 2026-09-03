import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

const Trigger = () => {
	const { notify, warn } = useToast();

	return (
		<>
			<button type='button' onClick={() => notify('Saved')}>
				notify
			</button>
			<button type='button' onClick={() => warn('Failed')}>
				warn
			</button>
		</>
	);
};

describe('useToast', () => {
	it('defaults to a no-op outside a provider, so a component under test never hangs', () => {
		expect(() => render(<Trigger />)).not.toThrow();

		fireEvent.click(screen.getByText('notify'));

		expect(screen.queryByText('Saved')).not.toBeInTheDocument();
	});
});

describe('ToastProvider', () => {
	it('shows a success message on notify', () => {
		render(
			<ToastProvider>
				<Trigger />
			</ToastProvider>
		);

		fireEvent.click(screen.getByText('notify'));

		expect(screen.getByText('Saved')).toBeInTheDocument();
	});

	it('shows a warning message on warn', () => {
		render(
			<ToastProvider>
				<Trigger />
			</ToastProvider>
		);

		fireEvent.click(screen.getByText('warn'));

		expect(screen.getByText('Failed')).toBeInTheDocument();
	});

	it('dismisses a toast when it is tapped', () => {
		render(
			<ToastProvider>
				<Trigger />
			</ToastProvider>
		);

		fireEvent.click(screen.getByText('notify'));
		fireEvent.click(screen.getByText('Saved'));

		expect(screen.queryByText('Saved')).not.toBeInTheDocument();
	});

	it('auto-dismisses a toast after its display window', () => {
		vi.useFakeTimers();

		render(
			<ToastProvider>
				<Trigger />
			</ToastProvider>
		);

		act(() => {
			fireEvent.click(screen.getByText('notify'));
		});
		expect(screen.getByText('Saved')).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(4500);
		});
		expect(screen.queryByText('Saved')).not.toBeInTheDocument();

		vi.useRealTimers();
	});

	it('keeps only the most recent three toasts visible', () => {
		render(
			<ToastProvider>
				<Trigger />
			</ToastProvider>
		);

		fireEvent.click(screen.getByText('notify'));
		fireEvent.click(screen.getByText('notify'));
		fireEvent.click(screen.getByText('notify'));
		fireEvent.click(screen.getByText('warn'));

		expect(screen.getAllByText('Saved')).toHaveLength(2);
		expect(screen.getByText('Failed')).toBeInTheDocument();
	});
});

describe('dismissing', () => {
	// The tap used to remove the toast and leave its timeout running, to fire
	// into an empty list a few seconds later.
	it('cancels the timer when a toast is tapped away', () => {
		vi.useFakeTimers();

		try {
			render(
				<ToastProvider>
					<Trigger />
				</ToastProvider>
			);

			act(() => {
				fireEvent.click(screen.getByText('notify'));
			});

			act(() => {
				fireEvent.click(screen.getByText('Saved'));
			});

			expect(screen.queryByText('Saved')).not.toBeInTheDocument();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('drops its pending timers on unmount', () => {
		vi.useFakeTimers();

		try {
			const { unmount } = render(
				<ToastProvider>
					<Trigger />
				</ToastProvider>
			);

			act(() => {
				fireEvent.click(screen.getByText('notify'));
			});

			expect(vi.getTimerCount()).toBe(1);

			unmount();

			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
