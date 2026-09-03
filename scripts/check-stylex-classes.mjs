#!/usr/bin/env node
/*
 * Assert that every StyleX class the built app wears is one the stylesheet
 * defines.
 *
 *   pnpm --filter frontend build && pnpm check:stylex
 *
 * Two compilers produce those two halves. The Rust one inside SWC rewrites
 * `stylex.create` into class names in the bundle; the Babel one behind the
 * PostCSS pass generates the rules those names point at. A class name is a hash
 * of the declaration that produced it, so the halves agree only while both read
 * `frontend/stylex.config.js` the same way. When they stop, an element wears a
 * name the sheet never defines and the declaration resolves to nothing.
 *
 * That has happened once here, and it is why this exists. `enableFontSizePxToRem`
 * was on by default on the bundler side and off on the other, so `fontSize: 12`
 * hashed off `font-size:.75rem` in the bundle and off `font-size:12px` in the
 * sheet. Seven declarations, every numeric font size in the app, each pointing
 * at no rule. Nothing else in this repo could see it: jest compiles the
 * component and the test's expectation with the same Babel plugin, so it agrees
 * with itself; the end-to-end suite reads text and clicks it, and text at the
 * wrong size is still text; and the stylesheet was correct in isolation, so
 * diffing it proved the sheet while the bug was that nothing pointed at it.
 * Only the built output knows, and only if something reads it from both sides
 * at once.
 *
 * See "Trusting a compiler that is not Meta's" in `docs/stylex.md`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const built = join(root, 'frontend', '.next');

/** Every file under `dir` with one of these extensions, depth first. */
const filesUnder = (dir, extensions) => {
	let entries;
	try {
		entries = readdirSync(dir, { recursive: true });
	} catch {
		return [];
	}

	return entries
		.map(entry => join(dir, entry))
		.filter(path => extensions.some(extension => path.endsWith(extension)) && statSync(path).isFile());
};

/*
 * A StyleX class name, as it appears on either side: `x` and a hash. The bound
 * is loose on purpose. This is the shape of the thing being counted, not a
 * claim about how long a hash is, and a check that missed a name for being one
 * character longer than expected would be worse than one that reads a stray
 * word as a class.
 */
const CLASS = /^x[0-9a-z]{4,12}$/;

const stylesheets = filesUnder(join(built, 'static', 'css'), ['.css']);
if (stylesheets.length === 0) {
	console.error(`No stylesheet under ${relative(root, built)}. Run \`pnpm --filter frontend build\` first.`);
	process.exit(1);
}

/*
 * What the sheet defines, and separately what it declares as a variable. A
 * token is one or the other: `defineVars` hashes a variable name out of the
 * same alphabet, and the compiled tokens module carries them as `var(--x…)`
 * strings that would otherwise read as classes nothing defines.
 */
const defined = new Set();
const variables = new Set();
for (const path of stylesheets) {
	const css = readFileSync(path, 'utf8');
	for (const [, name] of css.matchAll(/\.(x[0-9a-z]{4,12})(?=[\s,:.{)])/g)) defined.add(name);
	for (const [, name] of css.matchAll(/--(x[0-9a-z]{4,12})\s*:/g)) variables.add(name);
}

/*
 * What the output wears. Class names reach the browser as string literals, in
 * the compiled style objects and in the class attributes rendered from them, so
 * strings are the only place worth reading.
 *
 * A file is read only if it carries `$$css`, the marker the compiler leaves on
 * every object it compiles. A chunk with no compiled StyleX in it cannot be
 * wearing a StyleX class, and skipping it is what keeps somebody else's strings
 * out of the answer: Firebase's transport sends a `"xmlhttp"` that is the right
 * shape and nothing to do with this.
 *
 * Only JavaScript, for the same reason. The prerendered HTML carries the class
 * names too, but it carries no marker to tell them apart from a word in the
 * copy, and every name in it was put there by a compiled object in the server
 * bundle, which is read here.
 */
const referenced = new Map();
const output = [...filesUnder(join(built, 'static'), ['.js']), ...filesUnder(join(built, 'server'), ['.js'])];

let compiledFiles = 0;
for (const path of output) {
	const text = readFileSync(path, 'utf8');
	if (!text.includes('$$css')) continue;
	compiledFiles++;

	for (const [, literal] of text.matchAll(/"([^"\\\n]*)"/g)) {
		for (const token of literal.split(' ')) {
			if (CLASS.test(token) && !variables.has(token) && !referenced.has(token)) {
				referenced.set(token, relative(built, path));
			}
		}
	}
}

/*
 * The floor. Every failure this check exists to catch looks like a name that
 * went missing, and so does the check reading nothing at all: a marker renamed
 * in a StyleX release, an output directory that moved, a build that emitted
 * less than it used to. Without this it would go green exactly when it had
 * stopped looking.
 */
if (compiledFiles === 0 || referenced.size < defined.size / 2) {
	console.error(
		`Found ${referenced.size} class names across ${compiledFiles} compiled files, against ${defined.size} in the ` +
			`stylesheet. That is too few to be a reading of this app, so the check is what broke, ` +
			`not the build. Confirm StyleX still marks its compiled objects with \`$$css\`.`
	);
	process.exit(1);
}

const orphans = [...referenced].filter(([name]) => !defined.has(name));

if (orphans.length > 0) {
	console.error(`${orphans.length} class name(s) worn by the build that the stylesheet does not define:\n`);
	for (const [name, path] of orphans) console.error(`  ${name}  first seen in ${path}`);
	console.error(
		`\nThe two compilers disagree. They read \`frontend/stylex.config.js\`, so start there: an option set on one ` +
			`side and defaulted on the other changes the declaration, and the declaration is what the name is a hash of.`
	);
	process.exit(1);
}

console.log(
	`${referenced.size} StyleX class names worn across ${compiledFiles} files, every one of them among the ` +
		`${defined.size} the stylesheet defines. The bundler and the sheet agree.`
);
