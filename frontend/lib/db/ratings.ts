import { httpsCallable } from 'firebase/functions';
import { getFunctionsClient } from '../firebaseClient';

/**
 * A rating is function-owned and frozen against client writes, so the one edit
 * an admin gets — a starting point, before the player's first rated game — has
 * to go through a callable rather than a rule with an exception in it.
 *
 * `rating` is on the displayed 0–100 scale, the one every screen already shows;
 * the function converts. `null` clears it, putting them back on the season seed.
 */
export const setStartingRating = async (uid: string, rating: number | null): Promise<void> => {
	const call = httpsCallable<{ uid: string; rating: number | null }, { ok: boolean }>(
		getFunctionsClient(),
		'setStartingRating'
	);

	await call({ uid, rating });
};
