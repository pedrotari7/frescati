/**
 * The two promises `lib/sentry.ts` makes to the rest of the app.
 *
 * Both are easy to break by accident and invisible when broken. Nothing else
 * in the app awaits these calls: every caller fires them with `void`, having
 * already dealt with the real failure, so a regression here does not fail a
 * write or blank a screen. It just quietly turns the reporter into a second
 * source of errors, on top of the one being reported.
 *
 * The DSN is read once at module load, which is why each test drops the module
 * from the registry and imports it again rather than setting the variable and
 * hoping.
 */

import type * as SentryLib from './sentry';

const loadSentryModule = (): Promise<typeof SentryLib> => {
	vi.resetModules();

	return import('./sentry');
};

/**
 * Enough of the SDK for `loadSentry` to get through.
 *
 * Spelled out rather than left to each test, because the module now calls
 * `getClient` and `init` on the way past: a mock missing either throws inside
 * `withSentry`, which swallows it, and the test fails saying only that the call
 * it was actually about never happened.
 */
const mockSdk = (overrides: Record<string, unknown> = {}) => ({
	getClient: () => undefined,
	init: vi.fn(),
	setUser: vi.fn(),
	captureException: vi.fn(),
	flush: vi.fn().mockResolvedValue(true),
	...overrides,
});

describe('sentry', () => {
	const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
	const originalVercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
	const originalUseEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS;

	/** `delete` rather than `= undefined`, which stringifies to `'undefined'`. */
	const setEnv = (name: string, value: string | undefined) => {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	};

	afterEach(() => {
		setEnv('NEXT_PUBLIC_SENTRY_DSN', originalDsn);
		setEnv('NEXT_PUBLIC_VERCEL_ENV', originalVercelEnv);
		setEnv('NEXT_PUBLIC_USE_EMULATORS', originalUseEmulators);
	});

	/**
	 * Which runs are allowed to report.
	 *
	 * This one is invisible in the other direction from the rest of the file: a
	 * regression here does not break the app, it fills the inbox with somebody's
	 * dev server. That already happened: `dev:live` sets
	 * `NEXT_PUBLIC_USE_EMULATORS=0`, so an emulator-only check let a local run
	 * through, and `next dev`'s HMR throws from the webpack runtime constantly.
	 * The signal that separates them is who built the bundle, not what it talks
	 * to, and nothing about a passing app would ever reveal it had regressed.
	 */
	describe('enabled', () => {
		const enabledFor = async (env: Record<string, string | undefined>) => {
			for (const [name, value] of Object.entries(env)) setEnv(name, value);

			return (await loadSentryModule()).sentryOptions.enabled;
		};

		it('reports from a deploy', async () => {
			await expect(enabledFor({ NEXT_PUBLIC_VERCEL_ENV: 'production' })).resolves.toBe(true);
			// A preview reports too. It is tagged apart, not silenced.
			await expect(enabledFor({ NEXT_PUBLIC_VERCEL_ENV: 'preview' })).resolves.toBe(true);
		});

		it('stays quiet on a local run against the real project', async () => {
			// `pnpm dev:live`: no Vercel build, emulators explicitly off.
			await expect(
				enabledFor({ NEXT_PUBLIC_VERCEL_ENV: undefined, NEXT_PUBLIC_USE_EMULATORS: '0' })
			).resolves.toBe(false);
		});

		it('stays quiet on a seeded local stack', async () => {
			await expect(
				enabledFor({ NEXT_PUBLIC_VERCEL_ENV: undefined, NEXT_PUBLIC_USE_EMULATORS: '1' })
			).resolves.toBe(false);
		});
	});

	describe('with no DSN configured', () => {
		beforeEach(() => {
			delete process.env.NEXT_PUBLIC_SENTRY_DSN;
		});

		it('reports nothing, so a fork with no Sentry account behaves as before', async () => {
			const { captureError, setSentryUser } = await loadSentryModule();

			// Resolving rather than throwing is the whole contract: an unconfigured
			// app must not notice this module exists.
			await expect(captureError(new Error('boom'))).resolves.toBeUndefined();
			await expect(setSentryUser('uid-1')).resolves.toBeUndefined();
		});
	});

	describe('with a DSN configured', () => {
		beforeEach(() => {
			process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://key@o1.ingest.de.sentry.io/1';
		});

		it('swallows an SDK that fails to load rather than rejecting', async () => {
			vi.doMock('@sentry/nextjs', () => {
				// Stands in for the lazily fetched chunk failing on bad signal,
				// which is the realistic case at a pitch.
				throw new Error('chunk load failed');
			});

			const { captureError, setSentryUser } = await loadSentryModule();

			await expect(captureError(new Error('boom'))).resolves.toBeUndefined();
			await expect(setSentryUser('uid-1')).resolves.toBeUndefined();

			vi.doUnmock('@sentry/nextjs');
		});

		it('passes the uid through and nothing else about the person', async () => {
			const setUser = vi.fn();
			vi.doMock('@sentry/nextjs', () => mockSdk({ setUser }));

			const { setSentryUser } = await loadSentryModule();

			await setSentryUser('uid-1');
			expect(setUser).toHaveBeenCalledWith({ id: 'uid-1' });

			// Signing out has to clear it, or the next person's errors are filed
			// under the last person to use that phone.
			await setSentryUser(null);
			expect(setUser).toHaveBeenLastCalledWith(null);

			vi.doUnmock('@sentry/nextjs');
		});

		/**
		 * Who calls `init`, now that nothing does it up front.
		 *
		 * The SDK is fetched on idle, and a report can beat that: a crash during
		 * hydration is the case the whole arrangement exists for. So whoever
		 * reaches the module first has to be the one that initialises it, or the
		 * earliest reports, the ones worth the most, are captured into an SDK
		 * that has no client and dropped without a word.
		 */
		it('initialises the SDK for whichever caller gets there first', async () => {
			const init = vi.fn();
			vi.doMock('@sentry/nextjs', () => mockSdk({ init }));

			const { captureError } = await loadSentryModule();

			await captureError(new Error('boom'));
			expect(init).toHaveBeenCalledTimes(1);

			// Memoised on the promise, so a second report joins the first load
			// rather than starting another one.
			await captureError(new Error('again'));
			expect(init).toHaveBeenCalledTimes(1);

			vi.doUnmock('@sentry/nextjs');
		});

		/**
		 * The Node and edge runtimes call `init` themselves, from
		 * `sentry.server.config.ts` and `sentry.edge.config.ts`, before anything
		 * in this module can run. Initialising over the top of that would replace
		 * a live client mid-request.
		 */
		it('leaves an SDK that is already running alone', async () => {
			const init = vi.fn();
			vi.doMock('@sentry/nextjs', () => mockSdk({ init, getClient: () => ({}) }));

			const { captureError } = await loadSentryModule();

			await captureError(new Error('boom'));
			expect(init).not.toHaveBeenCalled();

			vi.doUnmock('@sentry/nextjs');
		});
	});
});
