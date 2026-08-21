import { act, fireEvent, render, screen } from '@testing-library/react';
import RespondControl from './RespondControl';

const notify = jest.fn();
const warn = jest.fn();

jest.mock('./Toast', () => ({
	useToast: () => ({ notify, warn }),
}));

describe('RespondControl', () => {
	beforeEach(() => jest.clearAllMocks());

	it('marks In pressed when the current status is in', () => {
		render(<RespondControl status='in' onRespond={jest.fn()} />);

		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /Can't make it/ })).toHaveAttribute('aria-pressed', 'false');
	});

	it('answers in when tapped with no existing response', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl status={undefined} onRespond={onRespond} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).toHaveBeenCalledWith('in');
	});

	it('withdraws the answer when the current answer is tapped again', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);
		const onClear = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl status='in' onRespond={onRespond} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(onRespond).not.toHaveBeenCalled();
	});

	it('switches straight from out to in without clearing first', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);
		const onClear = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl status='out' onRespond={onRespond} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).toHaveBeenCalledWith('in');
		expect(onClear).not.toHaveBeenCalled();
	});

	it('does nothing while disabled', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl status={undefined} onRespond={onRespond} disabled />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /I'm in/ })).toBeDisabled();
	});

	it('refuses a second tap while the first write is still in flight', async () => {
		let settle: () => void = () => {};
		const onRespond = jest.fn().mockImplementation(
			() =>
				new Promise<void>(resolve => {
					settle = resolve;
				})
		);

		render(<RespondControl status='out' onRespond={onRespond} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		// Both halves are held, and visibly. The tap below used to be swallowed
		// by `handle`'s own guard with the buttons still looking live, which is
		// indistinguishable from a tap that missed.
		expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
		expect(screen.getByRole('button', { name: /Can't make it/ })).toBeDisabled();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Can't make it/ }));
		});

		expect(onRespond).toHaveBeenCalledTimes(1);
		expect(onRespond).toHaveBeenCalledWith('in');

		// And handed back the moment the write lands.
		await act(async () => {
			settle();
		});

		expect(screen.getByRole('button', { name: /I'm in/ })).toBeEnabled();
	});

	it('warns when the write fails, and clears the pending state either way', async () => {
		const onRespond = jest.fn().mockRejectedValue(new Error('offline'));
		jest.spyOn(console, 'error').mockImplementation(() => {});

		render(<RespondControl status={undefined} onRespond={onRespond} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(warn).toHaveBeenCalledWith("Couldn't save your answer. Try again in a moment.");
		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveTextContent("I'm in");

		(console.error as jest.Mock).mockRestore();
	});
});
