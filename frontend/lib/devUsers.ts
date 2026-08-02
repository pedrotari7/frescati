'use client';

import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth } from './firebaseClient';

/**
 * Signing in as a seeded player, without a Google account.
 *
 * The app only knows one way in — a Google popup — which is the right answer in
 * production and useless against a local database, where the whole point is to
 * be five different people in a minute and see what each of them sees.
 *
 * The Auth emulator has a way out of that: hand it an **unsigned** JSON object
 * where a real provider would send a signed token, and it takes the fields at
 * face value. Match `sub` against the provider link the seeder imported and it
 * resolves to the seeded uid, so the person who signs in is the same person the
 * seeded seasons, responses and ratings are all about.
 *
 * Everything here is inert unless the app is pointed at the emulators.
 */

/** Inlined at build time, so a production bundle never reaches any of this. */
export const DEV_MODE = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

export interface DevUser {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string | null;
	/** What the emulator matches the imported Google link on. */
	sub: string;
	/** Who this person is in the seeded world — admin, member, stranger. */
	hint: string;
}

export interface DevUserFile {
	scenario: string;
	generatedAt: string;
	users: DevUser[];
}

/**
 * Written by `pnpm seed` into `frontend/public`, rather than read out of
 * Firestore: the switcher's whole job is to be useful *before* anyone is signed
 * in, and security rules — correctly — refuse to show the roster to a stranger.
 */
export const loadDevUsers = async (): Promise<DevUserFile | null> => {
	if (!DEV_MODE) return null;

	try {
		const response = await fetch('/dev-users.json', { cache: 'no-store' });

		return response.ok ? ((await response.json()) as DevUserFile) : null;
	} catch {
		return null;
	}
};

export const signInAsDevUser = async (user: DevUser): Promise<void> => {
	const credential = GoogleAuthProvider.credential(
		JSON.stringify({
			sub: user.sub,
			email: user.email,
			email_verified: true,
			name: user.displayName,
			picture: user.photoURL ?? undefined,
		})
	);

	await signInWithCredential(getFirebaseAuth(), credential);
};
