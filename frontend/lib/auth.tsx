'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb, getFirebaseAuth } from './firebaseClient';
import { isStandalone, isVisible, thisDevice } from './device';
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
			// Loading the app is a visit — but only if it loaded where somebody
			// could see it. A link cmd-clicked into a background tab, or an
			// installed app woken behind the lock screen, is not somebody
			// coming by, and stamping it here would be the loudest of the false
			// positives `shared/visit.ts` exists to keep out. Left alone, the
			// stamp stays where it was until `useLastSeen` sees the app reach
			// the foreground for real.
			//
			// The `?? now` is only ever reached on a profile being created, and
			// a first sign-in goes through a Google popup, which cannot happen
			// on a page nobody is looking at.
			lastSeenAt: isVisible() ? now : (existing?.lastSeenAt ?? now),
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

	/**
	 * Who the profile document has already been synced for on this page.
	 *
	 * `onIdTokenChanged` fires on every token refresh as well as on sign-in,
	 * and the refresh below forces one every ten minutes — so without this, a
	 * tab left open all week re-read and rewrote the same document a thousand
	 * times to change nothing. Nothing in the profile can move mid-session
	 * except `lastSeenAt`, which `useLastSeen` now owns and stamps only on a
	 * real return to the foreground.
	 */
	const syncedUid = useRef<string | null>(null);

	useEffect(() => {
		const auth = getFirebaseAuth();

		return onIdTokenChanged(auth, async firebaseUser => {
			if (!firebaseUser) {
				// Signing back in — as the same person or another — has to sync
				// again; this is a page that has stopped knowing anybody.
				syncedUid.current = null;
				setUser(undefined);
				void setSentryUser(null);
				return;
			}

			const result = await firebaseUser.getIdTokenResult().catch(error => {
				// Transient — a token refresh failing mid-flight on a bad connection.
				// Firebase's own background refresh retries on its own and fires this
				// observer again once it succeeds, so there's nothing to do but leave
				// `user` as it is and report it. Left uncaught, this was an unhandled
				// rejection that also skipped `setUser` below, stranding whoever it hit
				// on the "still resolving" screen instead of restoring their session.
				console.error('Failed to refresh ID token', error);
				void captureError(error, { stage: 'idTokenObserver' });
				return null;
			});
			if (!result) return;

			const authUser = toAuthUser(firebaseUser, result.claims.admin === true);

			setUser(authUser);
			// The uid alone, so a crash report can say whether this is one
			// person's phone or everybody's. See `setSentryUser`.
			void setSentryUser(authUser.uid);

			if (syncedUid.current === authUser.uid) return;
			syncedUid.current = authUser.uid;

			// Best-effort: a failure here shouldn't block sign-in. Quiet on
			// screen, but not quiet to us — a profile that never syncs is how
			// somebody ends up nameless in every roster in the app.
			upsertUserDoc(authUser).catch(error => {
				// Let the next token refresh have another go, ten minutes from
				// now. Marked before the write rather than after so two
				// refreshes landing together can't both run it, which means
				// undoing the mark here is what keeps a blip from being
				// permanent for the life of the page.
				syncedUid.current = null;

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
			const result = await current.getIdTokenResult(true).catch(error => {
				// Same story as the observer above: a blip on this tick, not a
				// defect — the next tick retries in TOKEN_REFRESH_MS.
				console.error('Failed to refresh ID token', error);
				void captureError(error, { stage: 'tokenRefreshInterval' });
				return null;
			});
			if (!result) return;

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
