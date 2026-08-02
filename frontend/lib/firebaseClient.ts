import type { FirebaseApp } from 'firebase/app';
import { getApps, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

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

let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

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
