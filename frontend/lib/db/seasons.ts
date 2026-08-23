import { addDoc, arrayRemove, arrayUnion, deleteDoc, orderBy, query, updateDoc } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Season } from '@shared/types';
import { seasonDoc, seasonsCol } from './paths';
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

/** Removing a member also strips their admin rights. You can't run a season you're not in. */
export const removeSeasonMember = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { memberUids: arrayRemove(uid), adminUids: arrayRemove(uid) });

export const addSeasonAdmin = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { adminUids: arrayUnion(uid), memberUids: arrayUnion(uid) });

export const removeSeasonAdmin = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { adminUids: arrayRemove(uid) });

/** Games, responses and tournament data cascade server-side via `onSeasonDeleted`. */
export const deleteSeason = (seasonId: string) => deleteDoc(seasonDoc(seasonId));
