/**
 * Server-side Sentry init, for the sliver of this app that runs on a server.
 *
 * Nearly every screen is a client component talking to Firestore directly, so
 * what's left here is the root layout's render and the CSP report handler. Thin,
 * but a failure in either is a blank page for everybody at once, which is the
 * one failure mode worth hearing about immediately.
 */

import * as Sentry from '@sentry/nextjs';

export const register = async () => {
	if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
	if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
};

/** Next hands request errors here; Sentry adds the route and request context. */
export const onRequestError = Sentry.captureRequestError;
