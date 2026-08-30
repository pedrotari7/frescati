'use client';

import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Expense } from '@shared/types';
import { formatCivilDate, formatSek } from '@shared/format';
import Button from './Button';
import { Field, TextInput } from './Field';
import { ListCard, ListEmpty } from './Section';

/** Today as a civil date, which is what an expense carries. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * What the money went on.
 *
 * Readable by anybody signed in, unlike the charges above it, because a ball
 * names no person. That asymmetry is the point: an extra who has just paid 70
 * kronor can see it turn into equipment without being shown who else is behind
 * on their fees.
 *
 * Nothing here says which pot it came out of, because there is only one it can:
 * the entry fees pay the season's bill and the extras' fees are the equipment
 * money. Nothing about who fronted the cash either, and no reimbursement flag.
 * This is a record of what the group bought, and a group of fifteen settles who
 * owes who a beer without an app.
 */
const ExpenseList = ({
	expenses,
	canEdit,
	onAdd,
	onDelete,
}: {
	expenses: Expense[];
	canEdit: boolean;
	onAdd: (expense: { description: string; amount: number; date: string }) => Promise<boolean>;
	onDelete: (expense: Expense) => void;
}) => {
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState({ description: '', amount: '', date: today() });

	const amount = Number(form.amount);
	const valid = form.description.trim().length > 0 && Number.isFinite(amount) && amount > 0 && !!form.date;

	// Emptied on the way out either way, so the form is never holding a
	// description from Tuesday against a date from last week. A refused write is
	// the one case it stays put: `useWrite` has already said what went wrong, and
	// the typing is the thing to try again with.
	const close = () => {
		setForm({ description: '', amount: '', date: today() });
		setAdding(false);
	};

	const handleAdd = async () => {
		if (!valid) return;

		const ok = await onAdd({
			description: form.description.trim(),
			amount: Math.round(amount),
			date: form.date,
		});

		if (ok) close();
	};

	return (
		<div className='space-y-3'>
			<ListCard>
				{expenses.length === 0 ? (
					<ListEmpty>Nothing bought yet.</ListEmpty>
				) : (
					expenses.map(expense => (
						<div key={expense.id} className='flex items-center gap-3 py-3'>
							<div className='min-w-0 flex-1'>
								<p className='text-ink truncate text-sm font-medium'>{expense.description}</p>
								<p className='text-faint mt-0.5 text-xs'>{formatCivilDate(expense.date)}</p>
							</div>

							<span className='text-ink text-sm tabular-nums'>{formatSek(expense.amount)}</span>

							{canEdit && (
								<Button
									size='sm'
									variant='ghost'
									aria-label={`Remove ${expense.description}`}
									onClick={() => onDelete(expense)}
								>
									<TrashIcon className='size-4' aria-hidden='true' />
								</Button>
							)}
						</div>
					))
				)}
			</ListCard>

			{canEdit &&
				(adding ? (
					<section className='glass space-y-4 rounded-2xl p-5'>
						<h3 className='text-ink font-semibold'>Record a purchase</h3>

						<Field label='What was it'>
							<TextInput
								value={form.description}
								onChange={e => setForm({ ...form, description: e.target.value })}
								placeholder='Match ball'
								maxLength={100}
							/>
						</Field>

						<Field label='How much, in kronor'>
							<TextInput
								value={form.amount}
								onChange={e => setForm({ ...form, amount: e.target.value })}
								inputMode='numeric'
								placeholder='450'
							/>
						</Field>

						<Field label='When the money left'>
							<TextInput
								type='date'
								value={form.date}
								onChange={e => setForm({ ...form, date: e.target.value })}
							/>
						</Field>

						<div className='flex gap-3'>
							<Button variant='primary' fullWidth onClick={handleAdd} disabled={!valid}>
								Record it
							</Button>
							<Button variant='ghost' fullWidth onClick={close}>
								Cancel
							</Button>
						</div>
					</section>
				) : (
					<Button variant='secondary' fullWidth onClick={() => setAdding(true)}>
						<PlusIcon className='size-4' aria-hidden='true' />
						Record a purchase
					</Button>
				))}
		</div>
	);
};

export default ExpenseList;
