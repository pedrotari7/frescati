import { getAuth } from 'firebase-admin/auth';
import { setAppAdmin } from '../src/setAppAdmin';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { aUser, callRequest, clearAuth, clearFirestore, createAuthUser, getDb, readUser } from './helpers';

const CALLER = 'app-admin-1';
const TARGET = 'target-1';

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('setAppAdmin', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(setAppAdmin.run(callRequest({ uid: TARGET, isAdmin: true }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a caller who is not an app admin', async () => {
		await expect(
			setAppAdmin.run(callRequest({ uid: TARGET, isAdmin: true }, { uid: CALLER, admin: false }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects a request with no uid', async () => {
		await expect(
			setAppAdmin.run(callRequest({ isAdmin: true }, { uid: CALLER, admin: true }))
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('refuses to let an admin remove their own rights', async () => {
		await expect(
			setAppAdmin.run(callRequest({ uid: CALLER, isAdmin: false }, { uid: CALLER, admin: true }))
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('rejects a target account that no longer exists', async () => {
		await expect(
			setAppAdmin.run(callRequest({ uid: 'ghost', isAdmin: true }, { uid: CALLER, admin: true }))
		).rejects.toMatchObject({ code: 'not-found' });
	});

	it('grants the claim and writes a fresh, complete profile', async () => {
		await createAuthUser(TARGET, { displayName: 'Nova' });

		await setAppAdmin.run(callRequest({ uid: TARGET, isAdmin: true }, { uid: CALLER, admin: true }));

		const authUser = await getAuth().getUser(TARGET);
		expect(authUser.customClaims?.admin).toBe(true);

		const profile = await readUser(TARGET);
		expect(profile).toMatchObject({ uid: TARGET, displayName: 'Nova', isAppAdmin: true });
		expect(profile).not.toHaveProperty('email');
	});

	it('revokes the claim without touching other custom claims', async () => {
		await createAuthUser(TARGET, { displayName: 'Nova' });
		await getAuth().setCustomUserClaims(TARGET, { admin: true, betaTester: true });

		await setAppAdmin.run(callRequest({ uid: TARGET, isAdmin: false }, { uid: CALLER, admin: true }));

		const authUser = await getAuth().getUser(TARGET);
		expect(authUser.customClaims?.admin).toBeUndefined();
		expect(authUser.customClaims?.betaTester).toBe(true);
	});

	/**
	 * `scripts/setAdmin.ts` had this exact bug, a bare `{ isAppAdmin }` merge
	 * onto a document that doesn't exist yet drops `displayName` and `uid`, and
	 * there was no test to catch it here too. This is that test.
	 */
	it('preserves an existing profile instead of stomping it with a bare badge merge', async () => {
		await createAuthUser(TARGET, { displayName: 'Auth Display Name' });
		await getDb()
			.doc(`users/${TARGET}`)
			.set({
				...aUser(TARGET, {
					displayName: 'Old Display Name',
					createdAt: '2020-01-01T00:00:00.000Z',
					lastSeenAt: '2020-06-01T00:00:00.000Z',
					notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, reminders: false },
				}),
				email: 'legacy@example.test',
			});

		await setAppAdmin.run(callRequest({ uid: TARGET, isAdmin: true }, { uid: CALLER, admin: true }));

		const profile = await readUser(TARGET);
		// Auth is the source of truth for the display name, so this is the one
		// field that is expected to move.
		expect(profile?.displayName).toBe('Auth Display Name');
		expect(profile?.createdAt).toBe('2020-01-01T00:00:00.000Z');
		expect(profile?.lastSeenAt).toBe('2020-06-01T00:00:00.000Z');
		expect(profile?.notificationPrefs).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, reminders: false });
		expect(profile?.isAppAdmin).toBe(true);
		expect(profile).not.toHaveProperty('email');
	});
});
