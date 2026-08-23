import type { AppUser, Game, GameResponse, Season } from '../../../shared/types';
import { db } from './firebase';

/** Shared reads, so triggers and the scheduler agree on how documents are shaped. */

/**
 * The profiles behind a list of uids, keyed by uid.
 *
 * One `getAll` rather than a read each, and missing accounts are simply absent
 * from the map rather than present as `null`. Every caller wants the rating on
 * a profile that exists, and a `has`-then-`get` dance says nothing extra.
 *
 * The empty guard is not defensive: `getAll` throws when handed no refs, which
 * is what a season with an empty roster, or a game nobody has answered, hands
 * it. Both callers had discovered that separately.
 */
export const getProfiles = async (uids: string[]): Promise<Map<string, AppUser>> => {
	if (uids.length === 0) return new Map();

	const snapshots = await db.getAll(...uids.map(uid => db.doc(`users/${uid}`)));

	return new Map(snapshots.filter(snap => snap.exists).map(snap => [snap.id, snap.data() as AppUser]));
};

export const getSeason = async (seasonId: string): Promise<Season | null> => {
	const snapshot = await db.doc(`seasons/${seasonId}`).get();

	return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as Season) : null;
};

/**
 * The season a "somebody just joined" notification should send an admin to,
 * or `null` when none is active.
 *
 * Seasons can genuinely overlap. A Tuesday season and a Sunday offshoot both
 * `active` at once, each with their own admins, so there is no single "the"
 * active season to ask about. Most recently created stands in for "the one an
 * admin reached for last": a new season is usually spun up because the old
 * one is winding down, so the newest active one is the one most likely to
 * still be recruiting.
 */
export const getMostRecentActiveSeasonId = async (): Promise<string | null> => {
	const snapshot = await db
		.collection('seasons')
		.where('status', '==', 'active')
		.orderBy('createdAt', 'desc')
		.limit(1)
		.get();

	return snapshot.empty ? null : snapshot.docs[0].id;
};

export const getGame = async (seasonId: string, gameId: string): Promise<Game | null> => {
	const snapshot = await db.doc(`seasons/${seasonId}/games/${gameId}`).get();

	return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as Game) : null;
};

export const getResponses = async (seasonId: string, gameId: string): Promise<GameResponse[]> => {
	const snapshot = await db.collection(`seasons/${seasonId}/games/${gameId}/responses`).get();

	return snapshot.docs.map(doc => doc.data() as GameResponse);
};

export const getUidsWhoSaidIn = (responses: GameResponse[]): string[] =>
	responses.filter(response => response.status === 'in').map(response => response.uid);

/**
 * Everyone following this game's availability.
 *
 * Read off the document ids rather than the `uid` field, the same way
 * `recountGame` resolves roles: the id is the uid by construction. Security
 * rules only let somebody write their own, whereas the field is data that
 * happens to sit alongside it.
 */
export const getWatcherUids = async (seasonId: string, gameId: string): Promise<string[]> => {
	const snapshot = await db.collection(`seasons/${seasonId}/games/${gameId}/watchers`).get();

	return snapshot.docs.map(doc => doc.id);
};

/**
 * A name to put in a notification, empty when there isn't one.
 *
 * Deliberately not defaulted here. `buildGamePush` decides what a missing name
 * reads as, so there is one place the wording lives, the same as everywhere
 * else in `shared/notifications.ts`. A profile can genuinely be missing this
 * mid-write; see `upsertUserDoc`.
 */
export const getDisplayName = async (uid: string): Promise<string> => {
	const snapshot = await db.doc(`users/${uid}`).get();

	return (snapshot.data()?.displayName as string | undefined) ?? '';
};

/**
 * Everyone carrying the app-admin badge.
 *
 * Reads the `isAppAdmin` mirror rather than the `admin` custom claim it mirrors,
 * which would mean paging every account in Firebase Auth. The claim stays the
 * source of truth for *authorization*. This only decides who gets told
 * something, and both places that grant the claim write the mirror in the same
 * breath. A stale mirror here costs somebody a notification, not a permission.
 */
export const getAppAdminUids = async (): Promise<string[]> => {
	const snapshot = await db.collection('users').where('isAppAdmin', '==', true).get();

	return snapshot.docs.map(doc => doc.id);
};
