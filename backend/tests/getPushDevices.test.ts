import { getPushDevices } from '../src/getPushDevices';
import { callRequest, clearFirestore, getDb } from './helpers';

const ADMIN = 'app-admin-1';
const ANNA = 'anna';
const JOHAN = 'johan';

const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_CHROME =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const writeToken = (uid: string, token: string, createdAt: string, userAgent: string) =>
	getDb().doc(`users/${uid}/pushTokens/${token}`).set({ token, createdAt, userAgent });

beforeEach(clearFirestore);

describe('getPushDevices', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(getPushDevices.run(callRequest({}))).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	// A registration token is a capability to push to somebody's phone. Nothing
	// short of the global role gets to see the collection at all.
	it('rejects a caller who is not an app admin', async () => {
		await expect(getPushDevices.run(callRequest({}, { uid: ADMIN, admin: false }))).rejects.toMatchObject({
			code: 'permission-denied',
		});
	});

	it('returns nothing when no device is registered anywhere', async () => {
		const { devices } = await getPushDevices.run(callRequest({}, { uid: ADMIN, admin: true }));

		expect(devices).toEqual({});
	});

	it('groups every registered device under the account that owns it', async () => {
		await writeToken(ANNA, 'token-a', '2026-08-01T10:00:00.000Z', IPHONE_SAFARI);
		await writeToken(ANNA, 'token-b', '2026-08-03T10:00:00.000Z', MAC_CHROME);
		await writeToken(JOHAN, 'token-c', '2026-08-02T10:00:00.000Z', IPHONE_SAFARI);

		const { devices } = await getPushDevices.run(callRequest({}, { uid: ADMIN, admin: true }));

		expect(Object.keys(devices).sort()).toEqual([ANNA, JOHAN]);
		expect(devices[ANNA]).toHaveLength(2);
		expect(devices[JOHAN]).toEqual([
			{ platform: 'ios', browser: 'Safari', registeredAt: '2026-08-02T10:00:00.000Z' },
		]);
	});

	// The whole reason this is a callable and not a rules change. A token that
	// reached the browser would be a working send-anything credential for
	// somebody else's phone.
	it('never returns the token itself', async () => {
		await writeToken(ANNA, 'a-real-looking-token', '2026-08-01T10:00:00.000Z', IPHONE_SAFARI);

		const { devices } = await getPushDevices.run(callRequest({}, { uid: ADMIN, admin: true }));

		expect(JSON.stringify(devices)).not.toContain('a-real-looking-token');
		expect(Object.keys(devices[ANNA][0]).sort()).toEqual(['browser', 'platform', 'registeredAt']);
	});

	it('puts the most recently registered device first', async () => {
		await writeToken(ANNA, 'old', '2026-08-01T10:00:00.000Z', MAC_CHROME);
		await writeToken(ANNA, 'new', '2026-08-09T10:00:00.000Z', IPHONE_SAFARI);

		const { devices } = await getPushDevices.run(callRequest({}, { uid: ADMIN, admin: true }));

		expect(devices[ANNA].map(device => device.platform)).toEqual(['ios', 'desktop']);
	});

	// Tokens written before the app stored a user agent. They still count as a
	// registered device, which is the question the screen is asking.
	it('still reports a device whose token carries no user agent', async () => {
		await getDb().doc(`users/${ANNA}/pushTokens/bare`).set({ token: 'bare' });

		const { devices } = await getPushDevices.run(callRequest({}, { uid: ADMIN, admin: true }));

		expect(devices[ANNA]).toEqual([{ platform: 'unknown', browser: '', registeredAt: '' }]);
	});
});
