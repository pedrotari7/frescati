import { FieldValue } from 'firebase-admin/firestore';
import { confirmSeason } from '../src/confirmSeason';
import * as push from '../src/lib/push';
import type { Due, KitItem, Season } from '../../shared/types';
import { callRequest, clearFirestore, getDb, writeSeason, writeUser } from './helpers';

/**
 * Turning a season's yeses into its squad.
 *
 * The decisions, who is in, who keeps the admin role, what each owes and where
 * the kit goes, are `planConfirmation`'s and are tested in `shared/`. What is
 * left for here is the part a pure function cannot hold: who may press it, that
 * pressing it twice does nothing, and that the writes land together or not at
 * all.
 */

const SEASON = 'draft-1';
const SOURCE = 'last-year';

const answer = (uid: string, status: 'yes' | 'no') =>
	getDb().doc(`seasons/${SEASON}/signups/${uid}`).set({
		uid,
		status,
		answeredAt: '2026-08-01T10:00:00.000Z',
		updatedAt: '2026-08-01T10:00:00.000Z',
	});

const draft = (overrides: Partial<Season> = {}) =>
	writeSeason(SEASON, {
		status: 'draft',
		memberUids: [],
		adminUids: ['a', 'd'],
		fees: { total: 1000, perGame: 0 },
		...overrides,
	});

const call = (auth: { uid: string; admin?: boolean } = { uid: 'a' }) =>
	confirmSeason.run(callRequest({ seasonId: SEASON }, auth));

const readSeason = async () => (await getDb().doc(`seasons/${SEASON}`).get()).data() as Season;

const readDues = async (): Promise<Record<string, Due>> => {
	const snapshot = await getDb().collection(`seasons/${SEASON}/dues`).get();

	return Object.fromEntries(snapshot.docs.map(doc => [doc.id, doc.data() as Due]));
};

const readKit = async (): Promise<KitItem[]> => {
	const snapshot = await getDb().collection(`seasons/${SEASON}/kit`).get();

	return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as KitItem);
};

let sent: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
	await clearFirestore();
	sent = vi
		.spyOn(push, 'sendSeasonConfirmed')
		.mockResolvedValue({ pushed: 1, emailed: 0 } as Awaited<ReturnType<typeof push.sendSeasonConfirmed>>);

	await draft();
	await answer('a', 'yes');
	await answer('b', 'yes');
	await answer('c', 'no');
});

