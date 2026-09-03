import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router';
import * as stylex from '@stylexjs/stylex';
import AppLayout from '../app/(app)/layout';
import { SeasonProvider } from '../components/SeasonProvider';
import Spinner from '../components/Spinner';
import { colors } from '../app/tokens.stylex';
import { routeParams } from './adapters/params';
import Root from './Root';

/**
 * The route table, which the file tree under `app/` used to be.
 *
 * Every path here is a directory Next read a meaning out of: `(app)` was a
 * layout that owns no segment, `[seasonId]` a parameter, `page.tsx` the leaf
 * and `layout.tsx` the thing wrapped around it. None of that is inferred any
 * more, so it is written down, and the cost is that adding a screen is now two
 * edits rather than one, with nothing to catch the second being forgotten
 * beyond a 404 in `e2e/nav.spec.ts`.
 *
 * The pages are lazy so that the build splits per route the way Next's did.
 * What is not reproduced is the prefetch: Next fetched a route's chunk when a
 * link to it came into view, and this fetches on the tap. See
 * `vite/adapters/link.tsx`.
 */

const styles = stylex.create({
	pending: { display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' },
	spinner: { color: colors.brand, width: 32, height: 32 },
	missing: { padding: 32, textAlign: 'center', color: colors.muted },
});

/*
 * One per `page.tsx`. The parenthesised directory is a real directory rather
 * than a convention now, which is why these paths look the way they do.
 */
const SeasonsPage = lazy(() => import('../app/(app)/seasons/page'));
const NewSeasonPage = lazy(() => import('../app/(app)/seasons/new/page'));
const MePage = lazy(() => import('../app/(app)/me/page'));
const DebugPage = lazy(() => import('../app/(app)/debug/page'));
const AdminPage = lazy(() => import('../app/(app)/admin/page'));
const AdminActivityPage = lazy(() => import('../app/(app)/admin/activity/page'));
const AdminNotificationsPage = lazy(() => import('../app/(app)/admin/notifications/page'));
const AdminRatingsPage = lazy(() => import('../app/(app)/admin/ratings/page'));
const PlayerPage = lazy(() => import('../app/(app)/u/[uid]/page'));
const SeasonPage = lazy(() => import('../app/(app)/s/[seasonId]/page'));
const TablePage = lazy(() => import('../app/(app)/s/[seasonId]/table/page'));
const KitPage = lazy(() => import('../app/(app)/s/[seasonId]/kit/page'));
const MembersPage = lazy(() => import('../app/(app)/s/[seasonId]/members/page'));
const FinancesPage = lazy(() => import('../app/(app)/s/[seasonId]/finances/page'));
const ReceiptPage = lazy(() => import('../app/(app)/s/[seasonId]/finances/r/[receiptId]/page'));
const GamePage = lazy(() => import('../app/(app)/s/[seasonId]/g/[gameId]/page'));
const TournamentPage = lazy(() => import('../app/(app)/s/[seasonId]/g/[gameId]/tournament/page'));
const SeasonAdminPage = lazy(() => import('../app/(app)/s/[seasonId]/admin/page'));
const SeasonAdminGamesPage = lazy(() => import('../app/(app)/s/[seasonId]/admin/games/page'));
const SeasonAdminMembersPage = lazy(() => import('../app/(app)/s/[seasonId]/admin/members/page'));

/** What a route being fetched looks like. The same spinner the auth gate shows. */
const Pending = () => (
	<div {...stylex.props(styles.pending)}>
		<Spinner sx={styles.spinner} />
	</div>
);

/**
 * `app/(app)/layout.tsx`, reused as it is: it is a client component that takes
 * children, which is what a layout route needs to be.
 *
 * The `Suspense` sits inside it rather than around it on purpose. Above, every
 * route change would unmount the auth gate and flash the whole app; here only
 * the screen below waits.
 */
const AppGate = () => (
	<AppLayout>
		<Suspense fallback={<Pending />}>
			<Outlet />
		</Suspense>
	</AppLayout>
);

/**
 * The one layout that could not be reused.
 *
 * `app/(app)/s/[seasonId]/layout.tsx` is an `async` function component, which
 * is a server component and a thing React will not render on a client. All it
 * awaited was `params`, which is a hook here, so what it did survives as four
 * lines. It is the only file in `app/` the port could not take as it stood.
 */
const SeasonGate = () => {
	const { seasonId = '' } = useParams();

	return (
		<SeasonProvider seasonId={seasonId}>
			<Suspense fallback={<Pending />}>
				<Outlet />
			</Suspense>
		</SeasonProvider>
	);
};

/*
 * The four screens that read a route parameter.
 *
 * Next handed a page `params` as a promise and the pages `use()` it, so what
 * these wrappers owe them is a promise with a stable identity.
 * `vite/adapters/params.ts` is where that lives and why it cannot be a hook.
 */
const PlayerRoute = () => {
	const { uid = '' } = useParams();

	return <PlayerPage params={routeParams({ uid })} />;
};

const ReceiptRoute = () => {
	const { seasonId = '', receiptId = '' } = useParams();

	return <ReceiptPage params={routeParams({ seasonId, receiptId })} />;
};

const GameRoute = () => {
	const { seasonId = '', gameId = '' } = useParams();

	return <GamePage params={routeParams({ seasonId, gameId })} />;
};

const TournamentRoute = () => {
	const { seasonId = '', gameId = '' } = useParams();

	return <TournamentPage params={routeParams({ seasonId, gameId })} />;
};

/** Next shipped one of these for free. */
const NotFound = () => <p {...stylex.props(styles.missing)}>There is nothing at this address.</p>;

const AppRoutes = () => (
	<Routes>
		<Route element={<Root />}>
			{/* `app/page.tsx` is a `redirect` in a server component. Same job, one layer down. */}
			<Route path='/' element={<Navigate to='/seasons' replace />} />

			<Route element={<AppGate />}>
				<Route path='seasons' element={<SeasonsPage />} />
				<Route path='seasons/new' element={<NewSeasonPage />} />
				<Route path='me' element={<MePage />} />
				<Route path='debug' element={<DebugPage />} />
				<Route path='admin' element={<AdminPage />} />
				<Route path='admin/activity' element={<AdminActivityPage />} />
				<Route path='admin/notifications' element={<AdminNotificationsPage />} />
				<Route path='admin/ratings' element={<AdminRatingsPage />} />
				<Route path='u/:uid' element={<PlayerRoute />} />

				<Route path='s/:seasonId' element={<SeasonGate />}>
					<Route index element={<SeasonPage />} />
					<Route path='table' element={<TablePage />} />
					<Route path='kit' element={<KitPage />} />
					<Route path='members' element={<MembersPage />} />
					<Route path='finances' element={<FinancesPage />} />
					<Route path='finances/r/:receiptId' element={<ReceiptRoute />} />
					<Route path='g/:gameId' element={<GameRoute />} />
					<Route path='g/:gameId/tournament' element={<TournamentRoute />} />
					<Route path='admin' element={<SeasonAdminPage />} />
					<Route path='admin/games' element={<SeasonAdminGamesPage />} />
					<Route path='admin/members' element={<SeasonAdminMembersPage />} />
				</Route>

				<Route path='*' element={<NotFound />} />
			</Route>
		</Route>
	</Routes>
);

export default AppRoutes;
