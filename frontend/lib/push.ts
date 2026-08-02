import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from './firebaseClient';
import { pushTokensCol } from './db/paths';

/**
 * Web push, on top of the same service worker that does the offline caching.
 *
 * The backend sends **data-only** FCM messages so the SDK doesn't auto-display
 * them; `sw.js` owns rendering and click handling. That keeps everything in one
 * worker instead of also shipping `firebase-messaging-sw.js`.
 */

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

const isStandalone = () =>
	window.matchMedia('(display-mode: standalone)').matches ||
	(window.navigator as { standalone?: boolean }).standalone === true;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/**
 * iOS only allows push for apps added to the home screen, and silently fails
 * otherwise — worth telling people rather than showing a toggle that can't work.
 */
export const checkPushSupport = async (): Promise<PushSupport> => {
	if (typeof window === 'undefined') return 'unsupported';
	if (!('Notification' in window) || !('serviceWorker' in navigator)) {
		return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
	}

	if (isIos() && !isStandalone()) return 'needs-install';

	return (await isSupported()) ? 'supported' : 'unsupported';
};

export const getPermission = (): NotificationPermission =>
	typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';

/**
 * Ask for permission and register this device. Call it from a user gesture —
 * browsers reject `requestPermission` otherwise, and asking on page load is the
 * fastest way to get permanently blocked.
 */
export const enablePush = async (uid: string): Promise<{ ok: boolean; reason?: string }> => {
	if (!VAPID_KEY) return { ok: false, reason: 'Push is not configured for this deployment.' };

	const support = await checkPushSupport();
	if (support === 'needs-install') {
		return { ok: false, reason: 'On iPhone, add Frescati to your home screen first.' };
	}
	if (support === 'unsupported') return { ok: false, reason: 'This browser cannot do notifications.' };

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return { ok: false, reason: 'Notifications are blocked in your browser settings.' };

	const registration = await navigator.serviceWorker.ready;

	const token = await getToken(getMessaging(app), {
		vapidKey: VAPID_KEY,
		// Reuse our worker rather than letting the SDK register its own.
		serviceWorkerRegistration: registration,
	});

	if (!token) return { ok: false, reason: 'Could not register this device.' };

	// Token as the document id, so re-registering the same device overwrites
	// instead of piling up duplicates that all push to one phone.
	await setDoc(doc(pushTokensCol(uid), token), {
		token,
		createdAt: new Date().toISOString(),
		userAgent: navigator.userAgent,
	});

	return { ok: true };
};

export const disablePush = async (uid: string): Promise<void> => {
	const messaging = getMessaging(app);
	const registration = await navigator.serviceWorker.ready;

	// Read the token before deleting it — afterwards there's nothing to look up.
	const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(
		() => null
	);

	if (token) {
		await deleteDoc(doc(pushTokensCol(uid), token));
		await deleteToken(messaging).catch(() => undefined);
	}
};
