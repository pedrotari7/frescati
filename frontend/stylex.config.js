const path = require('path');

/*
 * The StyleX compiler options, in one place because three things read them:
 * the Rust plugin SWC runs over the app (`next.config.js`), the PostCSS pass
 * that collects the rules into the stylesheet (`postcss.config.js`), and the
 * Babel plugin jest compiles tests with (`test/babel.config.js`). They have to
 * agree. A class name is a hash of the declaration that produced it, so two
 * compilers reading different options emit two different names for the same
 * style, and the one in the stylesheet is not the one on the element.
 */

/**
 * Readable class names and a `data-style-src` pointing at the line that wrote
 * them, on the dev server alone rather than on everything that is not a
 * production build.
 *
 * `dev` emits a second, file-specific class per entry (`Button__styles.primary`)
 * beside each hashed one, which is worth having in front of the element
 * inspector and nowhere else. A jest test reads class lists back to compare two
 * states, and under `dev` every entry there comes out twice, once as a name that
 * belongs to the file that wrote it, which is exactly the coupling
 * `test/stylex.ts` exists to avoid. `NODE_ENV` is `test` under jest, so this is
 * off there.
 */
const dev = process.env.NODE_ENV === 'development';

module.exports = {
	dev,
	/**
	 * The rules are collected into the one stylesheet Next serves. Injecting
	 * them from the runtime instead would mean a flash of unstyled content on
	 * every first paint, which on a phone-first app is the whole screen.
	 */
	runtimeInjection: false,
	/**
	 * Keeps a `.stylex.ts` file in the bundle when everything it exports has
	 * been inlined at compile time, so the variable declarations it owns are
	 * still there for the rules that reference them. Measured as a no-op on
	 * this app, both stylesheet and bundle come out byte for byte the same
	 * without it. It stays because the failure it prevents is a token
	 * resolving to nothing, which is invisible until a screen renders black
	 * on black.
	 */
	treeshakeCompensation: true,
	aliases: {
		'@/*': [path.join(__dirname, '*')],
		'@shared/*': [path.join(__dirname, '../shared/*')],
	},
	/**
	 * How the compiler follows an import to the file that declared a token.
	 * Without it a component importing `colors` from `app/tokens.stylex.ts` is a
	 * value StyleX cannot resolve, and it says so rather than guessing.
	 *
	 * Variable and class hashes are derived from that file's path taken relative
	 * to `rootDir`, and every compile has to agree on them. Anchoring on this
	 * file's own directory keeps the names independent of whose machine the
	 * build is on and which directory it started in.
	 */
	unstable_moduleResolution: {
		type: 'commonJS',
		rootDir: path.join(__dirname, '..'),
	},
};
