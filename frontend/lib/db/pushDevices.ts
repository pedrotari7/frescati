import type { PushDevice } from '@shared/types';
import { callFunction } from './call';

/** Devices per uid. A uid with nothing registered is simply absent. */
export type PushDevicesByUid = Record<string, PushDevice[]>;

export interface NotificationReach {
	devices: PushDevicesByUid;
	/** Uids the email fallback has a usable address for. Never the addresses. */
	addressed: Set<string>;
	/** Whether a sender is configured at all. Without one, nothing is emailed. */
	emailConfigured: boolean;
}

/**
 * What the app knows about reaching everybody.
 *
 * A callable rather than a read, because `users/{uid}/pushTokens` is private to
 * its owner and stays that way: a registration token is a capability to push
 * to that phone, and because an email address lives in Firebase Auth, which no
 * client can read at all. The function strips both and hands back only what the
 * admin screen needs; see `backend/src/getPushDevices.ts`.
 */
export const getNotificationReach = async (): Promise<NotificationReach> => {
	// The one callable that takes no request body. Passed explicitly rather than
	// omitted: TypeScript only lets a `void` argument be dropped when the
	// parameter is declared `void`, not when it is a generic that resolved to it.
	const data = await callFunction<void, { devices: PushDevicesByUid; addressed: string[]; emailConfigured: boolean }>(
		'getPushDevices',
		undefined
	);

	return { devices: data.devices, addressed: new Set(data.addressed ?? []), emailConfigured: data.emailConfigured };
};
