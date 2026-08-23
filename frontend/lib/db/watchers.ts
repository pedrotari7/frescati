import { collectionGroup, deleteDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { getDb } from '../firebaseClient';
import { watcherDoc } from './paths';
import { callFunction } from './call';

/**
 * Following a game's availability.
 *
 * The document's **presence** is the whole subscription: there is no
 * `watching: false`, the same way there is no placeholder response, so
 * subscribing is a write and unsubscribing is a delete, and the third state
 * never has to be represented at all. Rules keep each one readable by nobody
 * but its owner, so the only question anything here asks is about *you*.
 */

/**
 * Every game the signed-in user is following, by game id.
 *
 * One collection-group listener rather than a document listener per game, for
 * the same reason `useMyResponses` holds one: the season's home screen draws a
 * bell on every game it lists, and a listener each is exactly what the
 * denormalised `counts` on those rows exist to avoid. Nothing about it is
 * season-scoped, a uid follows a handful of games in total, and narrowing it
 * to one season would cost a second query to know which ids belong to it.
 *
 * Matched on the `uid` **field**, not on the document id that says the same
 * thing: a collection-group query is allowed by proving every document it could
 * return would pass, and the id is not something such a query can constrain.
 * The field is what makes that rule expressible, which is why it is written at
 * all beside an id that already carries it.
 */
export const subscribeToMyWatching = (
	uid: string,
	onChange: (gameIds: Set<string>) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		query(collectionGroup(getDb(), 'watchers'), where('uid', '==', uid)),
		snapshot => {
			const gameIds = new Set<string>();

			for (const watcher of snapshot.docs) {
				// .../games/{gameId}/watchers/{uid}
				const gameId = watcher.ref.parent.parent?.id;
				if (gameId) gameIds.add(gameId);
			}

			onChange(gameIds);
		},
		onError
	);

export const watchGame = (seasonId: string, gameId: string, uid: string): Promise<void> =>
	setDoc(watcherDoc(seasonId, gameId, uid), { uid, createdAt: new Date().toISOString() });

export const unwatchGame = (seasonId: string, gameId: string, uid: string): Promise<void> =>
	deleteDoc(watcherDoc(seasonId, gameId, uid));

/**
 * Everyone following one game, for an app admin.
 *
 * A callable for the same reason `getNotificationReach` is one, the collection
 * is closed to every client and stays closed, but read once rather than
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
