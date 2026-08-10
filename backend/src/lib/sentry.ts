import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import * as Sentry from '@sentry/node';

/**
 * Read off `withMonitor` itself rather than imported. `@sentry/node` re-exports
 * the function but not this type, and reaching into `@sentry/core` for it would
 * mean depending on a package we don't declare.
 */
type MonitorConfig = NonNullable<Parameters<typeof Sentry.withMonitor>[2]>;

/**
 * Where function failures go, alongside the ones from the browser.
 *
 * Cloud Logging already collects everything these functions log, and GCP's
 * Error Reporting already groups the ones that crash an invocation. What it
 * cannot do is tell you: nothing about a red line in a log viewer arrives
 * anywhere, and half this backend runs unattended on a schedule, where a
 * failure looks exactly like a quiet week.
 *
 * So this is here for two things Cloud Logging doesn't give us — a single inbox
 * shared with the frontend, and something that pages — and for one class of
 * failure GCP genuinely cannot see: the errors this code deliberately swallows.
 * `sendReminders` catches per season so one bad document can't cost every other
 * season its reminders; that `catch` is correct, and it also means the failure
 * never surfaces anywhere. See `reportError`.
 *
 * Unconfigured it is inert, like the email transport beside it: a blank
 * `SENTRY_DSN` in `backend/.env` sends nothing and changes no behaviour.
 */

/**
 * A `defineString` rather than a secret, deliberately. A DSN authorizes writing
 * an event to one project and reads nothing back — it ships in the browser
 * bundle on the frontend, so it is public by construction. Making it a secret
 * would add a Secret Manager entry that every deploy fails without, for a value
 * that isn't one.
 */
const SENTRY_DSN = defineString('SENTRY_DSN', { default: '' });

/**
 * Anything pointed at an emulator reports nothing — a local `pnpm dev:seeded`
 * run, and the backend test suite.
 *
 * Wider than `email.ts`'s check on purpose. `FUNCTIONS_EMULATOR` is only set by
 * the functions emulator, and `pnpm test:backend` doesn't use it: it imports the
 * handlers straight into jest and points them at the Firestore emulator. So a
 * `SENTRY_DSN` exported in somebody's shell would have had the test suite
 * reporting its own deliberately-provoked failures to the live project.
 * `FIRESTORE_EMULATOR_HOST` covers both, and is never set in production.
 */
const isEmulated = (): boolean =>
	process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/**
 * How long to wait for queued events on the way out of an invocation.
 *
 * A Cloud Functions container is frozen the moment the handler resolves, so an
 * event still in the transport's queue is simply lost. Two seconds is long
 * enough for one HTTP round trip and short enough that a Sentry outage delays a
 * response rather than timing the function out.
 */
const FLUSH_MS = 2_000;

let initialised = false;

/**
 * Start the SDK once per container, and say whether it is worth talking to.
 *
 * Lazy because `defineString.value()` is only meaningful at runtime — read at
 * module load it would be the literal `{{params.SENTRY_DSN}}` during the
 * deploy-time analysis pass.
 */
const ensureInitialised = (): boolean => {
	if (isEmulated()) return false;

	const dsn = SENTRY_DSN.value();
	if (!dsn) return false;

	if (!initialised) {
		Sentry.init({
			dsn,
			// `K_SERVICE` is set by Cloud Run, which is what functions v2 are.
			environment: process.env.K_SERVICE ? 'production' : 'development',
			/**
			 * Errors only. The performance integrations are the half of the Node
			 * SDK that patches `http`, `pg` and friends on import, which is why
			 * the usual advice is to load Sentry before everything else — a rule
			 * that is awkward to hold in a file the Firebase CLI also analyses.
			 * Dropping them removes the requirement along with the overhead.
			 */
			integrations: Sentry.getDefaultIntegrationsWithoutPerformance(),
			tracesSampleRate: 0,
			// No request bodies, no headers, no IP addresses. What we send is a
			// stack trace and whatever ids the call site chose to attach.
			sendDefaultPii: false,
			// The functions are compiled to CommonJS; the ESM hooks are noise.
			registerEsmLoaderHooks: false,
		});

		initialised = true;
	}

	return true;
};

