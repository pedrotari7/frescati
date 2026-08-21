'use client';

import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { useLastSeen } from '../../hooks/useLastSeen';
import Login from '../../components/Login';
import Spinner from '../../components/Spinner';
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
	if (user === null) {
		return (
			<div className='flex min-h-dvh items-center justify-center'>
				<Spinner className='text-brand size-8' />
			</div>
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
