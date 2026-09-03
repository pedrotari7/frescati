const base = require('../postcss.config');

const stylexPlugin = base.plugins['@stylexswc/postcss-plugin'];

/**
 * The stylesheet for the Vite build.
 *
 * Identical to `frontend/postcss.config.js` but for one more glob. `vite/` is
 * where the document and the routing live now, and the elements they render
 * carry styles like everything else, so a pass that cannot see them emits class
 * names with no rules behind them. That failure is invisible: the element
 * renders unstyled rather than erroring, which is the whole reason
 * `pnpm check:stylex` exists.
 *
 * It is a second config rather than a glob added to the first because the Next
 * build reads that one, and a rule for a component only this build renders
 * would ship to every visitor of the app that is actually deployed.
 */
module.exports = {
	plugins: {
		'@stylexswc/postcss-plugin': {
			...stylexPlugin,
			include: [...stylexPlugin.include, 'vite/**/*.{js,jsx,ts,tsx}'],
		},
		autoprefixer: {},
	},
};
