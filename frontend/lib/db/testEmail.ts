import type { AppNotification, GameNotification, PushPayload } from '@shared/notifications';
import { callFunction } from './call';

export type EmailTestStatus = 'sent' | 'noAddress' | 'emailOff';

export interface EmailTestOutcome {
	uid: string;
	displayName: string;
	status: EmailTestStatus;
}

export interface TestEmailResult {
	/** Exactly what was sent, so the screen can show it rather than guess. */
	payload: PushPayload;
	/** How many of `results` actually got mailed. */
	sent: number;
	/** One row per person asked for, in the order they were sent, with why. */
	results: EmailTestOutcome[];
}

/**
 * Asks the backend to email one of the real notifications to a chosen set of
 * real accounts — not just the caller's own, which is all `sendTestPush` can
 * reach. See `backend/src/sendTestEmail.ts` for why that's the one exception.
 */
export const sendTestEmail = async (
	kind: GameNotification | AppNotification,
	uids: string[],
	target?: { seasonId: string; gameId: string }
): Promise<TestEmailResult> =>
	callFunction<
		{ kind: GameNotification | AppNotification; uids: string[]; seasonId?: string; gameId?: string },
		TestEmailResult
	>('sendTestEmail', { kind, uids, ...target });
