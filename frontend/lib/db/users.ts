import { updateDoc } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { AppUser, NotificationPrefs } from '@shared/types';
import { normaliseNotificationPrefs } from '@shared/notifications';
import { byDisplayName } from '@shared/format';
import { userDoc, usersCol } from './paths';
import { subscribeToCollection, subscribeToDoc } from './subscribe';

/** The document id *is* the uid — trust it over a field that could be missing. */
const toUser = (id: string, data: DocumentData): AppUser => ({ ...(data as AppUser), uid: id });

/**
 * Everyone who has ever signed in. Small by design — this is one football
 * group — and needed in full by the admin member picker and every roster,
 * which renders names for uids stored on seasons and responses.
 *
 * Sorted here rather than with `orderBy('displayName')`: Firestore drops
 * documents that lack the ordering field, so a half-written profile would
 * vanish from the list entirely instead of just looking incomplete.
 */
export const subscribeToUsers = (onChange: (users: AppUser[]) => void, onError: (error: Error) => void): Unsubscribe =>
	subscribeToCollection(
		usersCol(),
		docs => docs.map(d => toUser(d.id, d.data())).sort(byDisplayName),
		onChange,
		onError
	);

/** One person, live. Used for the signed-in user's own notification settings. */
export const subscribeToUser = (
	uid: string,
	onChange: (user: AppUser | null) => void,
	onError: (error: Error) => void
): Unsubscribe => subscribeToDoc(userDoc(uid), snapshot => toUser(snapshot.id, snapshot.data()), onChange, onError);

/**
 * Which kinds of notification this person wants. Honoured by `sendPush` on the
 * backend, which skips anyone who has switched a kind off.
 *
 * Normalised on the way out rather than written through: the screen builds its
 * state by spreading whatever the profile holds over the defaults, and security
 * rules bound this map to exactly four keys.
 */
export const setNotificationPrefs = (uid: string, notificationPrefs: NotificationPrefs) =>
	updateDoc(userDoc(uid), { notificationPrefs: normaliseNotificationPrefs(notificationPrefs) });

/**
 * Move somebody's last-visit stamp forward. Self-written, like the rest of the
 * profile — `shared/visit.ts` says what counts as a visit and `useLastSeen`
 * decides when one has happened.
 *
 * An `updateDoc` rather than a merge, deliberately: this must never be the
 * write that creates a profile. A document holding a timestamp and nothing else
 * would be a nameless row in every roster in the app, and `upsertUserDoc` has
 * already run by the time anything here fires.
 */
export const recordVisit = (uid: string, at: string) => updateDoc(userDoc(uid), { lastSeenAt: at });
