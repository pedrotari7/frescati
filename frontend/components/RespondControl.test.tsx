import { act, fireEvent, render, screen } from '@testing-library/react';
import type { GameResponse, ResponseStatus } from '@shared/types';
import RespondControl from './RespondControl';

const answered = (status: ResponseStatus, overrides: Partial<GameResponse> = {}): GameResponse => ({
	uid: 'me',
	status,
	role: 'member',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

const notify = jest.fn();
const warn = jest.fn();

jest.mock('./Toast', () => ({
	useToast: () => ({ notify, warn }),
}));

describe('RespondControl', () => {
	beforeEach(() => jest.clearAllMocks());

	it('says which answer is yours in words, not only in colour', () => {
		render(<RespondControl response={answered('in')} onRespond={jest.fn()} onClear={jest.fn()} />);

		expect(screen.getByRole('button', { name: /You're in/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /Can't make it/ })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByRole('button', { name: /I'm in/ })).not.toBeInTheDocument();
	});

	// An extra's In does not put them on the pitch until an admin confirms the
	// spot, and the note under these buttons says so. The button must not
	// contradict it.
	it('does not tell an extra still waiting on a spot that they are in', () => {
		render(
			<RespondControl response={answered('in', { role: 'extra' })} onRespond={jest.fn()} onClear={jest.fn()} />
		);

		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.queryByText("You're in")).not.toBeInTheDocument();
	});

	it('says an extra is in once the spot is confirmed', () => {
		render(
			<RespondControl
				response={answered('in', { role: 'extra', confirmOverride: true })}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: /You're in/ })).toBeInTheDocument();
	});

	it('answers in when tapped with no existing response', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl response={undefined} onRespond={onRespond} onClear={jest.fn()} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).toHaveBeenCalledWith('in');
	});

	// The tap the whole redesign is about. It reads as "am I in?", and it used
	// to answer by taking the player out.
	it('writes nothing when the answer already given is tapped again', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);
		const onClear = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('in')} onRespond={onRespond} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /You're in/ }));
		});

		expect(onClear).not.toHaveBeenCalled();
		expect(onRespond).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /You're in/ })).toHaveAttribute('aria-pressed', 'true');
	});

	it('withdraws the answer through a button that says so', async () => {
		const onClear = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('out')} onRespond={jest.fn()} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
		});

		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it('offers nothing to withdraw until there is an answer', () => {
		render(<RespondControl response={undefined} onRespond={jest.fn()} onClear={jest.fn()} />);

		expect(screen.queryByRole('button', { name: 'Clear answer' })).not.toBeInTheDocument();
		expect(screen.getByText(/You haven't answered yet/)).toBeInTheDocument();
	});

	// The row above a small control already carries a "No answer" pill.
	it('leaves the unanswered note to the row it sits in when small', () => {
		render(<RespondControl response={undefined} onRespond={jest.fn()} onClear={jest.fn()} size='sm' />);

		expect(screen.queryByText(/You haven't answered yet/)).not.toBeInTheDocument();
	});

	it('switches straight from out to in', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);
		const onClear = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('out')} onRespond={onRespond} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).toHaveBeenCalledWith('in');
		expect(onClear).not.toHaveBeenCalled();
	});

	it('does nothing while disabled, and stops offering a withdrawal', async () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('in')} onRespond={onRespond} onClear={jest.fn()} disabled />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Can't make it/ }));
		});

		expect(onRespond).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /Can't make it/ })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Clear answer' })).not.toBeInTheDocument();
	});

	it('refuses a second tap while the first write is still in flight', async () => {
		let settle: () => void = () => {};
		const onRespond = jest.fn().mockImplementation(
			() =>
				new Promise<void>(resolve => {
					settle = resolve;
				})
		);

		render(<RespondControl response={answered('out')} onRespond={onRespond} onClear={jest.fn()} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		// Both halves are held, and visibly. The tap below used to be swallowed
		// by `write`'s own guard with the buttons still looking live, which is
		// indistinguishable from a tap that missed.
		expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
		expect(screen.getByRole('button', { name: /You're out/ })).toBeDisabled();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /You're out/ }));
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

		render(<RespondControl response={undefined} onRespond={onRespond} onClear={jest.fn()} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(warn).toHaveBeenCalledWith("Couldn't save your answer. Try again in a moment.");
		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveTextContent("I'm in");

		(console.error as jest.Mock).mockRestore();
	});

	it('warns when a withdrawal fails too', async () => {
		const onClear = jest.fn().mockRejectedValue(new Error('offline'));
		jest.spyOn(console, 'error').mockImplementation(() => {});

		render(<RespondControl response={answered('in')} onRespond={jest.fn()} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
		});

		expect(warn).toHaveBeenCalledWith("Couldn't save your answer. Try again in a moment.");
		expect(screen.getByRole('button', { name: 'Clear answer' })).toBeEnabled();

		(console.error as jest.Mock).mockRestore();
	});
});
