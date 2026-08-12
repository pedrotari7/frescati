import type { Game, GameResponse, Season } from '../../../shared/types';
import { db } from './firebase';

/** Shared reads, so triggers and the scheduler agree on how documents are shaped. */

export const getSeason = async (seasonId: string): Promise<Season | null> => {
	const snapshot = await db.doc(`seasons/${seasonId}`).get();

	return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as Season) : null;
};

export const getGame = async (seasonId: string, gameId: string): Promise<Game | null> => {
	const snapshot = await db.doc(`seasons/${seasonId}/games/${gameId}`).get();

	return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as Game) : null;
};

export const getResponses = async (seasonId: string, gameId: string): Promise<GameResponse[]> => {
	const snapshot = await db.collection(`seasons/${seasonId}/games/${gameId}/responses`).get();

	return snapshot.docs.map(doc => doc.data() as GameResponse);
};

export const getUidsWhoSaidIn = (responses: GameResponse[]): string[] =>
	responses.filter(response => response.status === 'in').map(response => response.uid);

/**
 * Everyone following this game's availability.
 *
 * Read off the document ids rather than the `uid` field, the same way
 * `recountGame` resolves roles: the id is the uid by construction — security
 * rules only let somebody write their own — whereas the field is data that
 * happens to sit alongside it.
 */
export const getWatcherUids = async (seasonId: string, gameId: string): Promise<string[]> => {
	const snapshot = await db.collection(`seasons/${seasonId}/games/${gameId}/watchers`).get();

	return snapshot.docs.map(doc => doc.id);
};

/**
 * A name to put in a notification, empty when there isn't one.
 *
 * Deliberately not defaulted here — `buildGamePush` decides what a missing name
 * reads as, so there is one place the wording lives, the same as everywhere
 * else in `shared/notifications.ts`. A profile can genuinely be missing this
 * mid-write; see `upsertUserDoc`.
 */
export const getDisplayName = async (uid: string): Promise<string> => {
	const snapshot = await db.doc(`users/${uid}`).get();

	return (snapshot.data()?.displayName as string | undefined) ?? '';
};

/**
 * Everyone carrying the app-admin badge.
 *
 * Reads the `isAppAdmin` mirror rather than the `admin` custom claim it mirrors,
 * which would mean paging every account in Firebase Auth. The claim stays the
 * source of truth for *authorization* — this only decides who gets told
 * something, and both places that grant the claim write the mirror in the same
 * breath. A stale mirror here costs somebody a notification, not a permission.
 */
export const getAppAdminUids = async (): Promise<string[]> => {
	const snapshot = await db.collection('users').where('isAppAdmin', '==', true).get();

	return snapshot.docs.map(doc => doc.id);
};
