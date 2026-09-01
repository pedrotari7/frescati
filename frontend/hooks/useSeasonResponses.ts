'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game } from '@shared/types';
import type { SeasonResponses } from '@shared/availability';
import { availabilityGames } from '@shared/availability';
import { fetchSeasonResponses } from '../lib/db/responses';
import { captureError } from '../lib/sentry';

const NONE: SeasonResponses = {};

/**
 * Everybody's answers to every game in one season, read when the screen opens.
 *
 * The one hook here that isn't a listener. `fetchSeasonResponses` says why it
 * is a read; this is the React half of it, and the part worth getting right is
 * what the read is keyed on. `games` is a fresh array on every snapshot of any
 * one of them, and a headcount ticking over is most of them, so keying on the
 * array would re-read the season every time somebody tapped In. The ids are
 * what this actually depends on: a game added, cancelled or deleted changes
 * them and re-reads, a counter moving does not.
 *
 * `loading` matters more than usual, because the answer this hands back while
 * it is still out looks exactly like a real one. An empty map is "nobody
 * answered anything", which is a state a season can genuinely be in, so a
 * caller that draws it without checking is not showing a gap, it is asserting
 * something false. See `SeasonProvider`: a screen must not draw a real state it
 * does not know yet.
 *
 * `retry` re-runs the read, for the same reason `useFirestoreSubscription` has
 * one: this is a phone on a train, the failure is usually the connection, and
 * the screen showing it needs something to offer besides a page reload.
 */
export const useSeasonResponses = (seasonId: string | null, games: Pick<Game, 'id' | 'status'>[]) => {
	const gameIds = useMemo(() => availabilityGames(games).map(game => game.id), [games]);
	const key = gameIds.join(',');

	const [responses, setResponses] = useState<SeasonResponses>(NONE);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [attempt, setAttempt] = useState(0);

	const retry = useCallback(() => setAttempt(current => current + 1), []);

	useEffect(() => {
		if (!seasonId || gameIds.length === 0) {
			setResponses(NONE);
			setError(null);
			setLoading(false);
			return;
		}

		// A read that lands after the screen has moved on, or after a second one
		// has been started, must not write over what is on screen now.
		let live = true;

		setLoading(true);

		fetchSeasonResponses(seasonId, gameIds)
			.then(fetched => {
				if (!live) return;

				setResponses(fetched);
				setError(null);
				setLoading(false);
			})
			.catch((failure: Error) => {
				if (!live) return;

				// Back to nothing rather than to a half-filled map: a partial read
				// draws people as never having answered games they answered, which
				// is worse than drawing no strip at all.
				setResponses(NONE);
				setError(failure);
				setLoading(false);
				void captureError(failure, { source: 'seasonResponses' });
			});

		return () => {
			live = false;
		};
		// `gameIds` is what the effect reads and `key` is its stable spelling.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seasonId, key, attempt]);

	return { responses, loading, error, retry };
};
