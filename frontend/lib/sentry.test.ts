/**
 * The two promises `lib/sentry.ts` makes to the rest of the app.
 *
 * Both are easy to break by accident and invisible when broken. Nothing else
 * in the app awaits these calls — every caller fires them with `void`, having
 * already dealt with the real failure — so a regression here does not fail a
 * write or blank a screen. It just quietly turns the reporter into a second
 * source of errors, on top of the one being reported.
 *
 * The DSN is read once at module load, which is why each test re-imports
 * through `jest.isolateModulesAsync` rather than setting the variable and
 * hoping.
 */

import type * as SentryLib from './sentry';

const loadSentryModule = async () => {
	let loaded!: typeof SentryLib;

	await jest.isolateModulesAsync(async () => {
		loaded = await import('./sentry');
	});

	return loaded;
};

describe('sentry', () => {
	const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

	afterEach(() => {
		process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
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
			jest.doMock('@sentry/nextjs', () => {
				// Stands in for the lazily fetched chunk failing on bad signal,
				// which is the realistic case at a pitch.
				throw new Error('chunk load failed');
			});

			const { captureError, setSentryUser } = await loadSentryModule();

			await expect(captureError(new Error('boom'))).resolves.toBeUndefined();
			await expect(setSentryUser('uid-1')).resolves.toBeUndefined();

			jest.dontMock('@sentry/nextjs');
		});

		it('passes the uid through and nothing else about the person', async () => {
			const setUser = jest.fn();
			jest.doMock('@sentry/nextjs', () => ({ setUser, captureException: jest.fn() }));

			const { setSentryUser } = await loadSentryModule();

			await setSentryUser('uid-1');
			expect(setUser).toHaveBeenCalledWith({ id: 'uid-1' });

			// Signing out has to clear it, or the next person's errors are filed
			// under the last person to use that phone.
			await setSentryUser(null);
			expect(setUser).toHaveBeenLastCalledWith(null);

			jest.dontMock('@sentry/nextjs');
		});
	});
});
