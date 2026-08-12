'use client';

import { useEffect, useRef } from 'react';
import { isNewVisit } from '@shared/visit';
import { isVisible } from '../lib/device';
import { recordVisit } from '../lib/db/users';
import { captureError } from '../lib/sentry';

/**
 * Records that somebody came back to the app.
 *
 * The other half of the stamp lives in `upsertUserDoc`, which records the
 * arrival that *loaded* the page. This covers every return afterwards, which on
 * a phone is nearly all of them — an installed app is resumed far more often
 * than it is launched, and a session that lasts a fortnight would otherwise
 * report the fortnight-old launch as the last time they were seen.
 *
 * Between them the two paths are exhaustive: a page either loads on screen, or
 * loads hidden and reaches the screen through a `visibilitychange`. Nothing
 * else brings the app to the foreground.
 *
 * Note what is deliberately *absent*: any timer. See `shared/visit.ts` — the
 * point of the field is to go stale on somebody who has drifted away, and a
 * heartbeat from a backgrounded phone is exactly what stops it doing that.
 */
export const useLastSeen = (uid: string | null | undefined) => {
	/**
	 * What we believe the stored stamp says, so tab-flicking doesn't write on
	 * every flick. In memory rather than read back from the profile: the write
	 * is fire-and-forget and nothing on screen renders this, so a listener
	 * would cost a subscription to answer a question we already know.
	 */
	const lastSeen = useRef<string | null>(null);

	useEffect(() => {
		if (!uid) return;

		// A page that loaded in the foreground was already stamped by the
		// sign-in write, so start the gap from now rather than immediately
		// writing the same instant a second time. Loaded hidden, we have
		// nothing yet and the first trip to the foreground is the visit.
		lastSeen.current = isVisible() ? new Date().toISOString() : null;

		const onVisible = () => {
			if (!isVisible()) return;

			const now = new Date();
			if (!isNewVisit(lastSeen.current ?? undefined, now)) return;

			const at = now.toISOString();
			lastSeen.current = at;

			recordVisit(uid, at).catch(error => {
				// Back to "we don't know", so the next trip to the foreground
				// tries again straight away instead of sitting out the gap on
				// the strength of a write that never landed.
				lastSeen.current = null;

				// Nothing on screen depends on this, so it stays quiet — but a
				// stamp that never moves makes everybody look inactive, and
				// that failure is invisible from the inside.
				console.error('Failed to record visit', error);
				void captureError(error, { stage: 'recordVisit' });
			});
		};

		document.addEventListener('visibilitychange', onVisible);

		return () => document.removeEventListener('visibilitychange', onVisible);
	}, [uid]);
};
