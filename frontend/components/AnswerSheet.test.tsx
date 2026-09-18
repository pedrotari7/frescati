import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ResponseStatus } from '@shared/types';
import AnswerSheet from './AnswerSheet';

const onPick = vi.fn().mockResolvedValue(undefined);
const onClose = vi.fn();

// Headless UI settles its own transition state a microtask after mount, so an
// unflushed render logs an act warning from inside the library on every test.
const draw = async (status?: ResponseStatus) => {
	const view = render(<AnswerSheet displayName='Alice Ng' status={status} open onClose={onClose} onPick={onPick} />);
	await act(async () => {});

	return view;
};

const tap = async (name: string) => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

describe('AnswerSheet', () => {
	beforeEach(() => vi.clearAllMocks());

	it('names who the answer is about', async () => {
		await draw();

		expect(screen.getByText('Answer for Alice Ng')).toBeInTheDocument();
	});

	it.each([
		["They're in", 'in'],
		["They're out", 'out'],
	] as const)('picks %s', async (label, answer) => {
		await draw();

		await tap(label);

		expect(onPick).toHaveBeenCalledWith(answer);
	});

	// Seeing where somebody stands is the context for moving them, so the answer
	// they already hold stays in the list rather than being filtered out of it.
	it('marks the answer they already hold and refuses to write it again', async () => {
		await draw('in');

		expect(screen.getByText('Now')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /They're in/ })).toBeDisabled();

		await tap("They're out");

		expect(onPick).toHaveBeenCalledWith('out');
	});

	it('takes the answer away entirely, which is a delete rather than a status', async () => {
		await draw('out');

		await tap('Back to no answer');

		expect(onPick).toHaveBeenCalledWith(null);
	});

	// There is no document to delete, so offering it would be offering an error.
	it('offers no way to take back an answer nobody has given', async () => {
		await draw();

		expect(screen.queryByRole('button', { name: 'Back to no answer' })).not.toBeInTheDocument();
	});

	it('closes without writing anything', async () => {
		await draw('in');

		await tap('Cancel');

		expect(onClose).toHaveBeenCalled();
		expect(onPick).not.toHaveBeenCalled();
	});
});
