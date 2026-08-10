'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, getFirebaseAuth } from './firebaseClient';
import { isStandalone, thisDevice } from './device';
import { captureError, setSentryUser } from './sentry';
import type { AppUser, ClientInfo } from '@shared/types';
import { normaliseNotificationPrefs } from '@shared/notifications';

export interface AuthUser {
	uid: string;
	displayName: string;
	email: string;
	photoURL: string | null;
	/** The global `admin` custom claim — creates seasons, promotes other admins. */
	isAppAdmin: boolean;
}

/**
 * `null` means "still resolving", `undefined` means "definitively signed out".
 * The distinction is load-bearing: without it the app flashes the login screen
 * on every refresh before Firebase has restored the session.
 */
export type AuthState = AuthUser | null | undefined;

const AuthContext = createContext<{ user: AuthState }>({ user: null });

/** Firebase mints ID tokens with a one-hour life; refresh well inside that. */
const TOKEN_REFRESH_MS = 10 * 60 * 1000;

const toAuthUser = (firebaseUser: FirebaseUser, isAppAdmin: boolean): AuthUser => ({
	uid: firebaseUser.uid,
	displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Player',
	email: firebaseUser.email ?? '',
	photoURL: firebaseUser.photoURL,
	isAppAdmin,
});

/**
 * How this person is opening the app, so an admin can tell an iPhone that never
 * left Safari from one that simply has notifications switched off.
 *
 * `lastStandaloneAt` only ever moves forward: somebody who normally uses the
 * home screen app but opened a shared link in a browser tab is still installed,
 * and overwriting it here would say otherwise every time they follow a link.
 */
const describeClient = (existing: ClientInfo | undefined, now: string): ClientInfo => {
	const lastStandaloneAt = isStandalone() ? now : existing?.lastStandaloneAt;

	return {
		platform: thisDevice().platform,
		...(lastStandaloneAt ? { lastStandaloneAt } : {}),
	};
};

/**
 * Make sure a `users/{uid}` document exists and holds a current profile, so the
 * person shows up in rosters and the admin member picker. Firebase Auth is the
 * identity source of truth; this doc only carries the fields other screens need
 * to render.
 *
 * One merge covers both create and refresh, and every identity field is written
 * every time — including `uid`, which never changes. That matters because the
 * document can already exist in a partial state: `set-admin` promotes someone by
 * uid and will happily leave behind a doc holding nothing but `isAppAdmin`. The
 * update rule rejects any result without a `uid`, so a merge that assumed the
 * field was already there would fail on every single sign-in, silently, leaving
 * the person nameless forever.
 */
const upsertUserDoc = async (user: AuthUser) => {
	const ref = doc(getDb(), 'users', user.uid);
	const existing = (await getDoc(ref)).data() as Partial<AppUser> | undefined;
	const now = new Date().toISOString();

	await setDoc(
		ref,
		{
			uid: user.uid,
			displayName: user.displayName,
			// Profiles are readable by every signed-in user, so no contact details
			// live here. Firebase Auth holds the address; this clears it off any
			// document written back when it did, so returning users heal
			// themselves and `strip-user-emails` only has to catch the stragglers.
			email: deleteField(),
			photoURL: user.photoURL,
			createdAt: existing?.createdAt ?? now,
			lastSeenAt: now,
			// Only ever echoed back, never raised: rules reject a client writing
			// itself the badge. The admin SDK owns this field.
			isAppAdmin: existing?.isAppAdmin ?? false,
			// Seeded once, then left to whatever the user has since chosen —
			// but rewritten through the normaliser rather than passed straight
			// back, so a stored map that has picked up anything the rules no
			// longer accept heals on the next sign-in instead of failing every
			// write to this document from then on.
			notificationPrefs: normaliseNotificationPrefs(existing?.notificationPrefs),
			client: describeClient(existing?.client, now),
		},
		{ merge: true }
	);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<AuthState>(null);

	useEffect(() => {
		const auth = getFirebaseAuth();

		return onIdTokenChanged(auth, async firebaseUser => {
			if (!firebaseUser) {
				setUser(undefined);
				void setSentryUser(null);
				return;
			}

			const result = await firebaseUser.getIdTokenResult();
			const authUser = toAuthUser(firebaseUser, result.claims.admin === true);

			setUser(authUser);
			// The uid alone, so a crash report can say whether this is one
			// person's phone or everybody's. See `setSentryUser`.
			void setSentryUser(authUser.uid);

			// Best-effort: a failure here shouldn't block sign-in. Quiet on
			// screen, but not quiet to us — a profile that never syncs is how
			// somebody ends up nameless in every roster in the app.
			upsertUserDoc(authUser).catch(error => {
				console.error('Failed to sync user profile', error);
				void captureError(error, { stage: 'upsertUserDoc' });
			});
		});
	}, []);

	useEffect(() => {
		const handle = setInterval(async () => {
			const current = getFirebaseAuth().currentUser;
			if (!current) return;

			// Force refresh so an admin claim granted mid-session takes effect
			// without the user having to sign out and back in.
			const result = await current.getIdTokenResult(true);
			setUser(toAuthUser(current, result.claims.admin === true));
		}, TOKEN_REFRESH_MS);

		return () => clearInterval(handle);
	}, []);

	return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

export const signInWithGoogle = () => {
	const provider = new GoogleAuthProvider();
	provider.setCustomParameters({ prompt: 'select_account' });

	return signInWithPopup(getFirebaseAuth(), provider);
};

export const signOutOfApp = () => signOut(getFirebaseAuth());
