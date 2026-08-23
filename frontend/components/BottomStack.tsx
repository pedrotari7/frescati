'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { classNames } from '../lib/utils/reactHelper';

const HOST_ID = 'bottom-stack';

/**
 * The one slot at the bottom of the screen, and the only thing that knows where
 * it is.
 *
 * Three things want that space: a toast, the offer of a new build, and the
 * nudge to install. Each of them used to be its own fixed element guessing
 * its own offset. The two banners guessed the same one and differed only in
 * `z-index`, so the case `UpdatePrompt`'s comment anticipates ("on the rare
 * occasion both are up") put one exactly on top of the other rather than above
 * it, and the toast cleared a tab bar that isn't there on a desktop.
 *
 * They are in three different subtrees: the toast belongs to its provider, the
 * update prompt to the service worker registration that alone knows an update
 * exists, so they reach this through a portal rather than by being made
 * children of it. Which is the point: one container laying them out with `gap`,
 * and nobody adding a fourth has to work out what the other three are doing.
 */
const BottomStackHost = () => (
	<div
		id={HOST_ID}
		className={classNames(
			'pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-2',
			// Clears the tab bar and the home indicator on a phone; on a desktop
			// the bar is hidden, so it just sits off the bottom edge.
			'pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-4'
		)}
	/>
);

/**
 * Puts one thing in that slot.
 *
 * `order` decides what sits above what, because portals land in whatever order
 * they happen to mount and that is not something to leave to chance: the offer
 * of a new build is the one thing here worth acting on now, and a toast is
 * transient, so it goes nearest the thumb.
 *
 * Renders nothing until the host is found, which takes an effect. The host is
 * a sibling in the layout and does not exist during the render that first asks
 * for it, nor on the server at all.
 */
export const BottomSlot = ({ order, children }: { order: 1 | 2 | 3; children: ReactNode }) => {
	const [host, setHost] = useState<HTMLElement | null>(null);

	useEffect(() => setHost(document.getElementById(HOST_ID)), []);

	if (!host) return null;

	return createPortal(<div className={classNames('pointer-events-auto w-full', ORDER[order])}>{children}</div>, host);
};

// Spelled out rather than composed, since Tailwind reads these as literals.
const ORDER = { 1: 'order-1', 2: 'order-2', 3: 'order-3' } as const;

export default BottomStackHost;
