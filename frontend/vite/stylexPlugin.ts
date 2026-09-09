import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

/* Named through `require` rather than imported: the compiler is a native addon
 * with no ESM entry, and `stylex.config.js` is CommonJS on purpose, because
 * `next.config.js` and `postcss.config.js` both read it the same way. */
const { transform } = require('@stylexswc/rs-compiler') as {
	transform: (
		filename: string,
		code: string,
		options: Record<string, unknown>
	) => { code: string; map?: string } | null;
};
const stylexOptions = require('../stylex.config') as Record<string, unknown>;

/**
 * StyleX for the Vite build, compiled by the same Rust compiler the Next build
 * runs.
 *
 * This is the whole reason a Vite build of this app is worth measuring. StyleX
 * ships its compiler as a Babel plugin, and `docs/stylex.md` has what putting
 * this app through Babel cost the last time somebody tried: 38 seconds of build
 * and 271 kB of JavaScript. `@stylexswc/rs-compiler` is the same transform in
 * Rust, and it exposes `transform(filename, code, options)` as a plain
 * function, so a bundler that will run a `transform` hook can have it. Next
 * reaches it through SWC; this reaches it directly.
 *
 * `frontend/stylex.config.js` is still the single set of options, now read by
 * four compilers rather than three. That is what keeps a class name the same
 * string wherever it was produced, and `pnpm check:stylex` is what proves it.
 *
 * `enforce: 'pre'` so the file arrives before Vite has stripped the types and
 * the tags. The compiler parses TypeScript and JSX itself and rewrites only the
 * `stylex.*` calls, so what it hands back is the same TSX with the styles
 * resolved, which is the shape Vite is expecting to compile next.
 */
export const stylex = (): Plugin => ({
	name: 'frescati:stylex',
	enforce: 'pre',
	transform(code, id) {
		const [file] = id.split('?');
		if (!file || !/\.(tsx?|jsx?|mjs)$/.test(file) || file.includes('/node_modules/')) return null;

		// The marker every file that declares a style has to import. Skipping the
		// rest is worth about two thirds of the files in the app.
		if (!code.includes('@stylexjs/stylex')) return null;

		const result = transform(file, code, { ...stylexOptions, sourceMap: 'True' });

		// A map comes back as a JSON string, which is what Vite wants anyway.
		return result?.code ? { code: result.code, map: result.map ?? null } : null;
	},
});
