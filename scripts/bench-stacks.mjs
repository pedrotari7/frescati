#!/usr/bin/env node
/*
 * The two builds of this frontend, measured against each other.
 *
 *   pnpm bench:stacks            one run of each
 *   pnpm bench:stacks 3          three runs of each, medians reported
 *   OUT=~/bench pnpm bench:stacks 3
 *
 * `scripts/bench-build.mjs` is the older script and stays as it is: it times
 * `next build` and nothing else, which is what makes the table in
 * `docs/stylex.md` reproducible. This one answers the other question, the one
 * `docs/build.md` is about, which is what the framework costs rather than what
 * a compiler inside it costs.
 *
 * Three things make a comparison between them dishonest if they are not
 * handled, and all three are handled here.
 *
 * **The typecheck.** `next build` runs `tsc` and eslint over the app as part of
 * the build. `vite build` does neither. Timing one against the other measures
 * the removal of a typecheck far more than it measures a bundler, so the Vite
 * column runs `tsc --noEmit` first and pays for it in the same wall clock. It
 * is not optional work: CI has to do it either way.
 *
 * **The units.** Next prints its sizes gzipped and Vite prints its raw, which
 * is a factor of about three and reads as a huge win for whichever one you
 * misread. Everything below is measured off the files on disk, and every size
 * is reported both ways.
 *
 * **What a visitor downloads.** "All static JS emitted" is not that number, on
 * either side: Next writes a chunk per route and nobody loads all of them.
 * `firstLoad` walks the import graph the way the browser would, from the entry
 * to a named screen, and reports the bytes on that path. For Next it is read
 * back out of the route table it prints, which is where that number is already
 * defined; for Vite it is computed from `dist/.vite/manifest.json`.
 */

import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { connect } from 'node:net';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = join(root, 'frontend');

const runs = Number(process.argv[2] ?? 1);
const out = process.env.OUT ?? join(tmpdir(), 'frescati-bench');

/**
 * The screens the tables below report, as a URL and the file behind it.
 *
 * Four rather than all twenty-one: the seasons list is the first screen anybody
 * signed in sees, a season page is where they spend the evening, a game page is
 * the one a notification opens, and `/me` is the heaviest thing in the app that
 * is not a season.
 */
const ROUTES = [
	{ url: '/seasons', source: 'app/(app)/seasons/page.tsx' },
	{ url: '/s/[seasonId]', source: 'app/(app)/s/[seasonId]/page.tsx' },
	{ url: '/s/[seasonId]/g/[gameId]', source: 'app/(app)/s/[seasonId]/g/[gameId]/page.tsx' },
	{ url: '/me', source: 'app/(app)/me/page.tsx' },
];

const sh = (command, args) => {
	const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
	return { status: result.status, log: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

const plain = log => log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

/** Whether anything is serving port 3000, which would be a dev server sharing an output directory. */
const portIsBusy = () =>
	new Promise(resolve => {
		const socket = connect({ host: '127.0.0.1', port: 3000 })
			.on('connect', () => {
				socket.destroy();
				resolve(true);
			})
			.on('error', () => resolve(false));
	});

const filesUnder = (dir, extension) => {
	let entries;
	try {
		entries = readdirSync(dir, { recursive: true });
	} catch {
		return [];
	}

	return entries
		.filter(entry => entry.endsWith(extension))
		.map(entry => join(dir, entry))
		.filter(file => statSync(file).isFile());
};

/** Raw and gzipped bytes of a list of files, which is how every size here is reported. */
const weigh = files => {
	let raw = 0;
	let gzip = 0;

	for (const file of files) {
		const buffer = readFileSync(file);
		raw += buffer.byteLength;
		gzip += gzipSync(buffer, { level: 9 }).byteLength;
	}

	return { raw, gzip };
};

/* ---------------------------------------------------------------- next --- */

/**
 * Next's own route table, which already answers the first-load question in the
 * units this script reports everything else in.
 *
 * Read rather than recomputed, because it is the number the framework commits
 * to in its own output and recomputing it from `.next/` would be this script
 * inventing a second definition of it.
 */
const nextFirstLoad = (log, url) => {
	const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = plain(log).match(
		new RegExp(`[├└┌]\\s+[○ƒ]\\s+${escaped}\\s+[\\d.]+\\s*\\w*B\\s+([\\d.]+)\\s*(B|kB|MB)`)
	);

	return match ? Number(match[1]) * { B: 1, kB: 1e3, MB: 1e6 }[match[2]] : null;
};

const buildNext = () => {
	rmSync(join(frontend, '.next'), { recursive: true, force: true });

	const started = performance.now();
	const { status, log } = sh('pnpm', ['--filter', 'frontend', 'build']);
	const wallSeconds = (performance.now() - started) / 1000;

	if (status !== 0) return { failed: true, log };

	const staticDir = join(frontend, '.next', 'static');

	return {
		log,
		wallSeconds,
		css: weigh(filesUnder(join(staticDir, 'css'), '.css')),
		js: weigh(filesUnder(staticDir, '.js')),
		firstLoad: Object.fromEntries(ROUTES.map(route => [route.url, nextFirstLoad(log, route.url)])),
	};
};

/* ---------------------------------------------------------------- vite --- */

/**
 * Everything the browser has to have before a screen renders: the entry chunk,
 * every chunk it statically imports, and the lazy chunk for the screen with its
 * own static imports. Walked rather than summed, because chunks are shared and
 * a chunk counted twice is a route that looks heavier than it is.
 */
const viteFirstLoad = (manifest, dist, source) => {
	const seen = new Set();

	const walk = key => {
		const entry = manifest[key];
		if (!entry || seen.has(key)) return;

		seen.add(key);
		for (const imported of entry.imports ?? []) walk(imported);
	};

	walk('index.html');
	if (source) walk(source);

	// CSS is excluded to match what Next means by First Load JS. It is reported
	// on its own row, where it is the same stylesheet for every route anyway.
	return weigh([...seen].map(key => join(dist, manifest[key].file)));
};

const buildVite = () => {
	const dist = join(frontend, 'dist');
	rmSync(dist, { recursive: true, force: true });

	const started = performance.now();
	// The typecheck first, and inside the clock. See the header.
	const typecheck = sh('pnpm', ['--filter', 'frontend', 'typecheck']);
	const typecheckSeconds = (performance.now() - started) / 1000;

	if (typecheck.status !== 0) return { failed: true, log: typecheck.log };

	const built = sh('pnpm', ['--filter', 'frontend', 'build:vite']);
	const wallSeconds = (performance.now() - started) / 1000;

	if (built.status !== 0) return { failed: true, log: built.log };

	const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));

	return {
		log: `${typecheck.log}${built.log}`,
		wallSeconds,
		typecheckSeconds,
		css: weigh(filesUnder(join(dist, 'assets'), '.css')),
		js: weigh(filesUnder(join(dist, 'assets'), '.js')),
		firstLoad: Object.fromEntries(
			ROUTES.map(route => [route.url, viteFirstLoad(manifest, dist, route.source).gzip])
		),
	};
};

