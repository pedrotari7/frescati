import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { buildGamePush } from '../../shared/notifications';
import { sendEmail } from '../src/lib/email';
import { clearAuth, clearFirestore, createAuthUser, getDb, writeUser } from './helpers';

/**
 * The email fallback's transport, against the Auth emulator and a stubbed
 * Resend.
 *
 * `fetch` is the only thing mocked. Everything the fallback decides — whose
 * preference is on, who has a usable address, how the addresses are grouped
 * into requests — runs for real, because those are the parts that would quietly
 * mail the wrong person.
 *
 * The parameters are set through `process.env` because that is where
 * `defineString`/`defineSecret` read from at runtime; unset, as in every other
 * suite here, the fallback is inert and sends nothing.
 */

const ANNA = 'anna';
const JOHAN = 'johan';

const PAYLOAD = buildGamePush('cancelled', {
	when: 'Tue 1 Sep · 19:00',
	url: '/s/spring/g/game-1',
	gameId: 'game-1',
});

const configure = () => {
	process.env.EMAIL_FROM = 'Frescati <notifications@frescati.example>';
	process.env.APP_URL = 'https://frescati.example';
	process.env.RESEND_API_KEY = 'test-key';
};

/** The batch bodies Resend was asked to send, one array per request. */
const sentBatches = (): { to: string[]; subject: string; html: string; text: string }[][] =>
	(fetch as jest.Mock).mock.calls.map(([, init]) => JSON.parse(init.body));

/**
 * Spied rather than assigned, so `restoreAllMocks` puts the real one back. The
 * helpers that wipe the emulators go through `fetch` too — left stubbed, they
 * quietly succeed at clearing nothing and every test after the first inherits
 * the last one's accounts.
 */
const resendReturns = (response: { ok: boolean; status: number; text: string }) =>
	jest.spyOn(global, 'fetch').mockResolvedValue({ ...response, text: async () => response.text } as never);

beforeEach(async () => {
	// Before the spy goes on — these are real requests to the emulators.
	await clearFirestore();
	await clearAuth();

	delete process.env.EMAIL_FROM;
	delete process.env.APP_URL;
	delete process.env.RESEND_API_KEY;
	// The emulator flag is what makes the real triggers log instead of send.
	// These tests are about what would go out, so they run as production would.
	delete process.env.FUNCTIONS_EMULATOR;

	resendReturns({ ok: true, status: 200, text: '' });
});

afterEach(() => jest.restoreAllMocks());

describe('sendEmail', () => {
	it('sends nothing when no sender is configured', async () => {
		await writeUser(ANNA);
		await createAuthUser(ANNA);

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(0);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('mails somebody with an address and the fallback left on', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(1);

		const [batch] = sentBatches();
		expect(batch).toHaveLength(1);
		expect(batch[0].to).toEqual(['anna@example.test']);
		expect(batch[0].subject).toBe('Game called off');
		expect(batch[0].text).toContain('https://frescati.example/s/spring/g/game-1');
	});

	// The whole point of the switch: somebody who never installs the app still
	// has to be able to stop hearing from Frescati.
	it('skips anybody who has switched the fallback off', async () => {
		configure();
		await writeUser(ANNA, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, emailFallback: false } });
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(0);
		expect(fetch).not.toHaveBeenCalled();
	});

	// Matches how every other preference here is read — a profile written before
	// this existed is opted in, not silently switched off.
	it('treats a profile with no preferences at all as opted in', async () => {
		configure();
		await getDb().doc(`users/${ANNA}`).set({ uid: ANNA, displayName: 'Anna' });
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(1);
	});

	it('skips a uid with no Auth account behind it', async () => {
		configure();
		await writeUser(ANNA);

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(0);
		expect(fetch).not.toHaveBeenCalled();
	});

	// Sign-in is Google-only today, so this filters nothing in practice. It is
	// here for the day somebody adds email/password: an unverified address is
	// one an attacker typed, and mailing it hands them another player's game.
	it('never mails an unverified address', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test', emailVerified: false });

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(0);
	});

	// Bulk-addressing one message would show every player the rest of the
	// group's email addresses.
	it('gives each person their own message rather than a shared to', async () => {
		configure();
		await writeUser(ANNA);
		await writeUser(JOHAN);
		await createAuthUser(ANNA, { email: 'anna@example.test' });
		await createAuthUser(JOHAN, { email: 'johan@example.test' });

		expect(await sendEmail([ANNA, JOHAN], PAYLOAD)).toBe(2);

		const [batch] = sentBatches();
		expect(batch).toHaveLength(2);
		for (const message of batch) expect(message.to).toHaveLength(1);
	});

	// The push has already gone out by the time this runs. Throwing would fail
	// the trigger, and the retry would re-push everybody it did reach.
	it('does not throw when Resend is unreachable', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });
		jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(0);
	});

	it('does not throw when Resend rejects the batch', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });
		resendReturns({ ok: false, status: 422, text: 'domain not verified' });

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(0);
	});

	// A local `pnpm dev:seeded` run mailing the whole seeded roster for real
	// would be a genuinely bad afternoon.
	it('logs instead of sending in the emulator', async () => {
		configure();
		process.env.FUNCTIONS_EMULATOR = 'true';
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		expect(await sendEmail([ANNA], PAYLOAD)).toBe(1);
		expect(fetch).not.toHaveBeenCalled();
	});
});
