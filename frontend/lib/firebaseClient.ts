import type { FirebaseApp } from 'firebase/app';
import { getApps, initializeApp } from 'firebase/app';
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

export const app: FirebaseApp = getApps()[0] ?? initializeApp(config);

/** Must match `REGION` in the backend, or every call 404s. */
const FUNCTIONS_REGION = 'europe-west1';

let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;

export const getFirebaseAuth = (): Auth => {
	if (!authInstance) {
		authInstance = getAuth(app);
		if (useEmulators) connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
	}

	return authInstance;
};

export const getDb = (): Firestore => {
	if (!dbInstance) {
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
		functionsInstance = getFunctions(app, FUNCTIONS_REGION);
		if (useEmulators) connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
	}

	return functionsInstance;
};
