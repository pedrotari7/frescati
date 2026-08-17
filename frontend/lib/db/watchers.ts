import { deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { watcherDoc } from './paths';
import { callFunction } from './call';

/**
 * Following one game's availability.
 *
 * The document's **presence** is the whole subscription — there is no
 * `watching: false`, the same way there is no placeholder response — so
 * subscribing is a write and unsubscribing is a delete, and the third state
 * never has to be represented at all.
 *
 * Security rules keep each of these readable only by its owner, which is why
 * this subscribes to one document rather than the collection: there is nothing
 * to list, and the only question a screen asks is whether *you* are following.
 */

export const subscribeToWatching = (
	seasonId: string,
	gameId: string,
	uid: string,
	onChange: (watching: boolean) => void,
	onError: (error: Error) => void
): Unsubscribe => onSnapshot(watcherDoc(seasonId, gameId, uid), snapshot => onChange(snapshot.exists()), onError);

export const watchGame = (seasonId: string, gameId: string, uid: string): Promise<void> =>
	setDoc(watcherDoc(seasonId, gameId, uid), { uid, createdAt: new Date().toISOString() });

export const unwatchGame = (seasonId: string, gameId: string, uid: string): Promise<void> =>
	deleteDoc(watcherDoc(seasonId, gameId, uid));

/**
 * Everyone following one game, for an app admin.
 *
 * A callable for the same reason `getNotificationReach` is one — the collection
 * is closed to every client and stays closed — but read once rather than
 * subscribed, which is a compromise this one makes and the bell above does not.
 * The rule that keeps this private is exactly the rule that makes an
 * `onSnapshot` impossible, so a refresh is what a screen gets offered instead.
 */
export const getGameWatchers = async (seasonId: string, gameId: string): Promise<string[]> => {
	const { uids } = await callFunction<{ seasonId: string; gameId: string }, { uids: string[] }>('getGameWatchers', {
		seasonId,
		gameId,
	});

	return uids ?? [];
};
