import { onSnapshot } from 'firebase/firestore';
import type {
	DocumentData,
	DocumentReference,
	Query,
	QueryDocumentSnapshot,
	QuerySnapshot,
	Unsubscribe,
} from 'firebase/firestore';

/**
 * The two shapes every listener in `lib/db` has.
 *
 * Firestore's `onSnapshot` is generic over neither the document type nor the
 * absence of one, so each subscription was carrying the same two lines: a
 * `snapshot.exists()` ternary casting to the model or `null`, or a
 * `snapshot.docs.map` casting each one. Thirteen copies, and the interesting
 * part of each, which path, which shape, which order, was the third line.
 *
 * The cast is unavoidable and lives here rather than at each call site.
 * Firestore hands back `DocumentData`; nothing validates it against the model
 * on the way out, and nothing did before either. What these helpers change is
 * that there is now one place to put a validator if that ever stops being an
 * acceptable trade.
 */

/**
 * One document, or `null` when it isn't there.
 *
 * `null` is a real answer throughout this app rather than an error case: no
 * response document means no response, no match document means not played, so
 * an absent document is handed to `onChange` like any other value.
 */
export const subscribeToDoc = <T>(
	ref: DocumentReference,
	toModel: (snapshot: QueryDocumentSnapshot) => T,
	onChange: (value: T | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		ref,
		// `toModel` runs only past `exists()`, where `data()` is guaranteed, so it
		// takes the `QueryDocumentSnapshot` form, whose `data()` is not optional.
		// That is what keeps a `snapshot.data()!` out of every caller's mapper; the
		// one assertion that buys it is here.
		snapshot => onChange(snapshot.exists() ? toModel(snapshot as QueryDocumentSnapshot) : null),
		onError
	);

/**
 * Every document a query returns.
 *
 * `toList` takes the whole array rather than mapping one at a time, because two
 * callers sort what comes back and one of them has to: profiles are ordered in
 * the client so that a half-written one missing `displayName` still appears,
 * where `orderBy` would drop it. Kit is the other, sorted by kind then name.
 * An order Firestore can't give without a composite index.
 */
export const subscribeToCollection = <T>(
	query: Query,
	toList: (docs: QuerySnapshot['docs']) => T[],
	onChange: (value: T[]) => void,
	onError: (error: Error) => void
): Unsubscribe => onSnapshot(query, snapshot => onChange(toList(snapshot.docs)), onError);

/**
 * The plain case: cast each document, keep the query's order.
 *
 * Only for the collections whose model doesn't carry its own id, responses are
 * keyed by uid and matches by fixture order, both of which are already fields.
 * Everything else passes its own `toX(id, data)` mapper, because the id has to
 * be trusted over the field beside it.
 */
export const asData =
	<T>() =>
	(docs: QuerySnapshot['docs']): T[] =>
		docs.map(doc => doc.data() as DocumentData as T);