/**
 * Log a failure and report it.
 *
 * For the `catch` blocks that deliberately absorb an error to keep a sweep
 * going. Every one of those is correct — one malformed season must not cost
 * the other seasons their reminders — and every one of them is also a place a
 * failure can repeat weekly with nothing to show for it but a log line nobody
 * is reading. The `logger.error` call is kept as well as, not replaced by, the
 * report: Cloud Logging stays the complete record, Sentry is the thing that
 * shouts.
 */
export const reportError = (message: string, context: Record<string, unknown>, error: unknown): void => {
	logger.error(message, { ...context, error });

	if (!ensureInitialised()) return;

	Sentry.captureException(error, { tags: { handled: 'swallowed' }, extra: { message, ...context } });
};

/**
 * Both sweeps run hourly. Shared so the two monitors can't disagree about what
 * "hourly" means, and so changing it is one edit rather than two.
 */
export const HOURLY: MonitorConfig['schedule'] = { type: 'interval', value: 1, unit: 'hour' };

/**
 * Wrap a scheduled function so Sentry notices when it stops running.
 *
 * The failure this exists for is the one `instrument` cannot see. A sweep that
 * throws reports an error; a sweep that never runs at all — a scheduler job
 * deleted, a deploy that dropped the function, a schedule quietly not upserted
 * — produces nothing. There is no error, no log line, and no way to tell the
 * silence apart from a week where nothing needed doing. Nobody finds out until
 * somebody says they stopped getting reminders.
 *
 * A check-in inverts that: the run says "I started" and "I finished", and
 * Sentry raises an issue when the expected one doesn't arrive. Absence becomes
 * the signal rather than the blind spot.
 *
 * The monitor is upserted from here rather than configured in Sentry's UI, so
 * the expected schedule sits next to the `onSchedule` that implements it. A
 * schedule that lived only in a dashboard would drift the first time this one
 * changed, and drift by reporting everything as healthy.
 *
 * An **interval** rather than a crontab, deliberately: `every 60 minutes` is
 * relative to when the job was last deployed, not pinned to the top of the
 * hour, so a crontab of `0 * * * *` would report late every single run on a
 * deploy that happened at half past.
 */
export const instrumentSchedule = (name: string, monitor: MonitorConfig, handler: () => Promise<void>) =>
	instrument(name, async (): Promise<void> => {
		if (!ensureInitialised()) return handler();

		await Sentry.withMonitor(name, handler, monitor);
	});

/**
 * Wrap a function handler so anything it throws is reported before it leaves.
 *
 * Applied at each definition site rather than to the exported `CloudFunction`,
 * which is not a plain function — it carries the `__endpoint` metadata the
 * Firebase CLI reads to work out what to deploy, and wrapping it loses that.
 *
 * The error is rethrown, always. Background triggers rely on a throw to get
 * retried and callables rely on it to answer the client; swallowing one here to
 * report it would change what the function does, which telemetry may not.
 */
export const instrument =
	<Args extends unknown[], Result>(name: string, handler: (...args: Args) => Promise<Result>) =>
	async (...args: Args): Promise<Result> => {
		try {
			return await handler(...args);
		} catch (error) {
			/**
			 * An `HttpsError` is a decision this code made — not signed in, not
			 * an admin, a game that doesn't exist. Reporting those would fill the
			 * inbox with the authorization layer working correctly, and an inbox
			 * full of non-events is one nobody opens. Anything else is a surprise
			 * and belongs in Sentry.
			 */
			if (!(error instanceof HttpsError) && ensureInitialised()) {
				Sentry.captureException(error, { tags: { function: name } });
			}

			throw error;
		} finally {
			// In the `finally` so it also covers a `reportError` raised deeper in
			// a handler that then returned perfectly normally — which is the most
			// common case, since those are the ones nothing else surfaces.
			if (ensureInitialised()) await Sentry.flush(FLUSH_MS);
		}
	};
