'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

interface SeasonScopeValue {
	/** The season the user is in, or was last in this session. */
	seasonId: string | null;
	remember: (seasonId: string) => void;
}

const SeasonScopeContext = createContext<SeasonScopeValue>({ seasonId: null, remember: () => {} });

/**
 * Lives above the whole signed-in app, so screens that sit outside a season —
 * /me — can still show that season's tabs.
 *
 * Without it, opening the Me tab from inside a season would swap the bar for a
 * different set of destinations and then swap it back on the way out, which is
 * the jarring bit: the tab you just tapped moves out from under your finger.
 *
 * Deliberately memory only, not localStorage: reading storage after hydration
 * would paint one bar and then replace it, trading one flicker for another.
 */
export const SeasonScopeProvider = ({ children }: { children: ReactNode }) => {
	const [seasonId, setSeasonId] = useState<string | null>(null);

	const value = useMemo<SeasonScopeValue>(() => ({ seasonId, remember: setSeasonId }), [seasonId]);

	return <SeasonScopeContext.Provider value={value}>{children}</SeasonScopeContext.Provider>;
};

export const useSeasonScope = () => useContext(SeasonScopeContext);
