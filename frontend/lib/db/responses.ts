import { deleteDoc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
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
 *
 * `existing` is an optimisation, not a requirement. When the caller doesn't
 * have it — someone taps In before the collection-group listener has caught up
 * — it is read back rather than assumed absent. Guessing wrong would resend a
 * fresh `respondedAt` over a document that already has one, which the rules
 * reject outright to stop extras backdating their way up the queue.
 */
export const setResponse = async (
	seasonId: string,
	gameId: string,
	uid: string,
	status: ResponseStatus,
	role: PlayerRole,
	existing?: GameResponse
): Promise<void> => {
	const ref = responseDoc(seasonId, gameId, uid);
	const current = existing ?? ((await getDoc(ref)).data() as GameResponse | undefined);
	const now = new Date().toISOString();

	await setDoc(ref, {
		uid,
		status,
		role,
		// Keep the original signup time so changing your mind doesn't send an
		// extra to the back of the queue. Frozen by the rules once written.
		respondedAt: current?.respondedAt ?? now,
		updatedAt: now,
		// Only a season admin may write this, so preserve rather than resend it.
		...(current?.confirmOverride === undefined ? {} : { confirmOverride: current.confirmOverride }),
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
