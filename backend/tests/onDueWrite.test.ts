import { onDueWrite } from '../src/onDueWrite';
import type { Debtor, Due, DueStatus } from '../../shared/types';
import { clearFirestore, getDb, writeSeason, writtenEvent } from './helpers';

const SEASON_ID = 'season-1';
const PLAYER = 'player-1';
const OTHER = 'player-2';

/**
 * The marker the security rule reads. Read back off the database rather than
 * asserted on the handler's return, because the rule reads the document and
 * nothing else, so the document is the claim.
 */
const readMarker = async (uid = PLAYER): Promise<Debtor | undefined> => {
	const snapshot = await getDb().doc(`seasons/${SEASON_ID}/debtors/${uid}`).get();

	return snapshot.exists ? (snapshot.data() as Debtor) : undefined;
};

const aDue = (uid: string, amount: number, status: DueStatus = 'owing'): Due =>
	({
		uid,
		kind: 'entry',
		amount,
		status,
		createdAt: '2026-08-30T09:00:00.000Z',
		...(status === 'owing' ? {} : { settledAt: '2026-08-30T10:00:00.000Z', settledBy: 'admin-1' }),
	}) as Due;

/** A charge in the database, since the handler recomputes from the collection. */
const raise = async (id: string, uid: string, amount: number, status: DueStatus = 'owing'): Promise<Due> => {
	const due = aDue(uid, amount, status);
	await getDb().doc(`seasons/${SEASON_ID}/dues/${id}`).set(due);

	return due;
};

const remove = (id: string) => getDb().doc(`seasons/${SEASON_ID}/dues/${id}`).delete();

/** A charge write as the trigger sees it. */
const dueEvent = (dueId: string, before: unknown, after: unknown) =>
	writtenEvent({ seasonId: SEASON_ID, dueId }, before, after);

