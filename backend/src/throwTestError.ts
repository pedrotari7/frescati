import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { BackendErrorKind } from '../../shared/debug';
import { BACKEND_ERROR_KINDS } from '../../shared/debug';
import { REGION } from './lib/firebase';
import { requireAppAdmin } from './lib/auth';
import { instrument, reportError } from './lib/sentry';

/**
 * Fails on purpose, so error reporting can be proved rather than assumed.
 *
 * Everything about a reporting pipeline is invisible when it works and equally
 * invisible when it doesn't. A DSN with a typo, a function whose deploy dropped
 * the `SENTRY_DSN` param, a flush that gets frozen before it lands, each of
 * those looks exactly like a healthy week. The only honest test is to break
 * something deliberately and go and look.
 *
 * Same shape as `sendTestPush`: app admins only, and it goes down the real path
 * rather than calling `Sentry.captureException` directly. A debug button that
 * reported through its own private route would test that route and nothing
 * else. It would still pass with `instrument` removed from every function in
 * the backend.
 *
 * Safe to fire in production, which is where it is worth firing: it reads
 * nothing, writes nothing, and touches no game. All it costs is an entry in
 * Sentry that says `debug` on it.
 */
export const throwTestError = onCall<{ kind: BackendErrorKind }>(
	{ region: REGION },
	instrument('throwTestError', async request => {
		const callerUid = requireAppAdmin(request);

		const { kind } = request.data ?? {};

		if (!BACKEND_ERROR_KINDS.includes(kind)) {
			throw new HttpsError('invalid-argument', `Unknown error kind: ${kind}`);
		}

		// Tagged in the message rather than only in Sentry's metadata, so one of
		// these turning up in a week's triage is recognisable as deliberate from
		// the issue title alone.
		if (kind === 'throw') throw new Error('Debug: deliberate unhandled backend failure');

		if (kind === 'httpsError') {
			throw new HttpsError('failed-precondition', 'Debug: deliberate HttpsError, which should NOT reach Sentry.');
		}

		reportError(
			'Debug: deliberate swallowed backend failure',
			{ firedBy: callerUid },
			new Error('Debug: deliberate swallowed backend failure')
		);

		// Deliberately a success. This is what a sweep looks like from outside
		// when it caught something and carried on.
		return { reported: true };
	})
);
