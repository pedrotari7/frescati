import { claimOnce } from '../hooks/useArrival';

/**
 * The confirmation time of the latest full-time card this device has shown.
 *
 * A time rather than a game id, so a replay that confirms a game again after
 * its card was seen brings the corrected card back. Per device, in
 * `localStorage`, so it needs nothing on the user's profile and no rules
 * change. Somebody with a phone and a laptop sees the card on both, which is
 * the price.
 */
const FULL_TIME_SEEN_KEY = 'frescati:full-time-seen';

/** Which game's card this session has already jumped to. The e2e suite refuses this key to keep the card out of every other spec. */
const FULL_TIME_SESSION_KEY = 'frescati:full-time';

/** `null` when nothing is stored or storage cannot be read at all. */
export const readFullTimeSeen = (): string | null => {
	try {
		return window.localStorage.getItem(FULL_TIME_SEEN_KEY);
	} catch {
		return null;
	}
};

/** Keeps the later of the stored mark and `finalisedAt`. A refused write is dropped. */
export const markFullTimeSeen = (finalisedAt: string): void => {
	const current = readFullTimeSeen();
	if (current !== null && current >= finalisedAt) return;

	try {
		window.localStorage.setItem(FULL_TIME_SEEN_KEY, finalisedAt);
	} catch {
		// Private browsing on Safari. The card comes back next time, which is
		// better than a screen that throws.
	}
};

/** True the first time this session claims `gameId`, and false when storage refuses to record it. */
export const claimFullTimeSession = (gameId: string): boolean => claimOnce(FULL_TIME_SESSION_KEY, gameId);
