'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { Game, Season } from '@shared/types';
import { getRole } from '@shared/game';
import { useAuth } from '../lib/auth';
import { useGames, useSeason } from '../hooks/useData';
import { useSeasonScope } from './SeasonScope';

interface SeasonContextValue {
	/** Always available, even while `season` is still loading or missing. */
	seasonId: string;
	season: Season | null;
	games: Game[];
	loading: boolean;
	error: Error | null;
	/**
	 * Subscribe again after `error`. Firestore drops a listener for good once it
	 * has errored, so the screens showing the failure need a way back that isn't
	 * a page reload.
	 */
	retry: () => void;
	/** True when the signed-in user is on this season's roster. */
	isMember: boolean;
	/** True when they can edit the season: a season admin or a global app admin. */
	isAdmin: boolean;
	/** True when they are named on this season's own `adminUids`, app admins aside. */
	isSeasonAdmin: boolean;
	/** What role their response would be recorded under. */
	role: 'member' | 'extra';
}

const SeasonContext = createContext<SeasonContextValue>({
	seasonId: '',
	season: null,
	games: [],
	loading: true,
	error: null,
	retry: () => {},
	isMember: false,
	isAdmin: false,
	isSeasonAdmin: false,
	role: 'extra',
});

/**
 * Subscribes once per season and shares the result with every screen beneath
 * it, so navigating between the game list, roster and admin pages doesn't tear
 * down and rebuild the same two listeners.
 */
export const SeasonProvider = ({ seasonId, children }: { seasonId: string; children: ReactNode }) => {
	const { user } = useAuth();
	const { season, loading: seasonLoading, error: seasonError, retry: retrySeason } = useSeason(seasonId);
	const { games, loading: gamesLoading, error: gamesError, retry: retryGames } = useGames(seasonId);
	const { remember } = useSeasonScope();

	const uid = user?.uid ?? null;

	// Both, always. A screen only knows that something behind it failed, not
	// which of the two listeners it was, and re-subscribing a healthy one costs
	// a snapshot it was going to be handed anyway.
	const retry = useCallback(() => {
		retrySeason();
		retryGames();
	}, [retrySeason, retryGames]);

	// Screens above this route keep pointing their tabs back here.
	useEffect(() => {
		remember(seasonId);
	}, [seasonId, remember]);

	const value = useMemo<SeasonContextValue>(() => {
		const isMember = !!uid && !!season && season.memberUids.includes(uid);
		const isSeasonAdmin = !!uid && !!season && season.adminUids.includes(uid);

		return {
			seasonId,
			season,
			games,
			loading: seasonLoading || gamesLoading,
			error: seasonError ?? gamesError,
			retry,
			isMember,
			isAdmin: isSeasonAdmin || user?.isAppAdmin === true,
			isSeasonAdmin,
			role: season && uid ? getRole(uid, season) : 'extra',
		};
	}, [seasonId, season, games, seasonLoading, gamesLoading, seasonError, gamesError, retry, uid, user?.isAppAdmin]);

	return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
};

export const useSeasonContext = () => useContext(SeasonContext);
