'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { Game, Season } from '@shared/types';
import type { DebtStanding } from '@shared/finances';
import { debtStanding } from '@shared/finances';
import { getRole } from '@shared/game';
import { useAuth } from '../lib/auth';
import { useDues, useGames, useSeason } from '../hooks/useData';
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
	/**
	 * Whether they owe this season money, and whether that stops them signing up.
	 *
	 * The charges themselves rather than the `debtors` marker a security rule
	 * reads. The marker is a Cloud Function's answer, so it lands a moment after
	 * the charge does, and this is the direction the lag has to fall: a screen
	 * reading the marker would draw a live In button for the moment between an
	 * admin raising a charge and the trigger noticing, and the rule would refuse
	 * the tap. Reading the charges puts the screen and the rule in step.
	 */
	debt: DebtStanding;
	/**
	 * What `debt` does to an In button, or `undefined` when it does nothing.
	 *
	 * Derived here rather than at each of the three screens that draw one of
	 * these controls, because the part worth getting wrong is which arm of the
	 * union locks: an admin's `owing` must not, and a copy of that ternary per
	 * screen is two chances to forget it.
	 */
	debtLock: { outstanding: number; href: string } | undefined;
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
	debt: { standing: 'clear' },
	debtLock: undefined,
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

	// Their own charges and nobody else's, which is all this needs and all the
	// rules hand somebody outside the squad. The finances screen keeps its own
	// listener on the whole book, because it draws the whole book; the two
	// overlap on that one screen and a `where` on your own uid is a handful of
	// documents.
	const { dues, loading: duesLoading, error: duesError, retry: retryDues } = useDues(seasonId, uid, false);

	// All four, always. A screen only knows that something behind it failed,
	// not which listener it was, and re-subscribing a healthy one costs a
	// snapshot it was going to be handed anyway. The dues are in here even
	// though their failure never puts a screen in front of this button: a
	// season that failed for another reason is the only chance a dropped books
	// listener gets to come back without a reload.
	const retry = useCallback(() => {
		retrySeason();
		retryGames();
		retryAnswers();
		retryDues();
	}, [retrySeason, retryGames, retryAnswers, retryDues]);

	// Screens above this route keep pointing their tabs back here.
	useEffect(() => {
		remember(seasonId);
	}, [seasonId, remember]);

	const value = useMemo<SeasonContextValue>(() => {
		const isMember = !!uid && !!season && season.memberUids.includes(uid);
		const isSeasonAdmin = !!uid && !!season && season.adminUids.includes(uid);
		const isAdmin = isSeasonAdmin || user?.isAppAdmin === true;
		const debt: DebtStanding = duesError ? { standing: 'clear' } : debtStanding(uid, dues, isAdmin);

		return {
			seasonId,
			season,
			games,
			myResponses,
			// The dues are in here for the reason the answers are: a screen must
			// not draw a real state it does not know yet, and a debt it has not
			// heard about yet draws a live In button the rules will refuse.
			loading: seasonLoading || gamesLoading || answersLoading || duesLoading,
			// `duesError` deliberately not among these. Losing the books is a
			// reason to stop claiming somebody is blocked, not a reason to take
			// the whole season away: the screens read this to decide whether to
			// show a failure instead of a game list, and a season nobody is
			// charged for is a season nobody can be locked out of. The rule is
			// still the gate, so failing open here costs a refused write and a
			// toast, not a way round the lock. `useFirestoreSubscription` has
			// already reported it to Sentry.
			error: seasonError ?? gamesError ?? answersError,
			retry,
			isMember,
			isAdmin,
			isSeasonAdmin,
			role: season && uid ? getRole(uid, season) : 'extra',
			debt,
			debtLock:
				debt.standing === 'blocked'
					? { outstanding: debt.outstanding, href: `/s/${seasonId}/finances` }
					: undefined,
		};
	}, [
		seasonId,
		season,
		games,
		myResponses,
		seasonLoading,
		gamesLoading,
		answersLoading,
		duesLoading,
		seasonError,
		gamesError,
		answersError,
		dues,
		duesError,
		retry,
		uid,
		user?.isAppAdmin,
	]);

	return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
};

export const useSeasonContext = () => useContext(SeasonContext);
