import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, Due } from '@shared/types';
import type { PlayerLedger } from '@shared/finances';
import DuesBook from './DuesBook';

/**
 * `Due` is a union, so a `Partial<Due>` of it admits a paid charge nobody signed.
 * The fixtures are split the way the type is instead, one per side of it.
 */
type Fields = Partial<Pick<Due, 'id' | 'uid' | 'kind' | 'amount' | 'gameId' | 'note' | 'createdAt'>>;

const due = (over: Fields = {}): Due => ({
	id: 'entry_anna',
	uid: 'anna',
	kind: 'entry',
	amount: 1736,
	status: 'owing',
	createdAt: '2026-08-01T10:00:00.000Z',
	...over,
});

const settled = (status: 'paid' | 'waived', over: Fields = {}): Due => ({
	...due(over),
	status,
	settledAt: '2026-08-03T10:00:00.000Z',
	settledBy: 'bo',
});

const ledger = (over: Partial<PlayerLedger> = {}): PlayerLedger => {
	const dues = over.dues ?? [due()];

	return {
		uid: 'anna',
		dues,
		outstanding: dues.reduce((total, one) => (one.status === 'owing' ? total + one.amount : total), 0),
		charged: dues.reduce((total, one) => total + one.amount, 0),
		...over,
	};
};

const usersByUid = new Map<string, AppUser>([
	['anna', { uid: 'anna', displayName: 'Anna Berg', photoURL: null } as AppUser],
	['bo', { uid: 'bo', displayName: 'Bo Falk', photoURL: null } as AppUser],
]);

/** The settle controls are `Button`s, which set their own busy state on the way. */
const press = async (name: string) => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

const labelFor = (one: Due): string => (one.kind === 'entry' ? 'Entry fee' : 'Tue 8 Sep');

/** How long ago, written the way the row's caller stores it. */
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

const book = (
	players: PlayerLedger[],
	canSettle = false,
	chase: { chasedAt?: Map<string, string>; canChase?: boolean } = {}
) => {
	const onSettle = vi.fn();
	const onDelete = vi.fn();
	const onRemind = vi.fn();

	render(
		<DuesBook
			book={players}
			usersByUid={usersByUid}
			labelFor={labelFor}
			canSettle={canSettle}
			chasedAt={chase.chasedAt}
			onSettle={onSettle}
			onDelete={onDelete}
			onRemind={chase.canChase ? onRemind : undefined}
		/>
	);

	return { onSettle, onDelete, onRemind };
};

