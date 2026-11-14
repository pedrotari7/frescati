import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();

export const messaging = () => getMessaging();

export const REGION = 'europe-west1';

/**
 * Whether a callable refuses a request that carries no valid App Check token.
 *
 * The console's Enforce switch covers Firestore and Storage, and it does not
 * reach a callable: a v2 callable only checks the token when its own options
 * say so. Without this, a script holding the app's public config could call
 * every function the rules were meant to keep it away from.
 *
 * Off in the emulator, because the client starts no App Check when it is
 * pointed at one, so every local call would arrive without a token.
 */
export const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true';
