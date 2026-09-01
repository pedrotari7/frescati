import { deleteDoc, deleteField, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { GameResponse, PlayerRole, ResponseStatus } from '@shared/types';
import type { SeasonResponses } from '@shared/availability';
import { responseDoc, responsesCol } from './paths';
import { asData, subscribeToCollection } from './subscribe';

export const subscribeToResponses = (
	seasonId: string,
	gameId: string,
	onChange: (responses: GameResponse[]) => void,
	onError: (error: Error) => void
): Unsubscribe => subscribeToCollection(responsesCol(seasonId, gameId), asData<GameResponse>(), onChange, onError);

/**
 * Games read at once. Low enough that abandoning the read costs at most this
 * many queries nobody wanted, high enough that a full season is four rounds.
 */
const AT_A_TIME = 8;

/**
 * Who said what, across a whole season, read once.
 *
 * A query per game, roughly thirty over a full season. `fetchPlayedGameResponses`
 * already weighed thirty reads against thirty listeners for the books and came
 * down here, and this is the harder case of the two: the Club tab is one people
 * leave open all week, so those listeners would stay open with it.
 *
 * A read is also the honest shape of the answer. What the strip draws is a
 * season of history plus a handful of games ahead, and none of that moves while
 * somebody is looking at it. The one answer on that screen that does is your
 * own, and `useMyResponses` is already live for it.
 *
 * Eight at a time, and it stops between rounds once `stillWanted` says no, which
 * is the part that had to be here rather than in the caller. Every response
 * document comes down the listen stream as its own message, so a season fired
 * off in one go is a burst of six hundred of them. The books can afford that:
 * an admin pressed a button and is sitting there waiting for the answer. This
 * one runs when a tab mounts, so the burst outlives the screen that asked for it
 * and lands on whichever screen you opened next. It left the kit register two
 * seconds away from answering a tap and lost the handover written behind it.
 *
 * `null` means it stopped early, so a caller can't mistake an abandoned read for
 * a season nobody answered.
 *
 * Keyed by the document id rather than the `uid` field beside it. The two are
 * pinned together by the rules for anybody writing their own answer, but a
 * season admin writes through a rule that checks neither, so the id is the half
 * that cannot be wrong.
 */
export const fetchSeasonResponses = async (
	seasonId: string,
	gameIds: string[],
	stillWanted: () => boolean = () => true
): Promise<SeasonResponses | null> => {
	const responses: SeasonResponses = {};

	for (let from = 0; from < gameIds.length; from += AT_A_TIME) {
		if (!stillWanted()) return null;

		const round = gameIds.slice(from, from + AT_A_TIME);
		const read = await Promise.all(round.map(gameId => getDocs(responsesCol(seasonId, gameId))));

		round.forEach((gameId, at) => {
			responses[gameId] = Object.fromEntries(
				read[at].docs.map(answer => [answer.id, answer.data() as GameResponse])
			);
		});
	}

	return responses;
};

/**
 * Record an answer. `role` is snapshotted here and re-checked by security rules
 * against real season membership, so a client can't promote itself.
 *
 * Writes the whole document rather than merging: a response is small and
 * self-contained, and a full write keeps `updatedAt` honest.
 *
 * `existing` is an optimisation, not a requirement. When the caller doesn't
 * have it, someone taps In before the collection-group listener has caught up
 * it is read back rather than assumed absent. Guessing wrong would resend a
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
		// Only a season admin may write these, so preserve rather than resend
		// them. The rules freeze both against a self write, so dropping one on
		// the way past is not a quiet loss: it is a denial, and the answer this
		// was sent to record never lands.
		...(current?.confirmOverride === undefined ? {} : { confirmOverride: current.confirmOverride }),
		...(current?.absent === undefined ? {} : { absent: current.absent }),
	});
};

/** Back to "no response": the third state is the absence of a document. */
export const clearResponse = (seasonId: string, gameId: string, uid: string) =>
	deleteDoc(responseDoc(seasonId, gameId, uid));

/**
 * Season admin only: report that somebody said they were coming and didn't turn
 * up, or take that back.
 *
 * Deleted rather than written `false`, so undoing leaves the document exactly as
 * it was. There is no third state to hold here: a game where nobody has said
 * anything and one where the admin looked and everybody turned up are the same
 * fact, so a stored `false` would only be a second way of spelling the absence
 * of the field.
 *
 * Nothing else moves. `counts` describes what people answered and the lineup is
 * whatever the admin has decided it is; by the time this can be written, neither
 * is a question anybody is still asking.
 */
export const setAbsent = (seasonId: string, gameId: string, uid: string, absent: boolean) =>
	updateDoc(responseDoc(seasonId, gameId, uid), {
		absent: absent ? true : deleteField(),
		updatedAt: new Date().toISOString(),
	});

/** Season admin only: give an extra a spot or take it away. */
export const setConfirmOverride = (seasonId: string, gameId: string, uid: string, confirmed: boolean) =>
	updateDoc(responseDoc(seasonId, gameId, uid), {
		confirmOverride: confirmed,
		updatedAt: new Date().toISOString(),
	});
