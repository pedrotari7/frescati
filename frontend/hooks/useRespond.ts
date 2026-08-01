'use client';

import { useCallback } from 'react';
import type { PlayerRole, ResponseStatus } from '@shared/types';
import { clearResponse, setResponse } from '../lib/db/responses';
import { useAuth } from '../lib/auth';
import type { MyResponses } from './useMyResponses';

/**
 * Answering, from anywhere. Bundles in the signed-in uid and the role the
 * season says they hold, so no caller has to remember to pass them.
 */
export const useRespond = (seasonId: string, role: PlayerRole, myResponses: MyResponses) => {
	const { user } = useAuth();
	const uid = user?.uid;

	const respond = useCallback(
		async (gameId: string, status: ResponseStatus) => {
			if (!uid) return;

			await setResponse(seasonId, gameId, uid, status, role, myResponses[gameId]);
		},
		[seasonId, uid, role, myResponses]
	);

	const clear = useCallback(
		async (gameId: string) => {
			if (!uid) return;

			await clearResponse(seasonId, gameId, uid);
		},
		[seasonId, uid]
	);

	return { respond, clear };
};
