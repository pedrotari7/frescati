import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Season } from '../../../shared/types';
import { db } from './firebase';

/**
 * Who is allowed to call what.
 *
 * The rules in `firestore.rules` are the authorization layer for everything the
 * client writes directly; this is the same job for the handful of things it
 * can't. Gathered into one file because the checks were previously fourteen
 * string literals spread across nine handlers, which made "who can do this"
 * a grep for a message rather than a question with an answer.
 *
 * Every guard returns the caller's uid rather than `void`. That is not a
 * convenience: after a guard runs, TypeScript still has `request.auth` as
 * possibly undefined — the narrowing doesn't cross the function boundary — and
 * every caller wants the uid immediately afterwards, to log it or to stamp it
 * on a document. Returning it is what stops each of them reaching back for
 * `request.auth!.uid` and re-asserting what the guard has already proved.
 */

/** Signed in at all. */
export const requireAuth = (request: CallableRequest<unknown>): string => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');

	return request.auth.uid;
};

/**
 * Carrying the global `admin` custom claim.
 *
 * Read off the token rather than the `isAppAdmin` mirror on the profile, which
 * needs a document read and is only a display copy — see `getAppAdminUids` for
 * the one place that deliberately reads the mirror instead, and why a stale one
 * there costs a notification rather than a permission.
 */
export const requireAppAdmin = (request: CallableRequest<unknown>): string => {
	const uid = requireAuth(request);

	if (request.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'App admins only.');

	return uid;
};

/** The same claim as a question rather than a demand, for the mixed checks below. */
export const hasAppAdminClaim = (request: CallableRequest<unknown>): boolean => request.auth?.token.admin === true;

/**
 * Whether somebody can act on this season.
 *
 * An app admin always can — the global role outranks a per-season one
 * everywhere in the app, and `firestore.rules` says the same. A missing season
 * is nobody's to administer, so it answers `false` rather than throwing; the
 * callers that care whether it exists check that separately and say so with a
 * `not-found`, which is a better error than a `permission-denied`.
 */
export const isSeasonAdmin = (season: Pick<Season, 'adminUids'> | undefined, uid: string, appAdmin: boolean): boolean =>
	appAdmin || (season?.adminUids ?? []).includes(uid);

/**
 * The same question by season id, for the handlers that only have one.
 *
 * Short-circuits on the global claim *before* the read: an app admin is allowed
 * whatever the season says, so fetching it first would be a document read to
 * answer a question already settled.
 *
 * The message is the caller's because `permission-denied` is one of the few
 * errors a person actually reads — "only a season admin can confirm results"
 * says which season admin power they were reaching for, where a shared sentence
 * would leave them guessing.
 */
export const requireSeasonAdmin = async (
	request: CallableRequest<unknown>,
	seasonId: string,
	message: string
): Promise<string> => {
	const uid = requireAuth(request);

	if (hasAppAdminClaim(request)) return uid;

	const snapshot = await db.doc(`seasons/${seasonId}`).get();

	if (!isSeasonAdmin(snapshot.data() as Season | undefined, uid, false)) {
		throw new HttpsError('permission-denied', message);
	}

	return uid;
};
