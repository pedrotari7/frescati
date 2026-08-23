import { HttpsError } from 'firebase-functions/v2/https';
import { instrument } from '../src/lib/sentry';

/**
 * `instrument` wraps every exported function in this backend, so what it must
 * not do matters more than what it does: telemetry may not change behaviour.
 *
 * Sentry itself is inert here. `isEmulated()` sees `FIRESTORE_EMULATOR_HOST`
 * and never initialises, which is the point. These assert the contract that
 * holds whether or not a DSN is configured, and the pass-through path is
 * already exercised by all sixteen other suites, since every function they call
 * now goes through this.
 */
describe('instrument', () => {
	it('returns whatever the handler returned', async () => {
		const handler = instrument('example', async (a: number, b: number) => a + b);

		await expect(handler(2, 3)).resolves.toBe(5);
	});

	it('rethrows, so a background trigger still gets its retry', async () => {
		const boom = new Error('boom');
		const handler = instrument('example', async () => {
			throw boom;
		});

		// Reported *and* rethrown. Swallowing here to report would quietly turn
		// every failed trigger into a successful one.
		await expect(handler()).rejects.toBe(boom);
	});

	it('rethrows an HttpsError unchanged, so a callable still answers its client', async () => {
		const denied = new HttpsError('permission-denied', 'Only a season admin can confirm results.');
		const handler = instrument('example', async () => {
			throw denied;
		});

		await expect(handler()).rejects.toBe(denied);
		await expect(handler()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('passes the handler its arguments untouched', async () => {
		const seen: unknown[] = [];
		const handler = instrument('example', async (event: { id: string }) => {
			seen.push(event);
			return event.id;
		});

		await expect(handler({ id: 'game-1' })).resolves.toBe('game-1');
		expect(seen).toEqual([{ id: 'game-1' }]);
	});
});
