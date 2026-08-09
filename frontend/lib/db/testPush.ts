import { httpsCallable } from 'firebase/functions';
import type { AppNotification, GameNotification, PushPayload } from '@shared/notifications';
import { getFunctionsClient } from '../firebaseClient';

export interface TestPushResult {
	/** Devices FCM accepted the message for. */
	sent: number;
	/**
	 * Whether the email fallback carried it instead — 1 or 0, since this only
	 * ever sends to the caller. Only ever nonzero when `sent` is 0.
	 */
	emailed: number;
	/** Registration tokens on the account, across every device. */
	devices: number;
	/** Whether the preference gating this kind is switched on. */
	prefEnabled: boolean;
	/** Exactly what was sent, so the screen can show it rather than guess. */
	payload: PushPayload;
}

/**
 * Asks the backend to send one of the real notifications to your own devices.
 *
 * A callable rather than a Firestore write because there is nothing for the
 * client to write: sending is an FCM call, which only the Admin SDK can make.
 * The function ignores any uid in the request and sends to the caller.
 */
export const sendTestPush = async (
	kind: GameNotification | AppNotification,
	target?: { seasonId: string; gameId: string }
): Promise<TestPushResult> => {
	const call = httpsCallable<
		{ kind: GameNotification | AppNotification; seasonId?: string; gameId?: string },
		TestPushResult
	>(getFunctionsClient(), 'sendTestPush');

	const { data } = await call({ kind, ...target });

	return data;
};