/* ------------------------------------------------------------- reporting -- */

const median = numbers => {
	const sorted = numbers.filter(n => n != null).sort((a, b) => a - b);
	return sorted.length ? sorted[(sorted.length - 1) >> 1] : null;
};

const seconds = value => (value == null ? '?' : `${value.toFixed(1)}s`);
const bytes = value => (value == null ? '?' : value.toLocaleString('en-US'));

if (await portIsBusy()) {
	console.error('Something is already serving port 3000. Stop it first: this wipes both build directories.');
	process.exit(1);
}

mkdirSync(out, { recursive: true });
console.log(`${runs} run(s) of each stack, logs in ${out}\n`);

const stacks = {
	next: { label: 'next build', build: buildNext, rows: [] },
	vite: { label: 'tsc + vite build', build: buildVite, rows: [] },
};

for (const [name, stack] of Object.entries(stacks)) {
	for (let run = 1; run <= runs; run++) {
		const row = stack.build();
		writeFileSync(join(out, `${name}.${run}.log`), row.log ?? '');

		if (row.failed) {
			console.error(`${name} failed on run ${run}, see ${join(out, `${name}.${run}.log`)}`);
			process.exit(1);
		}

		stack.rows.push(row);
		console.log(
			`  ${name} run ${run}: wall ${seconds(row.wallSeconds)}, ` +
				`css ${bytes(row.css.gzip)} B gz, all js ${bytes(row.js.gzip)} B gz`
		);
	}
}

const pick = (stack, read) => median(stacks[stack].rows.map(read));

const table = [
	['', 'next build', 'tsc + vite build'],
	['wall', seconds(pick('next', r => r.wallSeconds)), seconds(pick('vite', r => r.wallSeconds))],
	['of which typecheck', 'inside the build', seconds(pick('vite', r => r.typecheckSeconds))],
	['CSS, raw', bytes(pick('next', r => r.css.raw)), bytes(pick('vite', r => r.css.raw))],
	['CSS, gzipped', bytes(pick('next', r => r.css.gzip)), bytes(pick('vite', r => r.css.gzip))],
	['all JS emitted, raw', bytes(pick('next', r => r.js.raw)), bytes(pick('vite', r => r.js.raw))],
	...ROUTES.map(route => [
		`first load ${route.url}`,
		bytes(pick('next', r => r.firstLoad[route.url])),
		bytes(pick('vite', r => r.firstLoad[route.url])),
	]),
];

const widths = table[0].map((_, column) => Math.max(...table.map(row => String(row[column]).length)));
const line = row => row.map((cell, column) => String(cell).padEnd(widths[column])).join('  ');

console.log(`\nmedian of ${runs}, first-load figures gzipped:\n`);
console.log(line(table[0]));
console.log(widths.map(width => '-'.repeat(width)).join('  '));
for (const row of table.slice(1)) console.log(line(row));
