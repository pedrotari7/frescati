'use client';

import { useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/**
 * How long after a press its own click can still turn up, in milliseconds.
 *
 * The compatibility click follows its pointerup within a frame or two. This is
 * long enough to survive a main thread busy with a navigation, and short enough
 * that the next deliberate press never lands inside it.
 */
const CLICK_WINDOW_MS = 700;

/**
 * Act on the press itself rather than on the click that may never come.
 *
 * The top bar and the tab bar are `position: fixed`, so they hold still over a
 * page that is still coasting from a flick. Press one during that coast on iOS
 * and the touch is spent stopping the scroll: the browser treats the first
 * finger down as a brake and dispatches no click at all. It swallows the press,
 * the tab has to be pressed again, and from the outside that looks like an app
 * ignoring you until the page settles.
 *
 * Pointer events survive it. `pointerdown` is the event that stops the coast,
 * and `pointerup` follows it whatever the page is doing, so a control that acts
 * on the pair gets its press through on the first try. The click, if one turns
 * up at all, is that same press arriving twice, and this swallows it.
 *
 * A mouse and a keyboard keep the click, because neither of them ever lost it to
 * a scroll, and a click is the only thing a keyboard sends. So `run` is what the
 * control does, however it was reached.
 *
 * This is for the fixed chrome and nothing else. Inside the page the brake is
 * the right answer: a flick stopped by a finger landing on a game row should
 * stop there, not open the game.
 */
export const useTap = (run: () => void) => {
	/** The touch in flight, or null when the pointer is one to leave alone. */
	const pointerId = useRef<number | null>(null);

	/**
	 * When the press was last acted on, so its click can be told apart, and null
	 * when no press has been.
	 *
	 * Null rather than a zero, because `performance.now()` counts from the moment
	 * the document loaded, so zero is a real instant rather than a spare one.
	 * Reading it as a spare one swallowed every press made in the first
	 * `CLICK_WINDOW_MS` of a screen's life. That is the back chevron pressed as
	 * soon as the game has painted, and four e2e specs went red saying so.
	 */
	const ranAt = useRef<number | null>(null);

	const onPointerDown = (event: PointerEvent<HTMLElement>) => {
		ranAt.current = null;
		pointerId.current = event.isPrimary && event.pointerType !== 'mouse' ? event.pointerId : null;
	};

	const onPointerUp = (event: PointerEvent<HTMLElement>) => {
		if (pointerId.current !== event.pointerId) return;
		pointerId.current = null;

		// A finger that slid off the control is a press being taken back. It has
		// to be checked rather than assumed, because the implicit capture on a
		// touch pointer delivers the pointerup here wherever it happened.
		const box = event.currentTarget.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;

		if (!inside) return;

		ranAt.current = performance.now();
		run();
	};

	const onPointerCancel = () => {
		pointerId.current = null;
	};

	const onClick = (event: MouseEvent<HTMLElement>) => {
		/*
		 * A page that was standing still sends the click as well, and that click
		 * is the press already acted on above. Swallowing it is what keeps one
		 * tap from counting twice, and for a `next/link` it is also how the Link
		 * is told to stay put: it hands the event here first and checks
		 * `defaultPrevented` after.
		 */
		if (ranAt.current !== null && performance.now() - ranAt.current < CLICK_WINDOW_MS) {
			return event.preventDefault();
		}

		/*
		 * A modifier or a second button turns a click on a link into open in a
		 * new tab or a new window. That belongs to the browser, so this leaves
		 * the event alone and lets the default happen.
		 */
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

		// The mouse and the keyboard, which never lost their click to a scroll.
		event.preventDefault();
		run();
	};

	return { onPointerDown, onPointerUp, onPointerCancel, onClick };
};
