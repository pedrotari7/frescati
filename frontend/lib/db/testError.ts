import type { BackendErrorKind } from '@shared/debug';
import { callFunction } from './call';

/**
 * Asks the backend to fail on purpose, to prove error reporting works.
 *
 * Two of the three kinds reject rather than resolve, which is the point. The
 * caller is expected to catch. See `backend/src/throwTestError.ts`.
 */
export const throwTestError = async (kind: BackendErrorKind): Promise<void> => {
	await callFunction<{ kind: BackendErrorKind }, { reported: boolean }>('throwTestError', { kind });
};
