const stylexOptions = require('../stylex.config');

/**
 * The test compiler, and nothing else.
 *
 * The build compiles StyleX with the Rust compiler inside SWC, which is why
 * this file is here rather than at `frontend/`, where Next would find it and
 * turn SWC off for the whole app. Jest needs Babel because the Rust compiler
 * rewrites `stylex.create` and leaves the module syntax alone, so its output is
 * still ESM and jest wants CommonJS. Chaining it in front of Next's own SWC
 * transformer means reaching into `next/dist/build/swc`, which is a private
 * path that moves between releases; `next/babel` is public and does the whole
 * job in one pass.
 *
 * The two compilers agree on what they emit. The stylesheet the Rust compiler
 * produces is byte for byte the one Babel produced, hashed class names
 * included, which is what makes a class name asserted in a test the class name
 * that ships. `frontend/stylex.config.js` is the single set of options both
 * read.
 */
module.exports = {
	presets: ['next/babel'],
	plugins: [['@stylexjs/babel-plugin', stylexOptions]],
};
