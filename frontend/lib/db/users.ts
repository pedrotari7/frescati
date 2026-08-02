import { onSnapshot, orderBy, query } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { AppUser } from '@shared/types';
import { usersCol } from './paths';

const toUser = (data: DocumentData): AppUser => data as AppUser;

/**
 * Everyone who has ever signed in. Small by design — this is one football
 * group — and needed in full by the admin member picker and every roster,
 * which renders names for uids stored on seasons and responses.
 */
export const subscribeToUsers = (onChange: (users: AppUser[]) => void, onError: (error: Error) => void): Unsubscribe =>
	onSnapshot(
		query(usersCol(), orderBy('displayName')),
		snapshot => onChange(snapshot.docs.map(d => toUser(d.data()))),
		onError
	);
