import type { AppUser } from '@shared/types';

/**
 * Turning a uid into somebody to put on screen.
 *
 * Almost nothing in this app stores a name. A season holds `memberUids`, a
 * response holds a uid, a lineup holds uids, a ledger entry holds uids — so
 * every list of people is a join against the profiles, done in the client
 * because the profiles are one football group and already subscribed.
 *
 * Which means every one of those lists also needs an answer for a uid with no
 * profile behind it, and there were eleven copies of that answer.
 */

/**
 * What a uid with no profile reads as.
 *
 * A real state rather than a defensive fallback: `forget-player` deliberately
 * leaves the uid in every ledger entry, lineup and score it appears in while
 * clearing the profile, so a squad from two seasons ago genuinely contains
 * people the app can no longer name. It is also what a profile mid-write looks
 * like for the moment before `displayName` lands.
 */
export const UNKNOWN_PLAYER = 'Unknown player';

/** The name to show for a profile that may not be there. */
export const displayNameOf = (user: Pick<AppUser, 'displayName'> | undefined | null): string =>
	user?.displayName ?? UNKNOWN_PLAYER;

/** The same, looked up by uid — the shape most callers have. */
export const nameByUid = (usersByUid: Map<string, AppUser>, uid: string): string => displayNameOf(usersByUid.get(uid));

/** Enough of a person to draw a row: an avatar and a name. */
export interface PersonRow {
	uid: string;
	displayName: string;
	photoURL: string | null;
}

/**
 * One row's worth of somebody.
 *
 * `photoURL` falls to `null` rather than staying `undefined` because `Avatar`
 * takes `string | null` and draws initials from the name when there is no
 * picture — which is the same answer for "no photo" and "no profile at all".
 */
export const personRow = (usersByUid: Map<string, AppUser>, uid: string): PersonRow => {
	const user = usersByUid.get(uid);

	return { uid, displayName: displayNameOf(user), photoURL: user?.photoURL ?? null };
};
