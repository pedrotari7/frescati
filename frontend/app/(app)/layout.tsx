'use client';

import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { useLastSeen } from '../../hooks/useLastSeen';
import Login from '../../components/Login';
import PageShell from '../../components/PageShell';
import Skeleton from '../../components/Skeleton';
import { SeasonScopeProvider } from '../../components/SeasonScope';
import { AppHistoryProvider } from '../../components/AppHistory';

/**
 * Auth gate for every signed-in screen.
 *
 * There is no server-side guard, and there doesn't need to be: Firestore
 * security rules reject unauthenticated reads, so an unauthorised client sees
 * nothing even if it renders the markup.
 */
const AppLayout = ({ children }: { children: ReactNode }) => {
	const { user } = useAuth();

	// Here rather than in `AuthProvider`, which also wraps the login screen:
	// this layout is the boundary somebody is either inside the app or not, and
	// it survives every navigation within it, so returning to the foreground is
	// noticed from whichever screen they left open.
	useLastSeen(user?.uid);

	// `null` = Firebase is still restoring the session. Showing the login screen
	// here would flash it on every refresh.
	//
	// The chrome and a skeleton rather than a lone spinner, because this is the
	// only screen in the app the *document* can draw. Everything below this
	// line waits on a signed-in user, so the prerendered HTML of every screen
	// was a 32px spinner on an otherwise empty page. Nothing in it was big
	// enough to be a largest contentful paint, so LCP could not happen until
	// the bundle had parsed, Firebase had restored the session off IndexedDB,
	// App Check had been to `www.google.com` for a token and the first snapshot
	// had landed. A 208px hero block ships in the first byte instead, and LCP
	// lands with the first paint.
	//
	// `PageShell` and `Skeleton` rather than something written for here. They
	// are the pair the season and seasons screens draw one step later, and
	// `Skeleton` is already sized to mirror the season home layout, so the
	// handover costs no layout shift. The tabs are the one thing missing. They
	// need a season id nobody has yet, and above `lg` their arrival moves the
	// title right by the width of the chevron slot.
	if (user === null) {
		return (
			<PageShell title='Frescati'>
				<Skeleton />
			</PageShell>
		);
	}

	if (user === undefined) return <Login />;

	// Both above the season route: the tabs survive a trip to /me and back, and
	// so does the record of how somebody got there. Every screen with a back
	// chevron is below this, and the login screen has none.
	return (
		<AppHistoryProvider>
			<SeasonScopeProvider>{children}</SeasonScopeProvider>
		</AppHistoryProvider>
	);
};

export default AppLayout;
