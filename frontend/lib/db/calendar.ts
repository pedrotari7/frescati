import { callFunction } from './call';

/**
 * The season's subscribable calendar link. One shared link per season, not
 * per person — see `backend/src/calendarLink.ts` for why — so every
 * signed-in user gets the same URL back, and only a season admin can rotate
 * it away from everyone at once.
 */
export const getCalendarLink = async (seasonId: string): Promise<string> =>
	(await callFunction<{ seasonId: string }, { url: string }>('getCalendarLink', { seasonId })).url;

/** Season admins only — kills every existing subscriber's copy in one move. */
export const rotateCalendarToken = async (seasonId: string): Promise<string> =>
	(await callFunction<{ seasonId: string }, { url: string }>('rotateCalendarToken', { seasonId })).url;
