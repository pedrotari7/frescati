import { deleteDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { GameResponse, PlayerRole, ResponseStatus } from '@shared/types';
import { responseDoc, responsesCol } from './paths';

const toResponse = (data: DocumentData): GameResponse => data as GameResponse;

export const subscribeToResponses = (
	seasonId: string,
	gameId: string,
	onChange: (responses: GameResponse[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		responsesCol(seasonId, gameId),
		snapshot => onChange(snapshot.docs.map(d => toResponse(d.data()))),
		onError
	);

/**
 * Record an answer. `role` is snapshotted here and re-checked by security rules
 * against real season membership, so a client can't promote itself.
 *
 * Writes the whole document rather than merging: a response is small and
 * self-contained, and a full write keeps `updatedAt` honest.
 */
export const setResponse = async (
	seasonId: string,
	gameId: string,
	uid: string,
	status: ResponseStatus,
	role: PlayerRole,
	existing?: GameResponse
): Promise<void> => {
	const now = new Date().toISOString();

	await setDoc(responseDoc(seasonId, gameId, uid), {
		uid,
		status,
		role,
		// Keep the original signup time so changing your mind doesn't send an
		// extra to the back of the queue.
		respondedAt: existing?.respondedAt ?? now,
		updatedAt: now,
		// Only a season admin may write this, so preserve rather than resend it.
		...(existing?.confirmOverride === undefined ? {} : { confirmOverride: existing.confirmOverride }),
	});
};

/** Back to "no response" — the third state is the absence of a document. */
export const clearResponse = (seasonId: string, gameId: string, uid: string) =>
	deleteDoc(responseDoc(seasonId, gameId, uid));

/** Season admin only: give an extra a spot or take it away. */
export const setConfirmOverride = (seasonId: string, gameId: string, uid: string, confirmed: boolean) =>
	updateDoc(responseDoc(seasonId, gameId, uid), {
		confirmOverride: confirmed,
		updatedAt: new Date().toISOString(),
	});
