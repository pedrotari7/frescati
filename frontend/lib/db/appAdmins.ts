import { callFunction } from './call';

/**
 * Granting the global `admin` claim is the one thing the client can't do
 * directly: a custom claim lives in Firebase Auth, not Firestore, so no security
 * rule can gate it and only the Admin SDK can write it.
 *
 * The very first admin still comes from `pnpm --filter backend set-admin`,
 * because promoting somebody requires already being one.
 */
export const setAppAdmin = async (uid: string, isAdmin: boolean): Promise<void> => {
	await callFunction<{ uid: string; isAdmin: boolean }, { ok: boolean }>('setAppAdmin', { uid, isAdmin });
};