describe('DuesBook', () => {
	it('says nothing has been charged when no charge has been raised', () => {
		book([]);

		expect(screen.getByText('Nothing charged yet.')).toBeInTheDocument();
	});

	it('leads with what somebody still owes rather than what they were charged', () => {
		book([ledger()]);

		expect(screen.getByText('Anna Berg')).toBeInTheDocument();
		expect(screen.getByText('1 736 kr charged')).toBeInTheDocument();
		expect(screen.getByText('1 736 kr owing')).toBeInTheDocument();
	});

	it('reads as settled once nothing is owing, whatever was charged', () => {
		book([ledger({ dues: [settled('paid')] })]);

		expect(screen.getByText('Settled')).toBeInTheDocument();
		expect(screen.queryByText(/owing/)).not.toBeInTheDocument();
	});

	/**
	 * A full season is a couple of hundred charges and about fifteen people, so
	 * the row is the person and the charges are one tap down.
	 */
	it('keeps the charges themselves behind the row', () => {
		book([ledger()]);

		expect(screen.queryByText('Entry fee')).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { expanded: false }));

		expect(screen.getByText('Entry fee')).toBeInTheDocument();
		expect(screen.getByText('Owing')).toBeInTheDocument();
	});

	it('shows the note on a charge an admin raised by hand', () => {
		book([ledger({ dues: [due({ note: 'Borrowed the ball money' })] })]);

		fireEvent.click(screen.getByRole('button', { expanded: false }));

		expect(screen.getByText('Borrowed the ball money')).toBeInTheDocument();
	});

	it('offers a member no way to settle anything', () => {
		book([ledger()]);

		fireEvent.click(screen.getByRole('button', { expanded: false }));

		expect(screen.queryByRole('button', { name: /^Mark/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
	});

	/** The label names the charge as well as the person, since a row holds several. */
	it('lets an admin mark one charge paid or write it off', async () => {
		const { onSettle } = book([ledger()], true);

		fireEvent.click(screen.getByRole('button', { expanded: false }));

		await press("Mark Anna Berg's Entry fee paid");
		expect(onSettle).toHaveBeenCalledWith(due(), 'paid');

		await press("Write off Anna Berg's Entry fee");
		expect(onSettle).toHaveBeenLastCalledWith(due(), 'waived');
	});

	it('offers a settled charge back to owing, and nothing else', async () => {
		const paid = settled('paid');
		const { onSettle } = book([ledger({ dues: [paid] })], true);

		fireEvent.click(screen.getByRole('button', { expanded: false }));

		expect(screen.queryByRole('button', { name: /^Mark/ })).not.toBeInTheDocument();

		await press("Put Anna Berg's Entry fee back to owing");
		expect(onSettle).toHaveBeenCalledWith(paid, 'owing');
	});

	it('hands a removal to its caller, which is what asks first', async () => {
		const { onDelete } = book([ledger()], true);

		fireEvent.click(screen.getByRole('button', { expanded: false }));
		await press("Remove Anna Berg's Entry fee charge");

		expect(onDelete).toHaveBeenCalledWith(due());
	});

	it('closes one row when another opens, so only one person is ever expanded', () => {
		book([ledger(), ledger({ uid: 'bo', dues: [due({ id: 'entry_bo', uid: 'bo', amount: 900 })] })]);

		const [anna, bo] = screen.getAllByRole('button', { expanded: false });

		fireEvent.click(anna);
		expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);

		fireEvent.click(bo);
		expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
		expect(screen.getByText('900 kr')).toBeInTheDocument();
	});

	it('names a uid with no profile behind it rather than drawing an empty row', () => {
		book([ledger({ uid: 'forgotten', dues: [due({ id: 'entry_forgotten', uid: 'forgotten' })] })]);

		expect(screen.getByText('Unknown player')).toBeInTheDocument();
	});

	describe('chasing a payment', () => {
		// The screen draws this list twice and only the admin's copy passes a
		// handler, so a member reading their own row must not find a bell on it.
		it('draws no bell without a handler to hang it on', () => {
			book([ledger()], true);

			expect(screen.queryByRole('button', { name: /^Remind/ })).not.toBeInTheDocument();
		});

		it('draws none for somebody who owes nothing, however much they were charged', () => {
			book([ledger({ dues: [settled('paid')] })], true, { canChase: true });

			expect(screen.queryByRole('button', { name: /^Remind/ })).not.toBeInTheDocument();
		});

		// The label is the only text on it, so it carries both the person and the
		// figure. A row holds one bell and fifteen rows hold fifteen.
		it('names the person and the amount on the bell', async () => {
			const { onRemind } = book([ledger()], true, { canChase: true });

			await press('Remind Anna Berg about 1 736 kr');

			expect(onRemind).toHaveBeenCalledWith(ledger());
		});

		// A button inside a button is markup no browser keeps, and the expander is
		// the whole row. Pressing the bell must not also open the charges under it.
		it('leaves the row shut when the bell is pressed', async () => {
			book([ledger()], true, { canChase: true });

			await press('Remind Anna Berg about 1 736 kr');

			expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
			expect(screen.queryByText('Entry fee')).not.toBeInTheDocument();
		});

		it('says when somebody was last chased', () => {
			book([ledger()], true, { canChase: true, chasedAt: new Map([['anna', daysAgo(2)]]) });

			expect(screen.getByText(/chased 2 days ago/)).toBeInTheDocument();
		});

		it('says nothing at all about a chase that has never happened', () => {
			book([ledger()], true, { canChase: true });

			expect(screen.queryByText(/chased/)).not.toBeInTheDocument();
		});

		// Off the map keyed by uid, not off the row's position, since the book
		// re-sorts as debts are settled.
		it('reads the date off the person it belongs to', () => {
			book([ledger(), ledger({ uid: 'bo', dues: [due({ id: 'entry_bo', uid: 'bo', amount: 900 })] })], true, {
				canChase: true,
				chasedAt: new Map([['bo', daysAgo(1)]]),
			});

			expect(screen.getByText(/1 736 kr charged$/)).toBeInTheDocument();
			expect(screen.getByText(/900 kr charged · chased yesterday/)).toBeInTheDocument();
		});
	});
});
