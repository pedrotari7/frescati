import { addDoc, arrayRemove, arrayUnion, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Season } from '@shared/types';
import { seasonDoc, seasonsCol } from './paths';

const toSeason = (id: string, data: DocumentData): Season => ({ ...(data as Omit<Season, 'id'>), id });

export const subscribeToSeasons = (
	onChange: (seasons: Season[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		query(seasonsCol(), orderBy('startDate', 'desc')),
		snapshot => onChange(snapshot.docs.map(d => toSeason(d.id, d.data()))),
		onError
	);

export const subscribeToSeason = (
	seasonId: string,
	onChange: (season: Season | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		seasonDoc(seasonId),
		snapshot => onChange(snapshot.exists() ? toSeason(snapshot.id, snapshot.data()) : null),
		onError
	);

export const createSeason = async (season: Omit<Season, 'id'>): Promise<string> => {
	const ref = await addDoc(seasonsCol(), season);

	return ref.id;
};

export const updateSeason = (seasonId: string, changes: Partial<Omit<Season, 'id'>>) =>
	updateDoc(seasonDoc(seasonId), changes);

export const addSeasonMember = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { memberUids: arrayUnion(uid) });

/** Removing a member also strips their admin rights — you can't run a season you're not in. */
export const removeSeasonMember = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { memberUids: arrayRemove(uid), adminUids: arrayRemove(uid) });

export const addSeasonAdmin = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { adminUids: arrayUnion(uid), memberUids: arrayUnion(uid) });

export const removeSeasonAdmin = (seasonId: string, uid: string) =>
	updateDoc(seasonDoc(seasonId), { adminUids: arrayRemove(uid) });
