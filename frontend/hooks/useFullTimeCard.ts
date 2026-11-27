'use client';

import { useMemo } from 'react';
import { getFullTimeCard } from '@shared/fullTime';
import { usePlayerLedger, useSeasonLedger, useTournamentResult } from './useData';

/**
 * One player's full-time card for one game, from their career ledger, the
 * season's ledger and the game's result. `card` is `null` for somebody the
 * result did not rate.
 */
export const useFullTimeCard = (seasonId: string, gameId: string, uid: string | null) => {
	const career = usePlayerLedger(uid);
	const season = useSeasonLedger(seasonId);
	const { result, loading: resultLoading, error: resultError } = useTournamentResult(seasonId, gameId);

	const card = useMemo(
		() => (uid && result ? getFullTimeCard(career.entries, season.entries, result, gameId, uid) : null),
		[uid, result, career.entries, season.entries, gameId]
	);

	return {
		card,
		loading: career.loading || season.loading || resultLoading,
		error: career.error ?? season.error ?? resultError ?? null,
		retry: season.retry,
	};
};
