'use client';

import { useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { subscribeToMyWatching, unwatchGame, watchGame } from '../lib/db/watchers';
import { useFirestoreSubscription } from './useFirestoreSubscription';
import { useWrite } from './useWrite';

const NONE: ReadonlySet<string> = new Set<string>();

/**
 * Following games, from anywhere.
 *
 * Bundles the signed-in uid, the live state and the write, because the bell is
 * drawn on three screens now — the game itself, the next-game card, and every
 * row of the season's calendar — and the three of them have to move together.
 * Split across the call sites, the toggle on one screen could quietly write
 * while another only read.
 *
 * Takes a season and not a game, the same shape `useRespond` takes for the same
 * reason: a screen that lists games needs one hook for all of them, and asking
 * per game is what a listener per row looks like. What it holds is every game
 * followed anywhere, so `isWatching` is answered from memory rather than from a
 * read.
 *
 * Empty until the first snapshot lands, so a bell draws *off* before it draws
 * anything: off is both the default and the safe thing to show — an on switch
 * that flicks off a moment later reads as a lost setting.
 *
 * `canWatch` is false when nobody is signed in, which is the caller's cue to
 * draw no bell at all rather than a dead one.
 */
export const useWatchGames = (seasonId: string | null) => {
	const { user } = useAuth();
	const write = useWrite();
	const uid = user?.uid ?? null;

	const { data: watched } = useFirestoreSubscription<ReadonlySet<string>>(
		NONE,
		uid ? (onChange, onError) => subscribeToMyWatching(uid, onChange, onError) : null,
		[uid],
		'myWatching'
	);

	const isWatching = useCallback((gameId: string) => watched.has(gameId), [watched]);

	const toggleWatch = useCallback(
		(gameId: string, next: boolean) => {
			if (!seasonId || !uid) return;

			void write(
				() => (next ? watchGame(seasonId, gameId, uid) : unwatchGame(seasonId, gameId, uid)),
				next ? "Couldn't turn notifications on for this game." : "Couldn't turn them off."
			);
		},
		[seasonId, uid, write]
	);

	return { isWatching, canWatch: uid !== null, toggleWatch };
};
