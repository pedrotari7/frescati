const rsOptions = require('./stylex.config');

/**
 * The compiler in `next.config.js` rewrites `stylex.create` calls into class
 * names but emits no CSS. This plugin is the other half: it re-parses every
 * source file below, collects the styles it finds and expands the `@stylex;`
 * directive in `app/globals.css` into the one stylesheet Next serves.
 *
 * That means the `include` globs are load-bearing. A component outside them
 * compiles to class names that no rule ever defines, which renders as an
 * unstyled element rather than as an error.
 *
 * This is a second pass over the same files, which the bundler plugin can avoid
 * by extracting the CSS itself into a stylesheet of its own. That was measured
 * and not taken: see "One stylesheet, and what the second pass costs" in
 * `docs/stylex.md`.
 */
module.exports = {
	plugins: {
		'@stylexswc/postcss-plugin': {
			include: [
				'app/**/*.{js,jsx,ts,tsx}',
				'components/**/*.{js,jsx,ts,tsx}',
				'hooks/**/*.{js,jsx,ts,tsx}',
				'lib/**/*.{js,jsx,ts,tsx}',
			],
			/*
			 * A test that asserts a caller's style reached an element has to
			 * write one, and a style written in a test is not a style the app
			 * ever renders. Without this the shipped sheet carries a rule per
			 * test fixture.
			 */
			exclude: ['**/*.test.{js,jsx,ts,tsx}'],
			rsOptions,
			/**
			 * Off deliberately.
			 *
			 * With layers on, every StyleX rule lands in an `@layer priorityN`,
			 * and any unlayered rule anywhere beats all of them however specific
			 * it is. What is left unlayered in `globals.css` is the preflight and
			 * the few document-wide rules, every one of which is written to be
			 * overridden by a component: turn layers on and `border: 0 solid`
			 * beats a component's own border, and the scrollbar rule beats a
			 * scroller that asked for something else.
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
