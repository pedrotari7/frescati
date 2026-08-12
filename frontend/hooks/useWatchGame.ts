'use client';

import { useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { unwatchGame, watchGame } from '../lib/db/watchers';
import { useWatching } from './useData';
import { useWrite } from './useWrite';

/**
 * Following a game, from anywhere.
 *
 * Bundles the signed-in uid, the live state and the write, because the bell is
 * drawn in two places — the game screen and the next-game card — and the three
 * of them have to move together. Split across the call sites, the toggle on one
 * screen could quietly write while the other only read.
 *
 * `canWatch` is false when nobody is signed in, which is the caller's cue to
 * draw no bell at all rather than a dead one.
 */
export const useWatchGame = (seasonId: string | null, gameId: string | null) => {
	const { user } = useAuth();
	const write = useWrite();
	const uid = user?.uid ?? null;
	const { watching } = useWatching(seasonId, gameId, uid);

	const toggleWatch = useCallback(
		(next: boolean) => {
			if (!seasonId || !gameId || !uid) return;

			void write(
				() => (next ? watchGame(seasonId, gameId, uid) : unwatchGame(seasonId, gameId, uid)),
				next ? "Couldn't turn notifications on for this game." : "Couldn't turn them off."
			);
		},
		[seasonId, gameId, uid, write]
	);

	return { watching, canWatch: uid !== null, toggleWatch };
};
