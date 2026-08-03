/**
 * Runs before any test file is required, so `lib/firebase`'s `initializeApp()`
 * — and every `getFirestore()`/`getAuth()` call downstream of it — picks up
 * the emulators instead of reaching for production.
 */
process.env.GCLOUD_PROJECT = 'demo-frescati';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-frescati' });
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
