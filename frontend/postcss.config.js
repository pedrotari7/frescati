const babelConfig = require('./babel.config');

/**
 * The Babel plugin rewrites `stylex.create` calls into class names but does not
 * emit any CSS. This plugin is the other half: it re-parses every source file
 * below, collects the styles it finds and expands the `@stylex;` directive in
 * `app/globals.css` into the one stylesheet Next serves.
 *
 * That means the `include` globs are load-bearing. A component outside them
 * compiles to class names that no rule ever defines, which renders as an
 * unstyled element rather than as an error.
 */
module.exports = {
	plugins: {
		'@stylexjs/postcss-plugin': {
			include: [
				'app/**/*.{js,jsx,ts,tsx}',
				'components/**/*.{js,jsx,ts,tsx}',
				'hooks/**/*.{js,jsx,ts,tsx}',
				'lib/**/*.{js,jsx,ts,tsx}',
			],
			babelConfig: {
				babelrc: false,
				parserOpts: { plugins: ['typescript', 'jsx'] },
				plugins: babelConfig.plugins,
			},
			/**
			 * Off deliberately.
			 *
			 * With layers on, every StyleX rule lands in an `@layer priorityN`,
			 * and any unlayered rule anywhere beats all of them however specific
			 * they are. The hand-written base and component rules in
			 * `globals.css` are unlayered, so `.glass` would have quietly won
			 * over a component's own background for as long as both existed.
			 *
			 * Off, StyleX orders its own output by property specificity, which is
			 * what it did before layers existed and what it still falls back to.
			 * The thing layers buy, surviving a stylesheet loaded after this one,
			 * is not a problem this app has: there is exactly one.
			 */
			useCSSLayers: false,
		},
		autoprefixer: {},
	},
};
