import { transformAsync } from '@babel/core';
import type { Plugin } from 'vite';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const stylexOptions = require('../stylex.config');

/**
 * The test compiler, and nothing else.
 *
 * The build compiles StyleX with the Rust compiler inside SWC. Vitest has to
 * compile it too: left alone, every suite that renders a component dies on
 * `Unexpected 'stylex.defineVars' call at runtime`, which is the runtime shim
 * saying it was never compiled.
 *
 * `@vitejs/plugin-react` used to be the place to hang a Babel plugin, and is
 * not any more. Version 6 moved the React transform to oxc and made Babel an
 * optional peer, so a `babel.plugins` option there is silently ignored unless
 * `@rolldown/plugin-babel` is installed alongside it. Rather than depend on
 * that reshuffling, this runs Babel itself, over StyleX and nothing else.
 *
 * It is `enforce: 'pre'` so it sees the file before Vite's own transform, and
 * it only ever *parses* TypeScript and JSX rather than compiling them:
 * `parserOpts.plugins` teaches Babel's parser the syntax, no preset rewrites
 * it, so what comes out is the same TSX with the `stylex.create` calls
 * resolved. Stripping the types and the tags stays Vite's job.
 *
 * `frontend/stylex.config.js` is the single set of options every compiler
 * reads, which is what makes a class name asserted in a test the class name
 * that ships.
 */
export const stylex = (): Plugin => ({
	name: 'frescati:stylex',
	enforce: 'pre',
	async transform(code, id) {
		const [file] = id.split('?');
		if (!file || !/\.(tsx?|jsx?|mjs)$/.test(file) || file.includes('/node_modules/')) return null;
		if (!code.includes('@stylexjs/stylex')) return null;

		const result = await transformAsync(code, {
			filename: file,
			babelrc: false,
			configFile: false,
			sourceMaps: true,
			/**
			 * `jsx` is left off `.ts`, where `<T>` is a type assertion rather than
			 * an opening tag and turning the tag on makes the file unparseable.
			 */
			parserOpts: { plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'] },
			// Named rather than imported: the plugin's own types are generated from
			// Flow and do not line up with Babel's `PluginItem`, and `next build`
			// typechecks this file. `test/babel.config.js` names it the same way.
			plugins: [['@stylexjs/babel-plugin', stylexOptions]],
		});

		if (!result?.code) return null;

		// Handed over as JSON rather than as the object. Babel types every array
		// on a source map readonly and the bundler's own type wants them
		// mutable, so the two never line up field by field; a serialised map is
		// something both sides agree is a source map.
		return { code: result.code, map: result.map ? JSON.stringify(result.map) : null };
	},
});
