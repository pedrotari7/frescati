/**
 * The two things `lib/build.ts` reads off the environment.
 *
 * Both are inlined at build time, which means there is no build in which they
 * can be checked: the values that matter here only exist on Vercel, and a
 * local run sees the empty case forever. This is the test that the empty case
 * stays empty rather than turning into `Build undefined` or a link to
 * `github.com//commit/`.
 *
 * Both are read once at module load, so each case drops the module from the
 * registry and imports it again rather than setting the variables and hoping.
 */

import type * as BuildLib from './build';

const SHA = '82ab6d2f4c1e9a3b7d5028e6f1c94b0a7e3d5f62';

const loadBuildModule = (): Promise<typeof BuildLib> => {
	vi.resetModules();

	return import('./build');
};

describe('build', () => {
	const originalSha = process.env.NEXT_PUBLIC_BUILD_SHA;
	const originalRepo = process.env.NEXT_PUBLIC_BUILD_REPO;

	/** `delete` rather than `= undefined`, which stringifies to `'undefined'`. */
	const setEnv = (name: string, value: string | undefined) => {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	};

	afterEach(() => {
		setEnv('NEXT_PUBLIC_BUILD_SHA', originalSha);
		setEnv('NEXT_PUBLIC_BUILD_REPO', originalRepo);
	});

	describe('buildLabel', () => {
		it('abbreviates to the seven characters git itself would', async () => {
			setEnv('NEXT_PUBLIC_BUILD_SHA', SHA);

			const { buildLabel } = await loadBuildModule();

			expect(buildLabel()).toBe('82ab6d2');
		});

		it('says dev when nothing built this', async () => {
			setEnv('NEXT_PUBLIC_BUILD_SHA', undefined);

			const { buildLabel } = await loadBuildModule();

			expect(buildLabel()).toBe('dev');
		});
	});

	describe('buildCommitUrl', () => {
		it('points at the full sha, not the label on screen', async () => {
			setEnv('NEXT_PUBLIC_BUILD_SHA', SHA);
			setEnv('NEXT_PUBLIC_BUILD_REPO', 'pedrotari7/frescati');

			const { buildCommitUrl } = await loadBuildModule();

			expect(buildCommitUrl()).toBe(`https://github.com/pedrotari7/frescati/commit/${SHA}`);
		});

		it('is null on a local build, which knows neither half', async () => {
			setEnv('NEXT_PUBLIC_BUILD_SHA', undefined);
			setEnv('NEXT_PUBLIC_BUILD_REPO', undefined);

			const { buildCommitUrl } = await loadBuildModule();

			expect(buildCommitUrl()).toBeNull();
		});

		it('is null off GitHub, where there is a sha and nowhere to send it', async () => {
			setEnv('NEXT_PUBLIC_BUILD_SHA', SHA);
			setEnv('NEXT_PUBLIC_BUILD_REPO', undefined);

			const { buildCommitUrl } = await loadBuildModule();

			expect(buildCommitUrl()).toBeNull();
		});
	});
});
