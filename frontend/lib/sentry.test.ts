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
			vi.doMock('@sentry/nextjs', () => ({ setUser, captureException: vi.fn() }));

			const { setSentryUser } = await loadSentryModule();

			await setSentryUser('uid-1');
			expect(setUser).toHaveBeenCalledWith({ id: 'uid-1' });

			// Signing out has to clear it, or the next person's errors are filed
			// under the last person to use that phone.
			await setSentryUser(null);
			expect(setUser).toHaveBeenLastCalledWith(null);

			vi.doUnmock('@sentry/nextjs');
		});
	});
});
