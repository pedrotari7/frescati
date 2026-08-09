import type { FirebaseApp } from 'firebase/app';
import { getApps, initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import type { Auth } from 'firebase/auth';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const config = {
	apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
	authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
	measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

const app: FirebaseApp = getApps()[0] ?? initializeApp(config);

/** Must match `REGION` in the backend, or every call 404s. */
const FUNCTIONS_REGION = 'europe-west1';

/**
 * App Check attests that a request came from *this app* rather than from a
 * script holding the same config. That is a different question from who may
 * sign in — anyone with a Google account may, deliberately, see "Who can see
 * the group" in the README — and this does nothing about a real person using
 * the real app. What it closes is the scripted case: the config above is public
 * by design, every read is a signed-in read, and without this anything holding
 * those values could sit and page the whole database, or churn responses to
 * spin up the triggers behind them.
 *
 * reCAPTCHA Enterprise, which is invisible: it scores the session rather than
 * showing a challenge, so nobody is asked to identify a bus.
 */
const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;

/**
 * A token registered under Project settings → App Check → Apps → Manage debug
 * tokens, for running `pnpm dev:live` against the real project from localhost,
 * where reCAPTCHA has no domain it recognises. Blank in production, and the
 * whole mechanism is inert without it.
 */
const APP_CHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;

let appCheckStarted = false;

/**
 * Started lazily, from whichever service is reached for first, because it has
 * to run before the first request that needs a token — and eagerly at module
 * scope it would run during prerendering, where `window` doesn't exist and
 * reCAPTCHA cannot load.
 *
 * Skipped entirely against the emulators: they don't verify App Check tokens,
 * and reaching for reCAPTCHA there would only fail slowly. Skipped too when no
 * site key is configured, so a checkout without one still runs.
 */
const startAppCheck = (): void => {
	if (appCheckStarted || typeof window === 'undefined') return;
	appCheckStarted = true;

	if (useEmulators || !APP_CHECK_SITE_KEY) return;

	// Read by the SDK off the global, and only honoured if it is set before
	// `initializeAppCheck`.
	if (APP_CHECK_DEBUG_TOKEN) {
		(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
			APP_CHECK_DEBUG_TOKEN;
	}

	initializeAppCheck(app, {
		provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
		isTokenAutoRefreshEnabled: true,
	});
};

/**
 * The app itself, for the one SDK with no accessor of its own here — Cloud
 * Messaging, which `lib/push.ts` reaches for directly.
 *
 * Exported as a function rather than as the instance so that *every* way into
 * Firebase from this file goes past `startAppCheck` first. A bare `app` export
 * was one import away from a call that skipped it, which is the kind of thing
 * that only shows up as a token quietly missing from one service's requests.
 */
export const getFirebaseApp = (): FirebaseApp => {
	startAppCheck();

	return app;
};

let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;

export const getFirebaseAuth = (): Auth => {
	if (!authInstance) {
		startAppCheck();
		authInstance = getAuth(app);
		if (useEmulators) connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
	}

	return authInstance;
};

export const getDb = (): Firestore => {
	if (!dbInstance) {
		startAppCheck();
		dbInstance = getFirestore(app);
		if (useEmulators) connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
	}

	return dbInstance;
};

/**
 * Callable functions. Only used for the handful of things rules can't express —
 * granting the app-admin claim — not as a general API layer.
 */
export const getFunctionsClient = (): Functions => {
	if (!functionsInstance) {
		startAppCheck();
		functionsInstance = getFunctions(app, FUNCTIONS_REGION);
		if (useEmulators) connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
	}

	return functionsInstance;
};
