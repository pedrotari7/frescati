/**
 * Browser-side Sentry init. Next loads this before any of the app runs, which
 * is what lets it catch a crash during hydration, the one place an error
 * boundary can't help, because there is no mounted tree to fall back to.
 *
 * Options live in `lib/sentry.ts`, shared with the two server runtimes.
 */

import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

Sentry.init(sentryOptions);

/**
 * Next hands router navigations here. With tracing off this records nothing,
 * it is exported because the SDK prints an ACTION REQUIRED notice on every
 * build without it, and a standing warning nobody intends to act on is how real
 * ones start getting scrolled past.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
