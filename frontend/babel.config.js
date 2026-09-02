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
const dev = process.env.NODE_ENV !== 'production';

module.exports = {
	presets: ['next/babel'],
	plugins: [
		[
			'@stylexjs/babel-plugin',
			{
				/**
				 * Readable class names and a `data-style-src` pointing at the line
				 * that wrote them. Off in production, where the hashed names are
				 * the point.
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
				 * Variable and class hashes are derived from a file's path. Rooting
				 * that at the repo rather than at `frontend/` keeps the hashes
				 * stable whoever runs the build and from wherever, which matters
				 * because `app/tokens.stylex.ts` names variables that the
				 * hand-written CSS in `globals.css` also refers to.
				 */
				unstable_moduleResolution: {
					type: 'commonJS',
					rootDir: path.join(__dirname, '..'),
				},
			},
		],
	],
};
