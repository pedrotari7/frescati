import { listPayees } from '../src/listPayees';
import { callRequest, clearFirestore, getDb } from './helpers';

const ANNA = 'anna';
const MATEO = 'mateo';
const JOHAN = 'johan';
const PLAYER = 'player';

const profile = (uid: string, displayName: string, isAppAdmin = false) =>
	getDb().doc(`users/${uid}`).set({ uid, displayName, isAppAdmin });

const saveNumber = (uid: string, swish = '0701234567') =>
	getDb().doc(`users/${uid}/private/payment`).set({ swish, updatedAt: '2026-11-01T10:00:00.000Z' });

const season = (id: string, adminUids: string[]) => getDb().doc(`seasons/${id}`).set({ adminUids });

beforeEach(clearFirestore);

describe('listPayees', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(listPayees.run(callRequest({}))).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	it('refuses somebody who is not an admin of anything', async () => {
		await season('s1', [ANNA]);

		await expect(listPayees.run(callRequest({}, { uid: PLAYER }))).rejects.toMatchObject({
			code: 'permission-denied',
		});
	});

	it('lets an app admin ask', async () => {
		await profile(MATEO, 'Mateo', true);

		const { payees } = await listPayees.run(callRequest({}, { uid: MATEO, admin: true }));

		expect(payees.map(payee => payee.uid)).toEqual([MATEO]);
	});

	it('lets an admin of any season ask', async () => {
		await profile(ANNA, 'Anna');
		await season('s1', [ANNA]);

		const { payees } = await listPayees.run(callRequest({}, { uid: ANNA }));

		expect(payees.map(payee => payee.uid)).toEqual([ANNA]);
	});

	it('lists app admins and season admins once each, sorted by name', async () => {
		await profile(MATEO, 'Mateo', true);
		await profile(ANNA, 'Anna');
		await profile(JOHAN, 'Johan');
		await season('s1', [ANNA, JOHAN]);
		await season('s2', [ANNA, MATEO]);

		const { payees } = await listPayees.run(callRequest({}, { uid: ANNA }));

		expect(payees.map(payee => payee.displayName)).toEqual(['Anna', 'Johan', 'Mateo']);
	});

	it('says who has a number saved', async () => {
		await profile(ANNA, 'Anna');
		await profile(JOHAN, 'Johan');
		await season('s1', [ANNA, JOHAN]);
		await saveNumber(ANNA);

		const { payees } = await listPayees.run(callRequest({}, { uid: ANNA }));

		expect(payees).toEqual([
			{ uid: ANNA, displayName: 'Anna', hasNumber: true },
			{ uid: JOHAN, displayName: 'Johan', hasNumber: false },
		]);
	});

	// The numbers are private. A season admin picks by name and never sees one.
	it('never returns digits', async () => {
		await profile(ANNA, 'Anna');
		await season('s1', [ANNA]);
		await saveNumber(ANNA, '0701234567');

		const { payees } = await listPayees.run(callRequest({}, { uid: ANNA }));

		expect(payees.every(payee => Object.keys(payee).sort().join() === 'displayName,hasNumber,uid')).toBe(true);
		expect(JSON.stringify(payees)).not.toContain('0701234567');
	});
});
