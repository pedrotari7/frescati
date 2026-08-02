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

/** Season members who haven't answered — the people worth nudging. */
export const getSilentMembers = (season: Season, responses: GameResponse[]): string[] => {
	const answered = new Set(responses.map(response => response.uid));

	return season.memberUids.filter(uid => !answered.has(uid));
};

export const getUidsWhoSaidIn = (responses: GameResponse[]): string[] =>
	responses.filter(response => response.status === 'in').map(response => response.uid);
