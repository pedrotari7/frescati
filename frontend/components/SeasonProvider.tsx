'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { Game, Season } from '@shared/types';
import { getRole } from '@shared/game';
import { useAuth } from '../lib/auth';
import { useGames, useSeason } from '../hooks/useData';
import type { MyResponses } from '../hooks/useMyResponses';
import { useMyResponses } from '../hooks/useMyResponses';
import { useSeasonScope } from './SeasonScope';

interface SeasonContextValue {
	/** Always available, even while `season` is still loading or missing. */
	seasonId: string;
	season: Season | null;
	games: Game[];
	/**
	 * Every answer the signed-in user has given, keyed by game id. Shared from
	 * here so a screen never has to ask twice, and so `loading` below covers it.
	 */
	myResponses: MyResponses;
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
	myResponses: {},
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
 * down and rebuild the same three listeners.
 *
 * The user's own answers sit here rather than on each of the three screens that
 * read them. That saves two collection-group listeners and a rebuild of the
 * third on every tab, but the reason they had to move is `loading`. An answers
 * listener that has not landed takes nothing off a screen, it only makes it
 * wrong: a game you are in for draws as one you never answered, and fixes
 * itself a frame later. On iOS that late correction left the pill drawn to a
 * third of its height until a scroll or a tap forced the card to paint again.
 * Folding the flag in here is what stops each screen having to remember the
 * rule the tournament page already spells out: a screen must not draw a real
 * state it does not know yet.
 */
export const SeasonProvider = ({ seasonId, children }: { seasonId: string; children: ReactNode }) => {
	const { user } = useAuth();
	const { season, loading: seasonLoading, error: seasonError, retry: retrySeason } = useSeason(seasonId);
	const { games, loading: gamesLoading, error: gamesError, retry: retryGames } = useGames(seasonId);
	const { myResponses, loading: answersLoading, error: answersError, retry: retryAnswers } = useMyResponses();
	const { remember } = useSeasonScope();

	const uid = user?.uid ?? null;

	// All three, always. A screen only knows that something behind it failed,
	// not which listener it was, and re-subscribing a healthy one costs a
	// snapshot it was going to be handed anyway.
	const retry = useCallback(() => {
		retrySeason();
		retryGames();
		retryAnswers();
	}, [retrySeason, retryGames, retryAnswers]);

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
			myResponses,
			loading: seasonLoading || gamesLoading || answersLoading,
			error: seasonError ?? gamesError ?? answersError,
			retry,
			isMember,
			isAdmin: isSeasonAdmin || user?.isAppAdmin === true,
			isSeasonAdmin,
			role: season && uid ? getRole(uid, season) : 'extra',
		};
	}, [
		seasonId,
		season,
		games,
		myResponses,
		seasonLoading,
		gamesLoading,
		answersLoading,
		seasonError,
		gamesError,
		answersError,
		retry,
		uid,
		user?.isAppAdmin,
	]);

	return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
};

export const useSeasonContext = () => useContext(SeasonContext);
