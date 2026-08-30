import {
	debtStanding,
	dueId,
	duesByPlayer,
	duesFor,
	entryShare,
	feesFor,
	missingDues,
	owesForGame,
	paymentReference,
	planDues,
	summarise,
} from './finances';
import type { Due, Expense, GameResponse } from './types';

const response = (uid: string, over: Partial<GameResponse> = {}): GameResponse => ({
	uid,
	status: 'in',
	role: 'extra',
	respondedAt: '2026-03-01T18:00:00.000Z',
	updatedAt: '2026-03-01T18:00:00.000Z',
	...over,
});

const due = (id: string, over: Partial<Due> = {}): Due =>
	({
		id,
		uid: 'anna',
		kind: 'game',
		amount: 70,
		status: 'owing',
		createdAt: '2026-03-01T18:00:00.000Z',
		...over,
	}) as Due;

const expense = (amount: number): Expense => ({
	id: `e-${amount}`,
	description: 'Match ball',
	amount,
	date: '2026-03-12',
	createdBy: 'anna',
	createdAt: '2026-03-12T18:00:00.000Z',
});

describe('feesFor', () => {
	it('falls back to the defaults on a season from before finances existed', () => {
		expect(feesFor({})).toEqual({ total: 0, perGame: 70 });
	});

	it('keeps what the season actually says', () => {
		expect(feesFor({ fees: { total: 31240, perGame: 80 } })).toEqual({ total: 31240, perGame: 80 });
	});
});

describe('entryShare', () => {
	it('splits the bill equally between the squad', () => {
		expect(entryShare(31240, 20)).toBe(1562);
	});

	// 31240 across 18 is 1735.55 each. Down leaves the group ten kronor short of
	// a pitch it has already booked; up leaves it eight kronor over.
	it('rounds up, so the shares always cover the bill', () => {
		expect(entryShare(31240, 18)).toBe(1736);
		expect(entryShare(31240, 18) * 18).toBeGreaterThanOrEqual(31240);
	});

	it('is nothing when there is nobody to split it between', () => {
		expect(entryShare(31240, 0)).toBe(0);
	});

	it('is nothing when the season costs nothing', () => {
		expect(entryShare(0, 12)).toBe(0);
	});
});

describe('dueId', () => {
	it('is derived from what the charge is for, so raising it twice collides', () => {
		expect(dueId('entry', 'anna')).toBe('entry_anna');
		expect(dueId('game', 'anna', 'g-1')).toBe('game_g-1_anna');
	});
});

describe('owesForGame', () => {
	it('charges a confirmed extra who turned up', () => {
		expect(owesForGame(response('anna', { confirmOverride: true }))).toBe(true);
	});

	it('charges nobody whose In was never confirmed', () => {
		expect(owesForGame(response('anna'))).toBe(false);
	});

	it('charges no member, the entry fee covers them', () => {
		expect(owesForGame(response('anna', { role: 'member' }))).toBe(false);
	});

	it('charges no extra who said they were out', () => {
		expect(owesForGame(response('anna', { status: 'out', confirmOverride: true }))).toBe(false);
	});

	it('charges no extra who was marked absent', () => {
		expect(owesForGame(response('anna', { confirmOverride: true, absent: true }))).toBe(false);
	});

	it('reads the role off the response, so joining the squad later changes nothing', () => {
		// `role` was snapshotted as `extra` when they answered. They are a member
		// now, and they still owe for the game they played as a guest.
		expect(owesForGame(response('anna', { role: 'extra', confirmOverride: true }))).toBe(true);
	});
});

describe('planDues', () => {
	const season = { memberUids: ['anna', 'erik'], fees: { total: 800, perGame: 70 } };

	it('charges every member their share of the bill whether or not they have played', () => {
		const planned = planDues(season, []);

		expect(planned).toEqual([
			{ id: 'entry_anna', uid: 'anna', kind: 'entry', amount: 400 },
			{ id: 'entry_erik', uid: 'erik', kind: 'entry', amount: 400 },
		]);
	});

	// The bill is fixed, so a bigger squad is a smaller share each rather than
	// more money collected.
	it('splits the same bill further as the squad grows', () => {
		const bigger = planDues({ ...season, memberUids: ['anna', 'erik', 'sam', 'lena'] }, []);

		expect(bigger.map(p => p.amount)).toEqual([200, 200, 200, 200]);
	});

	it('charges an extra once per game they played', () => {
		const planned = planDues({ memberUids: [], fees: { total: 0, perGame: 70 } }, [
			{ gameId: 'g-1', responses: [response('sam', { confirmOverride: true })] },
			{ gameId: 'g-2', responses: [response('sam', { confirmOverride: true })] },
		]);

		expect(planned.map(p => p.id)).toEqual(['game_g-1_sam', 'game_g-2_sam']);
		expect(planned.every(p => p.amount === 70)).toBe(true);
	});

	it('raises nothing for a fee of zero rather than a charge for nothing', () => {
		const planned = planDues({ memberUids: ['anna'], fees: { total: 0, perGame: 0 } }, [
			{ gameId: 'g-1', responses: [response('sam', { confirmOverride: true })] },
		]);

		expect(planned).toEqual([]);
	});

	it('skips the responses that are not chargeable', () => {
		const planned = planDues({ memberUids: [], fees: { total: 0, perGame: 70 } }, [
			{
				gameId: 'g-1',
				responses: [
					response('sam', { confirmOverride: true }),
					response('pending'),
					response('absent', { confirmOverride: true, absent: true }),
					response('regular', { role: 'member' }),
				],
			},
		]);

		expect(planned.map(p => p.uid)).toEqual(['sam']);
	});
});

