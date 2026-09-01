'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface AppHistoryValue {
	/** Whether this document has a screen of its own behind it. */
	canGoBack: boolean;
}

const AppHistoryContext = createContext<AppHistoryValue>({ canGoBack: false });

/**
 * Whether the back chevron has a real *back* to go to, or only an *up*.
 *
 * Every screen declares its way out as a `backHref`, the parent in the
 * hierarchy, and that is the only answer available to a screen somebody opened
 * from a notification or a pasted link. It is the wrong answer for every other
 * arrival, and increasingly so the further a screen sits from a single parent:
 * a player's profile is reached from a game's roster, a team sheet, the table
 * and other profiles, and putting all four of them back on the season page
 * throws away the screen they were reading. The same goes for the kit register,
 * which hangs off the Club tab and sends you back to Games.
 *
 * So the chevron goes *back* when this document has somewhere to go back to,
 * and falls back to the declared parent when it doesn't. This is the half that
 * knows which.
 *
 * A trail of paths rather than a counter, because a step backwards can cross
 * more than one entry, a desktop back menu, an Android long-press, and
 * landing on a screen already on the trail says exactly how many. Anything a
 * `popstate` lands on that isn't on it is a step *forward*, back through entries
 * this document had been rewound past, and counts like the push it is.
 *
 * The push/replace half is biased on purpose. A push is only counted when
 * `history.length` actually grew, so a `router.replace`, the live-game
 * redirect, the season picker resolving to a sole season, leaves the depth
 * where it was, because it left the history where it was. The price is a push
 * made after going back: it truncates the entries in front of it, so the length
 * doesn't grow, it reads as a replace and the chevron falls back to `backHref`.
 * That is the direction to be wrong in. Over-counting would eventually hand
 * `router.back()` an entry belonging to whatever was in the tab before the app,
 * and a back button that leaves the app is worse than one that goes somewhere
 * sensible.
 */
export const AppHistoryProvider = ({ children }: { children: ReactNode }) => {
	const pathname = usePathname();
	const [depth, setDepth] = useState(0);

	/** Every screen this document has walked through, deepest last. */
	const trail = useRef<string[]>([pathname]);

	/** `history.length` as last seen. A push grows it; a replace does not. */
	const entries = useRef(0);

	/**
	 * Where a `popstate` has just landed.
	 *
	 * Recorded rather than acted on: the event fires before React re-renders,
	 * and the effect below is the single place a move is accounted for.
	 */
	const poppedTo = useRef<string | null>(null);

	useEffect(() => {
		entries.current = window.history.length;

		const onPopState = () => {
			poppedTo.current = window.location.pathname;
		};

		window.addEventListener('popstate', onPopState);

		return () => window.removeEventListener('popstate', onPopState);
	}, []);

	useEffect(() => {
		const here = trail.current[trail.current.length - 1];
		if (pathname === here) return;

		const popped = poppedTo.current === pathname;
		const grew = window.history.length > entries.current;

		// Cleared on every move rather than only the one it described: a
		// `popstate` that moved nothing but the query never reaches this effect,
		// and a stale mark would read the next push as a step backwards.
		poppedTo.current = null;
		entries.current = window.history.length;

		// Searched below the screen we are on, so a path visited twice matches
		// the earlier visit rather than this one.
		const returnedTo = popped ? trail.current.lastIndexOf(pathname, trail.current.length - 2) : -1;

		if (returnedTo >= 0) trail.current = trail.current.slice(0, returnedTo + 1);
		else if (popped || grew) trail.current = [...trail.current, pathname];
		else trail.current = [...trail.current.slice(0, -1), pathname];

		setDepth(trail.current.length - 1);
	}, [pathname]);

	const value = useMemo<AppHistoryValue>(() => ({ canGoBack: depth > 0 }), [depth]);

	return <AppHistoryContext.Provider value={value}>{children}</AppHistoryContext.Provider>;
};

export const useAppHistory = () => useContext(AppHistoryContext);
