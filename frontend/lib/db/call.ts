import { httpsCallable } from 'firebase/functions';
import { getFunctionsClient } from '../firebaseClient';

/**
 * Calling a Cloud Function.
 *
 * Ten of these across `lib/db`, each spelling out the same three steps:
 * build a callable against `getFunctionsClient()`, await it, reach past the
 * envelope for `data`. The name and the two type arguments are the whole of
 * what differs.
 *
 * Everything privileged arrives this way rather than through an API layer,
 * because there isn't one and doesn't want to be, see the architecture note in
 * CLAUDE.md. What lands here is the short list of things security rules cannot
 * express: a custom claim, a rating the client is frozen out of, a collection
 * closed to every reader, an FCM send.
 *
 * Errors are deliberately not caught. A callable rejects with an `HttpsError`
 * carrying the message the function chose, and `useWrite` is what turns that
 * into a toast, swallowing it here would take the wording away from the
 * function that wrote it.
 */
export const callFunction = async <Req, Res>(name: string, data: Req): Promise<Res> => {
	const call = httpsCallable<Req, Res>(getFunctionsClient(), name);

	const result = await call(data);

	return result.data;
};