describe('missingDues', () => {
	it('is the planned charges nobody has raised', () => {
		const planned = planDues({ memberUids: ['anna', 'erik'], fees: { total: 800, perGame: 70 } }, []);

		expect(missingDues(planned, [due('entry_anna')]).map(p => p.id)).toEqual(['entry_erik']);
	});

	it('leaves an existing charge alone whatever it now says', () => {
		const planned = planDues({ memberUids: ['anna'], fees: { total: 400, perGame: 0 } }, []);
		const waived = due('entry_anna', { status: 'waived', settledAt: 'x', settledBy: 'y' });

		expect(missingDues(planned, [waived])).toEqual([]);
	});

	it('is empty a second time, which is what makes raising them safe to repeat', () => {
		const planned = planDues({ memberUids: ['anna', 'erik'], fees: { total: 800, perGame: 0 } }, []);
		const raised = planned.map(p => due(p.id));

		expect(missingDues(planned, raised)).toEqual([]);
	});
});

describe('summarise', () => {
	const paid = { status: 'paid', settledAt: 'x', settledBy: 'y' } as const;

	it('keeps the entry fees and the extras apart', () => {
		const summary = summarise(
			[
				due('entry_anna', { kind: 'entry', amount: 400, ...paid }),
				due('game_g-1_sam', { kind: 'game', amount: 70, ...paid }),
			],
			[expense(450)],
			800
		);

		expect(summary.entry.collected).toBe(400);
		expect(summary.extras.collected).toBe(70);
		expect(summary.extras.spent).toBe(450);
	});

	// Every expense is against the extras. The entry fees pay the bill and
	// nothing comes out of them, which is why there is no `spent` on that side to
	// assert about at all.
	it('spends only out of the extras', () => {
		const summary = summarise([], [expense(450)], 800);

		expect(summary.extras.spent).toBe(450);
		expect(summary.entry).not.toHaveProperty('spent');
	});

	it('counts what is owed separately from what is there', () => {
		const summary = summarise([due('a', { amount: 70 }), due('b', { amount: 70 })], []);

		expect(summary.extras.charged).toBe(140);
		expect(summary.extras.outstanding).toBe(140);
		expect(summary.extras.collected).toBe(0);
		expect(summary.extras.balance).toBe(0);
	});

	it('leaves a waived charge out of both collected and outstanding', () => {
		const summary = summarise([due('a', { status: 'waived', settledAt: 'x', settledBy: 'y' })], []);

		expect(summary.extras.charged).toBe(70);
		expect(summary.extras.waived).toBe(70);
		expect(summary.extras.outstanding).toBe(0);
	});

	it('lets the equipment fund go negative when the group has overspent it', () => {
		const summary = summarise([due('a', paid)], [expense(450)]);

		expect(summary.extras.balance).toBe(-380);
	});

	it('measures the entry fees against the bill rather than against spending', () => {
		const summary = summarise([due('entry_anna', { kind: 'entry', amount: 400, ...paid })], [], 800);

		expect(summary.entry.target).toBe(800);
		expect(summary.entry.short).toBe(400);
	});

	it('is short the whole bill before anybody has paid', () => {
		expect(summarise([due('entry_anna', { kind: 'entry', amount: 400 })], [], 800).entry.short).toBe(800);
	});

	// Rounding the shares up means a full squad usually pays a few kronor over.
	// A season cannot be more than paid for, so that is zero and not a negative.
	it('floors the shortfall at zero when the squad has paid over the bill', () => {
		const summary = summarise([due('entry_anna', { kind: 'entry', amount: 810, ...paid })], [], 800);

		expect(summary.entry.short).toBe(0);
	});

	it('is all zeroes with nothing to go on', () => {
		const summary = summarise([], []);

		expect(summary.entry).toEqual({ target: 0, charged: 0, collected: 0, outstanding: 0, waived: 0, short: 0 });
		expect(summary.extras).toEqual({ charged: 0, collected: 0, outstanding: 0, waived: 0, spent: 0, balance: 0 });
	});
});

