const path = require('path');

/**
 * StyleX compiles at build time, and the only compiler it ships is a Babel
 * plugin, so this file exists and its existence is the whole cost of the
 * migration: Next sees a Babel config in the project root and turns SWC off for
 * the app's own source. `next/babel` puts back what SWC was doing (JSX, TS
 * stripping, React Refresh, the server/client component boundary), but it does
 * it in JS rather than Rust, so builds are slower. See `docs/stylex.md` for the
 * measurement and what it buys.
 *
 * Nothing here reaches the backend or `shared/`, both of which are compiled by
 * tsc and never see Babel.
 */
/*
 * The dev server only, rather than everything that is not a production build.
 *
 * `dev` adds a readable class per style entry (`Button__styles.primary`) beside
 * each hashed one, which is worth having in front of the element inspector and
 * nowhere else. A jest test reads class lists back to compare two states, and
 * under `dev` every entry there comes out twice, once as a name that belongs to
 * the file that wrote it, which is exactly the coupling `test/stylex.ts` exists
 * to avoid.
 */
const dev = process.env.NODE_ENV === 'development';

module.exports = {
	presets: ['next/babel'],
	plugins: [
		[
			'@stylexjs/babel-plugin',
			{
				/**
				 * Readable class names and a `data-style-src` pointing at the line
				 * that wrote them. See above for why that is the dev server
				 * alone rather than every build that is not production.
				 */
				dev,
				/**
				 * The styles are collected by the PostCSS plugin into one
				 * stylesheet Next serves. Injecting them from the runtime instead
				 * would mean a flash of unstyled content on every first paint,
				 * which on a phone-first app is the whole screen.
				 */
				runtimeInjection: false,
				enableInlinedConditionalMerge: true,
				treeshakeCompensation: true,
				aliases: {
					'@/*': [path.join(__dirname, '*')],
					'@shared/*': [path.join(__dirname, '../shared/*')],
				},
				/**
				 * How the compiler follows an import to the file that declared a
				 * token. Without it a component importing `colors` from
				 * `app/tokens.stylex.ts` is a value StyleX cannot resolve, and it
				 * says so rather than guessing.
				 *
				 * Variable and class hashes are derived from that file's path taken
				 * relative to `rootDir`, and two separate compiles have to agree on
				 * them: the Babel pass webpack runs over the app, and the second
				 * pass the PostCSS plugin runs to collect the CSS. Anchoring both on
				 * this file's own directory keeps the names independent of whose
				 * machine the build is on and which directory it started in.
				 */
				unstable_moduleResolution: {
					type: 'commonJS',
					rootDir: path.join(__dirname, '..'),
				},
			},
		],
	],
};
