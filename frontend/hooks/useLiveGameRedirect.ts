'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, GameResponse, Season } from '@shared/types';
import { findLiveGame } from '@shared/game';
import { isVisible } from '../lib/device';

const SENT_KEY = 'frescati:live-game';

/**
 * Whether this is the first time we've offered to open this game, recording it
 * if so.
 *
 * The mark is the game id rather than a flag, so next week's game gets its own
 * offer, an installed app can sit in one document for weeks, and a
 * once-per-session flag would spend itself on the first game and never fire
 * again.
 *
 * `sessionStorage` throws outright where storage is blocked, which on Safari in
 * private mode is a phone this app really runs on. Being unable to record the
 * jump means not taking it: the season page is a perfectly good place to land,
 * and an unrecorded redirect is one the back button can't escape.
 */
const claimRedirect = (gameId: string): boolean => {
	try {
		if (window.sessionStorage.getItem(SENT_KEY) === gameId) return false;

		window.sessionStorage.setItem(SENT_KEY, gameId);
		return true;
	} catch {
		return false;
	}
};

/**
 * Opens the game somebody is playing in right now when they come to the app.
 *
 * During the ninety minutes a game is actually on, the game page is the only
 * screen anybody wants: who turned up, what the teams are, what the score is.
 * Making them tap through the season list to reach it is a tap too many with a
 * ball at their feet.
 *
 * **Only on arrival**, which is the load *or* a return to the foreground, the
 * same exhaustive pair `useLastSeen` splits a visit into, and for the same
 * reason: an installed app is resumed far more often than it is launched, so
 * mount alone would miss the person opening it at half time. Deliberately not
 * on the `useNow` tick that feeds it. Someone reading the season page at 18:59
 * has already entered the app, and throwing them onto another screen as kickoff
 * passes is a page that moves under a thumb.
 *
 * Once per game, so the back button out of the game page works. Without the
 * mark, returning to the season page would re-enter this and bounce straight
 * back, and `/seasons` replacing itself with a sole active season means the
 * loop has two ways to close.
 */
export const useLiveGameRedirect = ({
	seasonId,
	season,
	games,
	myResponses,
	ready,
}: {
	seasonId: string;
	season: Season | null;
	games: Game[];
	/** The signed-in player's answers, keyed by game id. */
	myResponses: Record<string, Pick<GameResponse, 'status'>>;
	/** Season, games and responses have all loaded, so "no answer" is the real thing. */
	ready: boolean;
}) => {
	const router = useRouter();

	// Read through a ref so the foreground listener below can be registered once
	// and still see the current season rather than the one that was on screen
	// when it was attached.
	const latest = useRef({ seasonId, season, games, myResponses, ready });
	latest.current = { seasonId, season, games, myResponses, ready };

	const arrive = useCallback(() => {
		const { seasonId, season, games, myResponses, ready } = latest.current;

		if (!ready || !season || !isVisible()) return;

		const live = findLiveGame(games, season, myResponses);
		if (!live || !claimRedirect(live.id)) return;

		// `replace`, not `push`: nobody chose the season page this time round, it
		// was on the way through. Pushing would spend a Back tap undoing a
		// navigation they never made.
		router.replace(`/s/${seasonId}/g/${live.id}`);
	}, [router]);

	// The load: the first render where the answer is knowable, and only that one.
	//
	// Latched on a ref rather than left to the dependency array, which would make
	// "arrived" mean "nothing in this list changed", and `router` is in that
	// list. A `useRouter` that handed back a fresh object per render would turn
	// every re-render into another arrival, which is precisely the tick-driven
	// jump this hook exists to avoid.
	const arrived = useRef(false);

	useEffect(() => {
		if (!ready || arrived.current) return;

		// Set before the attempt, not after: a page that loaded in the background
		// has had its load arrival, and the trip to the foreground below is the
		// one that should decide.
		arrived.current = true;
		arrive();
	}, [ready, arrive]);

	// The resume.
	useEffect(() => {
		document.addEventListener('visibilitychange', arrive);

		return () => document.removeEventListener('visibilitychange', arrive);
	}, [arrive]);
};