describe('duesFor', () => {
	it('is one player and their total, newest charge first', () => {
		const mine = duesFor('sam', [
			due('old', { uid: 'sam', createdAt: '2026-03-01T00:00:00.000Z' }),
			due('new', { uid: 'sam', createdAt: '2026-03-08T00:00:00.000Z' }),
			due('theirs', { uid: 'anna' }),
		]);

		expect(mine.dues.map(d => d.id)).toEqual(['new', 'old']);
		expect(mine.outstanding).toBe(140);
	});

	it('counts only what is still owing', () => {
		const mine = duesFor('sam', [
			due('a', { uid: 'sam', status: 'paid', settledAt: 'x', settledBy: 'y' }),
			due('b', { uid: 'sam' }),
		]);

		expect(mine.outstanding).toBe(70);
	});
});

describe('debtStanding', () => {
	const settled = { status: 'paid', settledAt: 'x', settledBy: 'y' } as const;

	it('blocks a member who owes, and says what it is made of', () => {
		const standing = debtStanding('sam', [due('a', { uid: 'sam' }), due('b', { uid: 'sam' })], false);

		expect(standing).toMatchObject({ standing: 'blocked', outstanding: 140 });
		expect(standing.standing !== 'clear' && standing.dues.map(d => d.id)).toEqual(['a', 'b']);
	});

	// The season collects to the admin's own number, Swish refuses a payment to
	// yourself, and an admin who cannot sign up cannot mark the payment either.
	it('tells an admin they owe without blocking them', () => {
		expect(debtStanding('sam', [due('a', { uid: 'sam' })], true)).toMatchObject({
			standing: 'owing',
			outstanding: 70,
		});
	});

	it('is clear with nobody signed in', () => {
		expect(debtStanding(null, [due('a', { uid: 'sam' })], false)).toEqual({ standing: 'clear' });
	});

	it('is clear on a season that has charged nothing', () => {
		expect(debtStanding('sam', [], false)).toEqual({ standing: 'clear' });
	});

	it('is clear once every charge is paid', () => {
		expect(debtStanding('sam', [due('a', { uid: 'sam', ...settled })], false)).toEqual({ standing: 'clear' });
	});

	it('is clear on a charge that was written off', () => {
		const waived = due('a', { uid: 'sam', status: 'waived', settledAt: 'x', settledBy: 'y' });

		expect(debtStanding('sam', [waived], false)).toEqual({ standing: 'clear' });
	});

	it('counts only this player, not the rest of the book', () => {
		const standing = debtStanding('sam', [due('mine', { uid: 'sam' }), due('theirs', { uid: 'anna' })], false);

		expect(standing).toMatchObject({ standing: 'blocked', outstanding: 70 });
		expect(standing.standing !== 'clear' && standing.dues.map(d => d.id)).toEqual(['mine']);
	});

	// The amount and the list have to be the same debt. A settled charge in the
	// list would let a notice say "700 across 3 charges" over two owing ones.
	it('leaves a settled charge out of the list behind the amount', () => {
		const standing = debtStanding('sam', [due('a', { uid: 'sam' }), due('b', { uid: 'sam', ...settled })], false);

		expect(standing.standing !== 'clear' && standing.dues.map(d => d.id)).toEqual(['a']);
	});
});

describe('duesByPlayer', () => {
	const settled = { status: 'paid', settledAt: 'x', settledBy: 'y' } as const;

	it('puts whoever owes the most at the top', () => {
		const book = duesByPlayer([
			due('a', { uid: 'anna', amount: 70 }),
			due('b', { uid: 'sam', amount: 70 }),
			due('c', { uid: 'sam', amount: 70 }),
		]);

		expect(book.map(player => [player.uid, player.outstanding])).toEqual([
			['sam', 140],
			['anna', 70],
		]);
	});

	it('sinks everybody who has settled up below everybody who has not', () => {
		const book = duesByPlayer([
			due('a', { uid: 'anna', amount: 400, ...settled }),
			due('b', { uid: 'sam', amount: 70 }),
		]);

		expect(book.map(player => player.uid)).toEqual(['sam', 'anna']);
	});

	it('breaks a tie on the uid, so two equal debts never swap places', () => {
		const book = duesByPlayer([due('a', { uid: 'sam' }), due('b', { uid: 'anna' })]);

		expect(book.map(player => player.uid)).toEqual(['anna', 'sam']);
	});

	it('counts what each person was charged as well as what they still owe', () => {
		const book = duesByPlayer([
			due('a', { uid: 'anna', amount: 400, ...settled }),
			due('b', { uid: 'anna', amount: 70 }),
		]);

		expect(book[0]).toMatchObject({ uid: 'anna', charged: 470, outstanding: 70 });
		expect(book[0].dues).toHaveLength(2);
	});

	it('is empty with no charges', () => {
		expect(duesByPlayer([])).toEqual([]);
	});
});

describe('paymentReference', () => {
	it('names the season and the player, which is what a bank statement shows', () => {
		expect(paymentReference('Autumn 2026', 'Anna Berg')).toBe('Autumn 2026: Anna Berg');
	});

	it('stays inside what a Swish message will carry', () => {
		expect(paymentReference('A'.repeat(40), 'B'.repeat(40)).length).toBe(50);
	});
});
