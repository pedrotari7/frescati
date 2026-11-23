'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RecapInput } from '@shared/recap';
import type { Game, Season } from '@shared/types';
import { fetchRecapGames } from '../lib/db/recap';
import { captureError } from '../lib/sentry';
import { useSeasonLedger } from './useData';
import { useSeasonResponses } from './useSeasonResponses';

type RecapGames = Pick<RecapInput, 'motm' | 'matches'>;

const NO_GAMES: RecapGames = { motm: {}, matches: {} };

/**
 * Everything `shared/recap` reads, for one season.
 *
 * The ledger is the season's live subscription, shared with the table. The
 * responses, votes and scorelines are one-shot reads, keyed on the rated game
 * ids so a counter ticking on a game document never re-reads them.
 *
 * `input` stays `null` until all of it has landed. Half a recap is worse than a
 * skeleton: an award computed off the votes of three games out of ten names the
 * wrong person with complete confidence.
 */
export const useSeasonRecap = (season: Season | null, games: Game[]) => {
	const seasonId = season?.id ?? null;
	const { entries, loading: ledgerLoading, error: ledgerError } = useSeasonLedger(seasonId);
	const { responses, loading: responsesLoading, error: responsesError, retry } = useSeasonResponses(seasonId, games);

	const ratedIds = useMemo(() => entries.map(entry => entry.gameId).sort(), [entries]);
	const key = ratedIds.join(',');

	const [extras, setExtras] = useState<{ key: string; games: RecapGames } | null>(null);
	const [extrasError, setExtrasError] = useState<Error | null>(null);

	useEffect(() => {
		if (!seasonId || ledgerLoading) return;

		let live = true;

		fetchRecapGames(seasonId, ratedIds)
			.then(fetched => {
				if (!live) return;

				setExtras({ key, games: fetched });
				setExtrasError(null);
			})
			.catch((failure: Error) => {
				if (!live) return;

				setExtrasError(failure);
				void captureError(failure, { source: 'seasonRecap' });
			});

		return () => {
			live = false;
		};
		// `ratedIds` is what the effect reads and `key` is its stable spelling.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seasonId, key, ledgerLoading]);

	const ready = !!season && !ledgerLoading && !responsesLoading && extras?.key === key;

	const input = useMemo<RecapInput | null>(
		() =>
			ready && season
				? {
						seasonId: season.id,
						memberUids: season.memberUids,
						games,
						entries,
						responses,
						...(extras?.games ?? NO_GAMES),
					}
				: null,
		[ready, season, games, entries, responses, extras]
	);

	return {
		input,
		ratedCount: entries.length,
		gameCount: games.filter(game => game.status !== 'cancelled').length,
		error: ledgerError ?? responsesError ?? extrasError,
		retry,
	};
};
