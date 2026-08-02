'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, getFirebaseAuth } from './firebaseClient';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';

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
 * Make sure a `users/{uid}` document exists so the person shows up in the admin
 * member picker. Firebase Auth is the identity source of truth; this doc only
 * carries the profile fields other screens need to render.
 */
const upsertUserDoc = async (user: AuthUser) => {
	const ref = doc(getDb(), 'users', user.uid);
	const existing = await getDoc(ref);

	if (!existing.exists()) {
		await setDoc(ref, {
			uid: user.uid,
			displayName: user.displayName,
			email: user.email,
			photoURL: user.photoURL,
			createdAt: new Date().toISOString(),
			lastSeenAt: new Date().toISOString(),
			// Never written from the client as `true` — rules reject that.
			isAppAdmin: false,
			notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
		});
		return;
	}

	// Keep the profile fresh (people change their Google avatar) and record the
	// visit, but leave anything the user has since edited alone.
	await setDoc(
		ref,
		{
			displayName: user.displayName,
			email: user.email,
			photoURL: user.photoURL,
			lastSeenAt: new Date().toISOString(),
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
				return;
			}

			const result = await firebaseUser.getIdTokenResult();
			const authUser = toAuthUser(firebaseUser, result.claims.admin === true);

			setUser(authUser);

			// Best-effort: a failure here shouldn't block sign-in.
			upsertUserDoc(authUser).catch(error => console.error('Failed to sync user profile', error));
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
