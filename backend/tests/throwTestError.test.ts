import { throwTestError } from '../src/throwTestError';
import { callRequest } from './helpers';

const ADMIN = 'app-admin-1';
const PLAYER = 'anna';

/**
 * The debug button that fails on purpose. Worth testing precisely because it is
 * the thing everything else about error reporting gets checked with. A broken
 * one would be diagnosed as broken *reporting*, which is a long way to go for
 * the wrong answer.
 *
 * Sentry itself is inert here (`FIRESTORE_EMULATOR_HOST` is set), so what these
 * assert is the contract the screen relies on: which kinds reject, which
 * resolve, and that it stays shut to everybody but an app admin.
 */
describe('throwTestError', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(throwTestError.run(callRequest({ kind: 'throw' }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a caller who is not an app admin', async () => {
		// It reads and writes nothing, but a stranger being able to fill somebody
		// else's error budget is reason enough to keep it behind the badge.
		await expect(
			throwTestError.run(callRequest({ kind: 'throw' }, { uid: PLAYER, admin: false }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects an unknown kind', async () => {
		await expect(
			throwTestError.run(callRequest({ kind: 'nonsense' }, { uid: ADMIN, admin: true }))
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('throws a plain error, which is what `instrument` reports and rethrows', async () => {
		// Not an HttpsError: that distinction is the entire point of this kind,
		// and it is what the client sees as `internal`.
		await expect(throwTestError.run(callRequest({ kind: 'throw' }, { uid: ADMIN, admin: true }))).rejects.toThrow(
			'Debug: deliberate unhandled backend failure'
		);
	});

	it('throws an HttpsError, which is the kind that must NOT be reported', async () => {
		await expect(
			throwTestError.run(callRequest({ kind: 'httpsError' }, { uid: ADMIN, admin: true }))
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('succeeds for a swallowed failure, exactly as a sweep does', async () => {
		// The call looking completely healthy is the behaviour being checked.
		// That is what makes this class of failure invisible without reporting.
		await expect(
			throwTestError.run(callRequest({ kind: 'swallowed' }, { uid: ADMIN, admin: true }))
		).resolves.toEqual({ reported: true });
	});
});
