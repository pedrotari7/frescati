/**
 * Nothing in this app runs on the edge today — there is no middleware. Here so
 * that the first thing that does is covered from the start rather than from
 * whenever somebody remembers.
 */

import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

Sentry.init(sentryOptions);
