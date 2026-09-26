/**
 * Browser-side Sentry init, which Next loads before any of the app runs.
 *
 * A wiring file and nothing else. The SDK is no longer imported here, because
 * everything Next puts in this file lands in the initial JS of every route.
 * `lib/sentryClient.ts` holds what replaced it and says why, and the options
 * live in `lib/sentry.ts`, shared with the two server runtimes.
 */

import { captureRouterTransitionStart, deferSentry } from './lib/sentryClient';

deferSentry();

/** The name Next looks for. See `captureRouterTransitionStart`. */
export const onRouterTransitionStart = captureRouterTransitionStart;
