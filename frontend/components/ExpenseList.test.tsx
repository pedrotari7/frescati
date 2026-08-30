import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Expense } from '@shared/types';
import ExpenseList from './ExpenseList';

const expense = (over: Partial<Expense> = {}): Expense => ({
	id: 'ball',
	description: 'Match ball',
	amount: 450,
	date: '2026-08-11',
	createdAt: '2026-08-11T18:00:00.000Z',
	createdBy: 'bo',
	...over,
});

const list = (expenses: Expense[], canEdit = false, added = true) => {
	const onAdd = jest.fn().mockResolvedValue(added);
	const onDelete = jest.fn();

	render(<ExpenseList expenses={expenses} canEdit={canEdit} onAdd={onAdd} onDelete={onDelete} />);

	return { onAdd, onDelete };
};

/** Every control here is a `Button`, which sets its own busy state on the way. */
const press = async (name: string) => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

const fill = (fields: { what?: string; amount?: string }) => {
	if (fields.what !== undefined) {
		fireEvent.change(screen.getByPlaceholderText('Match ball'), { target: { value: fields.what } });
	}

	if (fields.amount !== undefined) {
		fireEvent.change(screen.getByPlaceholderText('450'), { target: { value: fields.amount } });
	}
};

describe('ExpenseList', () => {
	it('says nothing has been bought when the pot has not been spent', () => {
		list([]);

		expect(screen.getByText('Nothing bought yet.')).toBeInTheDocument();
	});

	it('lists a purchase with what it was, when it went and what it cost', () => {
		list([expense()]);

		expect(screen.getByText('Match ball')).toBeInTheDocument();
		expect(screen.getByText('Tue 11 Aug')).toBeInTheDocument();
		expect(screen.getByText('450 kr')).toBeInTheDocument();
	});

	it('offers a member no way to record or remove one', () => {
		list([expense()]);

		expect(screen.queryByRole('button', { name: 'Record a purchase' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Remove Match ball' })).not.toBeInTheDocument();
	});

	it('records what an admin typed, rounded to whole kronor and trimmed', async () => {
		const { onAdd } = list([], true);

		await press('Record a purchase');
		fill({ what: '  Vests  ', amount: '449.6' });
		await press('Record it');

		expect(onAdd).toHaveBeenCalledWith({ description: 'Vests', amount: 450, date: expect.any(String) });
		expect(screen.queryByRole('button', { name: 'Record it' })).not.toBeInTheDocument();
	});

	/** A description or an amount missing is a purchase nobody can read later. */
	it('refuses a purchase with nothing typed in it', async () => {
		list([], true);

		await press('Record a purchase');
		expect(screen.getByRole('button', { name: 'Record it' })).toBeDisabled();

		fill({ what: 'Vests', amount: '0' });
		expect(screen.getByRole('button', { name: 'Record it' })).toBeDisabled();

		fill({ amount: '450' });
		expect(screen.getByRole('button', { name: 'Record it' })).toBeEnabled();
	});

	/**
	 * The form is where the typing is, so a refused write has to leave it standing.
	 * `useWrite` has already said what went wrong.
	 */
	it('keeps the form open when the write fails', async () => {
		list([], true, false);

		await press('Record a purchase');
		fill({ what: 'Vests', amount: '450' });
		await press('Record it');

		expect(screen.getByRole('button', { name: 'Record it' })).toBeInTheDocument();
		expect(screen.getByPlaceholderText('Match ball')).toHaveValue('Vests');
	});

	it('abandons what was typed when the form is cancelled', async () => {
		list([], true);

		await press('Record a purchase');
		fill({ what: 'Vests' });
		await press('Cancel');

		await press('Record a purchase');
		expect(screen.getByPlaceholderText('Match ball')).toHaveValue('');
	});

	it('hands a removal to its caller, which is what asks first', async () => {
		const { onDelete } = list([expense()], true);

		await press('Remove Match ball');

		expect(onDelete).toHaveBeenCalledWith(expense());
	});
});
