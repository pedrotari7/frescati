'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Where each screen was left, and putting it back there on the way back.
 *
 * Next already scrolls a *new* screen to the top, and that half works: pushing
 * from a game to a player arrives at 0 wherever the game was scrolled to. What
 * does not work is the way back, and the reason is this app rather than the
 * router.
 *
 * Every screen here is drawn from a Firestore subscription, so at the moment a
 * step back lands there is nothing on the page yet: the season's listeners are
 * re-subscribing and the screen is a skeleton a few hundred pixels tall. The
 * router restores the recorded position into that, the browser clamps it to
 * whatever the short document can offer, and when the real content arrives a
 * moment later nothing puts the scroll back. Measured going back to a game left
 * at 1216: the page returned at 13.
 *
 * The same race with the data a little faster is what makes it look broken
 * rather than merely wrong. Restore against a document already at full height
 * and the clamp lands at the *bottom* instead, on a screen whose top bar is
 * `position: fixed` and therefore still perfectly correct. That is the bug as
 * it was reported: the header is right and the page under it is empty, and a
 * scroll brings it all back.
 *
 * So the waiting is the whole point. A position is only restored once the
 * document is tall enough to hold it, which for this app means once the
 * subscriptions have answered.
 */

/**
 * How long to keep waiting for the content, in milliseconds.
 *
 * A ceiling rather than a target: a screen whose data has already arrived is
 * restored on the next frame, and this only decides how long to keep hoping for
 * a slow one.
 *
 * It was one second and that was not enough, which is worth writing down
 * because the failure was silent and looked exactly like no fix at all. Coming
 * back to a game means `SeasonProvider` re-subscribing four listeners from
 * scratch, since a player's profile sits outside the season route and unmounts
 * it. On the emulators that reliably takes longer than a second, so the wait
 * expired against a document still the height of a skeleton and the position
 * came back as 13, the same number as before the fix existed.
 *
 * Three seconds covers that with room to spare. Past it the page is left where
 * it is rather than scrolled somewhere arbitrary: a screen that slow has been
 * showing a skeleton for three seconds, and whoever is looking at it has read
 * the top of it by now.
 */
const MAX_WAIT_MS = 3_000;

/** Paths remembered. More than anybody walks through before a reload. */
const LIMIT = 64;

export const useScrollMemory = () => {
	const positions = useRef(new Map<string, number>());

	/** The restore in flight, so a second navigation cancels the first. */
	const waiting = useRef<number | null>(null);

	const stopWaiting = useCallback(() => {
		if (waiting.current !== null) cancelAnimationFrame(waiting.current);
		waiting.current = null;
	}, []);

	/*
	 * Recorded as it happens rather than on the way out.
	 *
	 * By the time a navigation is observable, through a changed pathname, the
	 * position being left is already gone: the router has scrolled the new
	 * screen to the top. So the position has to be written down while the
	 * screen is still being read, which means on scroll.
	 *
	 * `location.pathname` rather than a value from React, because this listener
	 * is installed once and a stale closure would file every position under the
	 * first screen of the session.
	 */
	useEffect(() => {
		let frame = 0;

		const record = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const positionsByPath = positions.current;

				positionsByPath.set(window.location.pathname, window.scrollY);

				// Oldest first, which is what a Map's insertion order gives.
				if (positionsByPath.size > LIMIT) {
					positionsByPath.delete(positionsByPath.keys().next().value as string);
				}
			});
		};

		window.addEventListener('scroll', record, { passive: true });

		return () => {
			window.removeEventListener('scroll', record);
			cancelAnimationFrame(frame);
			stopWaiting();
		};
	}, [stopWaiting]);

	/**
	 * Put `path` back where it was, once there is room for it.
	 *
	 * Called only for a step backwards. A push is left alone: the router has
	 * already put it at the top, which is the right answer for a screen being
	 * seen for the first time and one this cannot improve on.
	 */
	const restore = useCallback(
		(path: string) => {
			stopWaiting();

			const target = positions.current.get(path) ?? 0;

			// Nothing to put back, and the router has already been to the top.
			if (target <= 0) return;

			/*
			 * Abandoned the moment somebody scrolls themselves. Waiting for
			 * content is a promise about a screen nobody has touched yet, and
			 * yanking a page out from under a thumb is worse than landing in the
			 * wrong place.
			 */
			let cancelled = false;
			const cancel = () => {
				cancelled = true;
			};

			const options = { passive: true, once: true } as const;
			window.addEventListener('wheel', cancel, options);
			window.addEventListener('touchstart', cancel, options);
			window.addEventListener('keydown', cancel, options);

			const done = () => {
				window.removeEventListener('wheel', cancel);
				window.removeEventListener('touchstart', cancel);
				window.removeEventListener('keydown', cancel);
				waiting.current = null;
			};

			const deadline = performance.now() + MAX_WAIT_MS;

			const attempt = () => {
				if (cancelled) return done();

				const room = document.documentElement.scrollHeight - window.innerHeight;

				// Tall enough to hold the position, which for this app is how a
				// screen says its subscriptions have answered.
				if (room >= target) {
					window.scrollTo({ top: target, behavior: 'instant' });
					return done();
				}

				// Out of patience. Left where it is rather than scrolled to the
				// bottom of a screen that never filled out, which is the shape of
				// the bug this exists to fix.
				if (performance.now() >= deadline) return done();

				waiting.current = requestAnimationFrame(attempt);
			};

			waiting.current = requestAnimationFrame(attempt);
		},
		[stopWaiting]
	);

	return restore;
};
