'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RatingLedgerEntry, Season } from '@shared/types';
import { isVisible } from '../lib/device';
import { useAuth } from '../lib/auth';
import { useSeasonLedger, useUser } from './useData';
import { claimOnce, useOnArrival } from './useArrival';

const SENT_KEY = 'frescati:recap';

/**
 * Mark this season's recap as already shown this session, so the season home
 * does not send somebody back into it.
 *
 * The recap screen claims it on its own, because the takeover is not the only
 * way in. A notification, a profile link or a pasted URL opens it with nothing
 * claimed, and closing it would land on a home screen that sends them straight
 * back once.
 */
export const claimRecapSession = (seasonId: string): boolean => claimOnce(SENT_KEY, seasonId);

/**
 * Opens a finished season's recap instead of its home screen, for somebody who
 * played in it and has not watched it to the end.
 *
 * The same arrival rules as `useLiveGameRedirect`: on the load and on a return
 * to the foreground, never on a re-render.
 *
 * `push` where that hook uses `replace`, on purpose. The chevron goes back when
 * there is somewhere to go back to, and a replace would leave the step before
 * the season home behind the recap, so Back would skip the home altogether.
 * Pushing is safe because of the session mark: Back lands on the home, which has
 * already claimed this season and stays put.
 *
 * Once per season per session. Closing the recap early lands back on the home
 * screen, and it has to stay there; it takes over again next time the app is
 * opened, until the last slide is reached and `recapsWatched` says so.
 */
export const useRecapTakeover = ({
	seasonId,
	readyAt,
	entries,
	uid,
	watched,
	ready,
}: {
	seasonId: string;
	/** `season.recapReadyAt`. Absent means the season is not over. */
	readyAt: string | undefined;
	/** The season's ledger, which is how "played in it" is known. */
	entries: RatingLedgerEntry[];
	uid: string | null;
	/** The viewer's `recapsWatched`. */
	watched: string[] | undefined;
	/** The ledger and the viewer's profile have both loaded. */
	ready: boolean;
}) => {
	const router = useRouter();

	const latest = useRef({ seasonId, readyAt, entries, uid, watched, ready });
	latest.current = { seasonId, readyAt, entries, uid, watched, ready };

	const arrive = useCallback(() => {
		const { seasonId, readyAt, entries, uid, watched, ready } = latest.current;

		if (!ready || !readyAt || !uid || !isVisible()) return;
		if (watched?.includes(seasonId)) return;
		if (!entries.some(entry => entry.positions[uid] !== undefined)) return;
		if (!claimRecapSession(seasonId)) return;

		router.push(`/s/${seasonId}/recap`);
	}, [router]);

	useOnArrival(ready, arrive);
};

/**
 * `useRecapTakeover` fed for the season home.
 *
 * The ledger and the viewer's profile are only listened to once the season is
 * over, so an ordinary week on that screen costs no extra listener for a
 * takeover that cannot happen.
 */
export const useSeasonRecapTakeover = (season: Season | null, seasonReady: boolean) => {
	const { user } = useAuth();
	const readyAt = season?.recapReadyAt;
	const { entries, loading: ledgerLoading } = useSeasonLedger(readyAt ? season.id : null);
	const { user: me, loading: meLoading } = useUser(readyAt && user ? user.uid : null);

	useRecapTakeover({
		seasonId: season?.id ?? '',
		readyAt,
		entries,
		uid: user?.uid ?? null,
		watched: me?.recapsWatched,
		ready: seasonReady && !ledgerLoading && !meLoading,
	});
};