describe('confirmSeason', () => {
	it('makes the yeses the squad and keeps only the admins among them', async () => {
		const result = await call();
		const season = await readSeason();

		expect(season).toMatchObject({ status: 'active', memberUids: ['a', 'b'], adminUids: ['a'], confirmedBy: 'a' });
		expect(season.confirmedAt).toEqual(expect.any(String));
		expect(result).toEqual({ members: 2, share: 500, demoted: ['d'] });
	});

	it('charges each member their share, owing', async () => {
		await call();

		const dues = await readDues();

		expect(Object.keys(dues).sort()).toEqual(['entry_a', 'entry_b']);
		expect(dues.entry_a).toMatchObject({ uid: 'a', kind: 'entry', amount: 500, status: 'owing' });
		expect(dues.entry_b).toMatchObject({ uid: 'b', kind: 'entry', amount: 500, status: 'owing' });
	});

	it('leaves an entry charge that already exists as it is', async () => {
		await getDb()
			.doc(`seasons/${SEASON}/dues/entry_a`)
			.set({ uid: 'a', kind: 'entry', amount: 400, status: 'paid', createdAt: 'then' });

		await call();

		const dues = await readDues();

		expect(dues.entry_a).toMatchObject({ amount: 400, status: 'paid', createdAt: 'then' });
		expect(dues.entry_b).toMatchObject({ amount: 500, status: 'owing' });
		expect(sent).toHaveBeenCalledWith('a', expect.objectContaining({ share: 500 }));
	});

	it('makes the confirmer the admin when an app admin confirms and no season admin said yes', async () => {
		await draft({ adminUids: ['d'] });
		await answer('z', 'yes');

		await call({ uid: 'z', admin: true });

		expect((await readSeason()).adminUids).toEqual(['z']);
	});

	it('writes no charges for a season with no fee', async () => {
		await draft();
		await getDb().doc(`seasons/${SEASON}`).update({ fees: FieldValue.delete() });

		const result = await call();

		expect(await readDues()).toEqual({});
		expect(result.share).toBe(0);
	});

	it('does nothing the second time', async () => {
		await call();
		const before = await readSeason();

		await expect(call()).rejects.toMatchObject({ code: 'failed-precondition' });

		expect(await readSeason()).toEqual(before);
		expect(Object.keys(await readDues())).toHaveLength(2);
	});

	it('lets exactly one of two simultaneous presses through', async () => {
		const results = await Promise.allSettled([call(), call()]);

		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(Object.keys(await readDues())).toHaveLength(2);
	});

	it('refuses an admin who has not said yes themselves', async () => {
		await expect(call({ uid: 'd' })).rejects.toMatchObject({ code: 'failed-precondition' });

		expect((await readSeason()).status).toBe('draft');
	});

	it('refuses somebody who does not run the season', async () => {
		await expect(call({ uid: 'b' })).rejects.toMatchObject({ code: 'permission-denied' });
		await expect(confirmSeason.run(callRequest({ seasonId: SEASON }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('lets an app admin who said yes confirm a season they do not run', async () => {
		await answer('z', 'yes');

		await expect(call({ uid: 'z', admin: true })).resolves.toMatchObject({ members: 3 });
	});

	it('refuses a season that is not there', async () => {
		await expect(confirmSeason.run(callRequest({ seasonId: 'nope' }, { uid: 'a' }))).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	describe('kit', () => {
		beforeEach(async () => {
			await writeSeason(SOURCE, { status: 'archived' });
			await draft({ copiedFrom: SOURCE });

			const kit = getDb().collection(`seasons/${SOURCE}/kit`);
			await kit.add({ name: 'Match ball', kind: 'ball', holderUid: 'b', updatedBy: 'b', updatedAt: 'then' });
			await kit.add({ name: 'Blue vests', kind: 'vests', holderUid: 'z', updatedBy: 'z', updatedAt: 'then' });
		});

		it('hands kit to its holder, or to whoever confirmed when the holder is not in', async () => {
			await call();

			const kit = await readKit();

			expect(Object.fromEntries(kit.map(item => [item.name, item.holderUid]))).toEqual({
				'Match ball': 'b',
				'Blue vests': 'a',
			});
			expect(kit.every(item => item.updatedAt !== 'then')).toBe(true);
		});
	});

	describe('telling people', () => {
		it('sends each new member their share, and locks everybody but an admin', async () => {
			await call();

			expect(sent).toHaveBeenCalledTimes(2);
			expect(sent).toHaveBeenCalledWith(
				'a',
				expect.objectContaining({ seasonId: SEASON, share: 500, blocked: false })
			);
			expect(sent).toHaveBeenCalledWith('b', expect.objectContaining({ share: 500, blocked: true }));
		});

		it('names the number the season fee is paid to, not the extras one', async () => {
			await draft({
				fees: {
					total: 1000,
					perGame: 70,
					swish: '0700000000',
					payees: { entry: { swish: '0701111111' }, extras: { swish: '0702222222' } },
				},
			});

			await call();

			expect(sent).toHaveBeenCalledWith('a', expect.objectContaining({ swish: '0701111111' }));
		});

		it('stays silent for a quiet season', async () => {
			await draft({ quiet: true });

			await call();

			expect(sent).not.toHaveBeenCalled();
			expect((await readSeason()).status).toBe('active');
		});

		it('does not unwind the confirmation when a send fails', async () => {
			await writeUser('b');
			sent.mockRejectedValueOnce(new Error('fcm is down'));

			await expect(call()).resolves.toMatchObject({ members: 2 });

			expect((await readSeason()).status).toBe('active');
		});
	});
});
