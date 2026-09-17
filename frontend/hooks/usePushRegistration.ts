'use client';

import { useEffect, useState } from 'react';
import { checkPushSupport, isPushEnabled } from '../lib/push';
import type { PushSupport } from '../lib/push';

/**
 * What this browser can do about notifications, and whether this device is
 * already registered for them.
 *
 * Two questions rather than one, because the answers fail differently: an
 * iPhone on Safari can be told to install the app, while a device that simply
 * has not been asked yet gets a button. Both start `null` and stay there until
 * their answer lands, so a screen can hold its shape rather than claim
 * "unsupported" for the frame before the check comes back.
 *
 * `/me` offers this to a player and `/debug` reports it to an admin, and they
 * declared the same two effects to get it. The registration check is guarded
 * against a late answer landing after the screen has gone, which is the half
 * that is easy to leave out of a second copy.
 *
 * `setEnabled` comes back out because turning push on and off belongs to the
 * caller: only `/me` does it, and it already holds the message it shows
 * afterwards.
 */
export const usePushRegistration = (uid: string | undefined) => {
	const [support, setSupport] = useState<PushSupport | null>(null);
	const [enabled, setEnabled] = useState<boolean | null>(null);

	useEffect(() => {
		checkPushSupport().then(setSupport);
	}, []);

	useEffect(() => {
		if (!uid) return;

		let cancelled = false;
		isPushEnabled(uid).then(on => {
			if (!cancelled) setEnabled(on);
		});

		return () => {
			cancelled = true;
		};
	}, [uid]);

	return { support, enabled, setEnabled };
};
