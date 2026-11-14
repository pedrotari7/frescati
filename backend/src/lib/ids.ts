import { HttpsError } from 'firebase-functions/v2/https';

/**
 * A document id as Firestore mints one, or as Auth does for a uid, or as the
 * seeder spells a season: letters, digits, `_` and `-`.
 *
 * A callable builds paths out of what the client sends, and a `/` in an id
 * changes which document the path names. `seasons/${seasonId}` with a seasonId
 * of `S/debtors/somebody` is a debtor mark, and the caller can tell from the
 * answer whether it exists, which is the one thing the rules keep from them.
 * Nothing real carries a `/`, so the cheapest fix is to turn it away here,
 * before it becomes part of a path.
 */
const DOC_ID = /^[\w-]{1,128}$/;

/** The id, or an `invalid-argument` carrying the caller's own wording. */
export const requireId = (value: unknown, message: string): string => {
	if (typeof value !== 'string' || !DOC_ID.test(value)) throw new HttpsError('invalid-argument', message);

	return value;
};
