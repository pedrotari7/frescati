import { claimOnce } from '../hooks/useArrival';

/**
 * For each season, the confirmation time of the latest full-time card this
 * device has shown, as `{ [seasonId]: finalisedAt }`.
 *
 * Per season, so closing Tuesday's card does not hide Sunday's, which was
 * confirmed earlier. A time rather than a game id, so a result that is cleared
 * and confirmed again, which stamps a new `finalisedAt`, takes over once more.
 * A rating replay keeps the original stamp and does not. Per device, in
 * `localStorage`, so it needs nothing on the user's profile and no rules
 * change. Somebody with a phone and a laptop sees the card on both, which is
 * the price.
 */
const FULL_TIME_SEEN_KEY = 'frescati:full-time-seen';

/** Which game's card this session has already jumped to. The e2e suite refuses this key to keep the card out of every other spec. */
const FULL_TIME_SESSION_KEY = 'frescati:full-time';

const readAll = (): Record<string, string> => {
	try {
		const stored = JSON.parse(window.localStorage.getItem(FULL_TIME_SEEN_KEY) ?? '{}');

		return stored && typeof stored === 'object' ? stored : {};
	} catch {
		return {};
	}
};

/** `null` when nothing is stored for the season or storage cannot be read at all. */
export const readFullTimeSeen = (seasonId: string): string | null => readAll()[seasonId] ?? null;

/** Keeps the later of the season's stored mark and `finalisedAt`. A refused write is dropped. */
export const markFullTimeSeen = (seasonId: string, finalisedAt: string): void => {
	const marks = readAll();
	if ((marks[seasonId] ?? '') >= finalisedAt) return;

	try {
		window.localStorage.setItem(FULL_TIME_SEEN_KEY, JSON.stringify({ ...marks, [seasonId]: finalisedAt }));
	} catch {
		// Private browsing on Safari. The card comes back next time, which is
		// better than a screen that throws.
	}
};

/** True the first time this session claims `gameId`, and false when storage refuses to record it. */
export const claimFullTimeSession = (gameId: string): boolean => claimOnce(FULL_TIME_SESSION_KEY, gameId);
