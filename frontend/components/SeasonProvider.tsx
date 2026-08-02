'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
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
	/** True when the signed-in user is on this season's roster. */
	isMember: boolean;
	/** True when they can edit the season: a season admin or a global app admin. */
	isAdmin: boolean;
	/** What role their response would be recorded under. */
	role: 'member' | 'extra';
}

const SeasonContext = createContext<SeasonContextValue>({
	seasonId: '',
	season: null,
	games: [],
	loading: true,
	error: null,
	isMember: false,
	isAdmin: false,
	role: 'extra',
});

/**
 * Subscribes once per season and shares the result with every screen beneath
 * it, so navigating between the game list, roster and admin pages doesn't tear
 * down and rebuild the same two listeners.
 */
export const SeasonProvider = ({ seasonId, children }: { seasonId: string; children: ReactNode }) => {
	const { user } = useAuth();
	const { season, loading: seasonLoading, error: seasonError } = useSeason(seasonId);
	const { games, loading: gamesLoading, error: gamesError } = useGames(seasonId);
	const { remember } = useSeasonScope();

	const uid = user?.uid ?? null;

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
			isMember,
			isAdmin: isSeasonAdmin || user?.isAppAdmin === true,
			role: season && uid ? getRole(uid, season) : 'extra',
		};
	}, [seasonId, season, games, seasonLoading, gamesLoading, seasonError, gamesError, uid, user?.isAppAdmin]);

	return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
};

export const useSeasonContext = () => useContext(SeasonContext);
