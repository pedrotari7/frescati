import { httpsCallable } from 'firebase/functions';
import type { PushDevice } from '@shared/types';
import { getFunctionsClient } from '../firebaseClient';

/** Devices per uid. A uid with nothing registered is simply absent. */
export type PushDevicesByUid = Record<string, PushDevice[]>;

/**
 * Which devices everybody has registered for push.
 *
 * A callable rather than a read, because `users/{uid}/pushTokens` is private to
 * its owner and stays that way — a registration token is a capability to push
 * to that phone. The function strips the token and hands back only what the
 * admin screen needs; see `backend/src/getPushDevices.ts`.
 */
export const getPushDevices = async (): Promise<PushDevicesByUid> => {
	const call = httpsCallable<void, { devices: PushDevicesByUid }>(getFunctionsClient(), 'getPushDevices');

	const { data } = await call();

	return data.devices;
};
