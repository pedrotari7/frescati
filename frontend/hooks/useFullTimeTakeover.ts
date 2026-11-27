'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { pickFullTimeTakeover } from '@shared/fullTime';
import { findLiveGame } from '@shared/game';
import type { Game, GameResponse, Season } from '@shared/types';
import { isVisible } from '../lib/device';
import { useAuth } from '../lib/auth';
import { claimFullTimeSession, readFullTimeSeen } from '../lib/fullTimeSeen';
import { useOnArrival } from './useArrival';
import { useSeasonLedger } from './useData';

/**
 * Opens somebody's full-time card the first time they come to the season home
 * after a result they played in, within a week of it.
 *
 * Gives way to the two takeovers that were here first. The live-game redirect
 * wins, because the game on now matters more than last week's. The recap wins,
 * because when a result ends a season the recap is the send-off, and the card is
 * still on the game screen.
 *
 * The same arrival rules and the same `push` as the recap takeover: Back lands
 * on the home, which has claimed this game for the session and stays put.
 */
export const useFullTimeTakeover = ({
	season,
	games,
	myResponses,
	ready,
}: {
	season: Season | null;
	games: Game[];
	myResponses: Record<string, Pick<GameResponse, 'status'>>;
	ready: boolean;
}) => {
	const router = useRouter();
	const { user } = useAuth();
	const { entries, loading } = useSeasonLedger(season && !season.recapReadyAt ? season.id : null);
	const settled = ready && !loading;

	const latest = useRef({ season, games, myResponses, entries, uid: user?.uid ?? null, settled });
	latest.current = { season, games, myResponses, entries, uid: user?.uid ?? null, settled };

	const arrive = useCallback(() => {
		const { season, games, myResponses, entries, uid, settled } = latest.current;

		if (!settled || !season || season.recapReadyAt || !uid || !isVisible()) return;

		const now = new Date();
		if (findLiveGame(games, season, myResponses, now)) return;

		const game = pickFullTimeTakeover(entries, uid, now, readFullTimeSeen(season.id));
		if (!game || !claimFullTimeSession(game.gameId)) return;

		router.push(`/s/${season.id}/g/${game.gameId}/full-time`);
	}, [router]);

	useOnArrival(settled, arrive);
};