describe('onDueWrite', () => {
	beforeEach(async () => {
		await clearFirestore();
		await writeSeason(SEASON_ID);
	});

	it('marks a player who has just been charged', async () => {
		const due = await raise('entry_player-1', PLAYER, 500);

		await onDueWrite.run(dueEvent('entry_player-1', undefined, due));

		expect(await readMarker()).toMatchObject({ uid: PLAYER, outstanding: 500, charges: 1 });
	});

	it('adds up every charge they still owe, not the one that moved', async () => {
		await raise('entry_player-1', PLAYER, 500);
		const second = await raise('game_g1_player-1', PLAYER, 60);

		await onDueWrite.run(dueEvent('game_g1_player-1', undefined, second));

		expect(await readMarker()).toMatchObject({ outstanding: 560, charges: 2 });
	});

	it('leaves nobody else marked', async () => {
		const due = await raise('entry_player-1', PLAYER, 500);

		await onDueWrite.run(dueEvent('entry_player-1', undefined, due));

		expect(await readMarker(OTHER)).toBeUndefined();
	});

	it('clears the mark once the last charge is paid', async () => {
		const owing = await raise('entry_player-1', PLAYER, 500);
		await onDueWrite.run(dueEvent('entry_player-1', undefined, owing));

		const paid = await raise('entry_player-1', PLAYER, 500, 'paid');
		await onDueWrite.run(dueEvent('entry_player-1', owing, paid));

		expect(await readMarker()).toBeUndefined();
	});

	it('counts a waived charge as settled', async () => {
		const owing = await raise('entry_player-1', PLAYER, 500);
		const waived = await raise('entry_player-1', PLAYER, 500, 'waived');

		await onDueWrite.run(dueEvent('entry_player-1', owing, waived));

		expect(await readMarker()).toBeUndefined();
	});

	it('keeps the mark while one of two charges is still owing', async () => {
		const entry = await raise('entry_player-1', PLAYER, 500);
		await raise('game_g1_player-1', PLAYER, 60);

		const paid = await raise('entry_player-1', PLAYER, 500, 'paid');
		await onDueWrite.run(dueEvent('entry_player-1', entry, paid));

		expect(await readMarker()).toMatchObject({ outstanding: 60, charges: 1 });
	});

	it('clears the mark when the charge is removed rather than settled', async () => {
		const due = await raise('entry_player-1', PLAYER, 500);
		await onDueWrite.run(dueEvent('entry_player-1', undefined, due));

		await remove('entry_player-1');
		await onDueWrite.run(dueEvent('entry_player-1', due, undefined));

		expect(await readMarker()).toBeUndefined();
	});

	// A delta applied twice is silently wrong from then on, and a Cloud Function
	// is retried. This is the whole reason the handler recounts the collection
	// instead of adding the amount that moved.
	it('changes nothing when it runs again over a state that is already right', async () => {
		const due = await raise('entry_player-1', PLAYER, 500);

		await onDueWrite.run(dueEvent('entry_player-1', undefined, due));
		const first = await readMarker();

		await onDueWrite.run(dueEvent('entry_player-1', undefined, due));

		expect(await readMarker()).toEqual(first);
	});

	// Deleting a season runs `recursiveDelete`, which comes through here once per
	// charge it takes. Recomputing then writes a mark under a season that is
	// already gone, and nothing ever comes back for it.
	it('writes no mark for a charge deleted with the season it belonged to', async () => {
		const due = await raise('entry_player-1', PLAYER, 500);
		await getDb().doc(`seasons/${SEASON_ID}`).delete();

		await onDueWrite.run(dueEvent('entry_player-1', due, undefined));

		expect(await readMarker()).toBeUndefined();
	});

	// The mark is written whole, so anything the chase put on it has to be carried
	// across by hand. Losing it would tell the books nobody had ever been chased
	// every time a charge moved, which is exactly when an admin is looking.
	it('keeps when somebody was last chased across a recompute', async () => {
		const entry = await raise('entry_player-1', PLAYER, 500);
		await onDueWrite.run(dueEvent('entry_player-1', undefined, entry));
		await getDb().doc(`seasons/${SEASON_ID}/debtors/${PLAYER}`).update({ remindedAt: '2026-08-28T18:00:00.000Z' });

		const second = await raise('game_g1_player-1', PLAYER, 60);
		await onDueWrite.run(dueEvent('game_g1_player-1', undefined, second));

		expect(await readMarker()).toMatchObject({ outstanding: 560, remindedAt: '2026-08-28T18:00:00.000Z' });
	});

	// It is a fact about a debt, not about a person, so it dies with the debt.
	// Otherwise the next charge they pick up would arrive already chased.
	it('forgets the chase when the debt is settled', async () => {
		const owing = await raise('entry_player-1', PLAYER, 500);
		await onDueWrite.run(dueEvent('entry_player-1', undefined, owing));
		await getDb().doc(`seasons/${SEASON_ID}/debtors/${PLAYER}`).update({ remindedAt: '2026-08-28T18:00:00.000Z' });

		const paid = await raise('entry_player-1', PLAYER, 500, 'paid');
		await onDueWrite.run(dueEvent('entry_player-1', owing, paid));

		const later = await raise('game_g1_player-1', PLAYER, 60);
		await onDueWrite.run(dueEvent('game_g1_player-1', undefined, later));

		expect(await readMarker()).toMatchObject({ outstanding: 60 });
		expect((await readMarker())?.remindedAt).toBeUndefined();
	});

	it('recomputes both people when a charge changes hands', async () => {
		const before = await raise('hand-raised', PLAYER, 500);
		await raise('entry_player-1', PLAYER, 200);
		const after = await raise('hand-raised', OTHER, 500);

		await onDueWrite.run(dueEvent('hand-raised', before, after));

		expect(await readMarker(PLAYER)).toMatchObject({ outstanding: 200, charges: 1 });
		expect(await readMarker(OTHER)).toMatchObject({ outstanding: 500, charges: 1 });
	});
});
