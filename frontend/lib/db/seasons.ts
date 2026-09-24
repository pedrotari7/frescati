import {
	addDoc,
	arrayRemove,
	arrayUnion,
	deleteDoc,
	orderBy,
	query,
	runTransaction,
	updateDoc,
} from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Season } from '@shared/types';
import { dueId } from '@shared/finances';
import { getDb } from '../firebaseClient';
import { dueDoc, seasonDoc, seasonsCol } from './paths';
import { subscribeToCollection, subscribeToDoc } from './subscribe';

const toSeason = (id: string, data: DocumentData): Season => ({ ...(data as Omit<Season, 'id'>), id });

export const subscribeToSeasons = (
	onChange: (seasons: Season[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(seasonsCol(), orderBy('startDate', 'desc')),
		docs => docs.map(d => toSeason(d.id, d.data())),
		onChange,
		onError
	);

export const subscribeToSeason = (
	seasonId: string,
	onChange: (season: Season | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(seasonDoc(seasonId), snapshot => toSeason(snapshot.id, snapshot.data()), onChange, onError);

export const createSeason = async (season: Omit<Season, 'id'>): Promise<string> => {
	const ref = await addDoc(seasonsCol(), season);

	return ref.id;
};

export const updateSeason = (seasonId: string, changes: Partial<Omit<Season, 'id'>>) =>
	updateDoc(seasonDoc(seasonId), changes);

export const addSeasonMember = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { memberUids: arrayUnion(uid) });

/**
 * Adding somebody partway through a season, with the entry fee for the games
 * they have left.
 *
 * One transaction, so a squad place and the charge for it land together or not
 * at all. The charge goes at the derived `entry_{uid}` id, the same one the
 * sweep would use, so the sweep finds it and leaves it alone rather than
 * raising the full share on top. It is a `late` charge, which puts the money in
 * the extras' pot rather than towards the bill. Somebody who already has an entry fee, from an
 * earlier spell in the squad, keeps the one they have. It may have been paid,
 * and the rules would refuse to overwrite it anyway. Resolves to whether a
 * charge was raised.
 */
export const addLateSeasonMember = (
	seasonId: string,
	uid: string,
	entry: { amount: number; note: string }
): Promise<boolean> =>
	runTransaction(getDb(), async transaction => {
		const due = dueDoc(seasonId, dueId('entry', uid));
		const existing = await transaction.get(due);

		transaction.update(seasonDoc(seasonId), { memberUids: arrayUnion(uid) });

		if (existing.exists() || entry.amount <= 0) return false;

		transaction.set(due, {
			uid,
			kind: 'late',
			amount: entry.amount,
			note: entry.note,
			status: 'owing',
			createdAt: new Date().toISOString(),
		});

		return true;
	});

/** Removing a member also strips their admin rights. You can't run a season you're not in. */
export const removeSeasonMember = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { memberUids: arrayRemove(uid), adminUids: arrayRemove(uid) });

export const addSeasonAdmin = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { adminUids: arrayUnion(uid), memberUids: arrayUnion(uid) });

export const removeSeasonAdmin = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { adminUids: arrayRemove(uid) });

/** Games, responses and tournament data cascade server-side via `onSeasonDeleted`. */
export const deleteSeason = (seasonId: string) => deleteDoc(seasonDoc(seasonId));
