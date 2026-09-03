import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router';

/**
 * What `next/navigation` is under the Vite build.
 *
 * Four names, which is all this app ever imported from it: `useRouter`,
 * `usePathname`, `useSearchParams` and `redirect`.
 *
 * The part that had to be got exactly right is not the API, it is what each
 * call does to `window.history`. `components/AppHistory.tsx` decides whether
 * the back chevron goes back or falls back to a screen's declared parent by
 * watching whether `history.length` grew, so a push has to push and a replace
 * has to replace. React Router calls `pushState` and `replaceState` for those
 * two, which is the same thing Next's router does, so the trail counts the same
 * moves and the live-game redirect still costs no step. `e2e/nav.spec.ts` is
 * what proves that rather than this comment.
 */

/**
 * Stable across renders, because it is read in a dependency array:
 * `app/(app)/seasons/page.tsx` has an effect that redirects to a sole active
 * season, and a router rebuilt every render would re-run it in a loop. Next's
 * `useRouter` is stable for the same reason, and `useNavigate` is stable, so
 * memoising on it is enough.
 */
export const useRouter = () => {
	const navigate = useNavigate();

	return useMemo(
		() => ({
			push: (href: string) => void navigate(href),
			replace: (href: string) => void navigate(href, { replace: true }),
			back: () => void navigate(-1),
			forward: () => void navigate(1),
			/*
			 * Next re-fetches the server components for the current route. There
			 * are none: every screen here subscribes to Firestore with
			 * `onSnapshot` and is already live. Nothing in the app calls it, and
			 * it is here so that a call added later fails loudly in review rather
			 * than quietly at runtime.
			 */
			refresh: () => {},
			prefetch: () => {},
		}),
		[navigate]
	);
};

/** The path, without the query. Matches what Next returns. */
export const usePathname = () => useLocation().pathname;

/** Next hands back a read-only `URLSearchParams`; React Router hands back a pair. */
export const useSearchParams = () => useRouterSearchParams()[0];

/**
 * Next's `redirect` throws a signal its server catches. Nothing here catches
 * anything, so this is a location assignment, which is the honest client-side
 * equivalent and is only reached from `app/page.tsx`. `routes.tsx` routes `/`
 * with the router instead, so in practice this is unused and exists to keep the
 * module's surface the same as the one it stands in for.
 */
export const redirect = (href: string): never => {
	window.location.replace(href);
	throw new Error(`Redirecting to ${href}`);
};
