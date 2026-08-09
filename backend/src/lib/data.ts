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
