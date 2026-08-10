import { httpsCallable } from 'firebase/functions';
import type { BackendErrorKind } from '@shared/debug';
import { getFunctionsClient } from '../firebaseClient';

/**
 * Asks the backend to fail on purpose, to prove error reporting works.
 *
 * Two of the three kinds reject rather than resolve, which is the point — the
 * caller is expected to catch. See `backend/src/throwTestError.ts`.
 */
export const throwTestError = async (kind: BackendErrorKind): Promise<void> => {
	const call = httpsCallable<{ kind: BackendErrorKind }, { reported: boolean }>(
		getFunctionsClient(),
		'throwTestError'
	);

	await call({ kind });
};
