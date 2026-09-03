#!/usr/bin/env node
/*
 * Measure `next build`, so the table in `docs/stylex.md` can be reproduced
 * rather than believed.
 *
 *   pnpm bench:build                      one run, labelled by the branch
 *   pnpm bench:build stylex-swc 3         three runs under a name
 *   OUT=~/bench pnpm bench:build          keep the rows somewhere durable
 *
 * Five numbers per run: wall clock around the whole build, the compile step
 * Next times itself, the CSS it serves, the shared First Load JS it prints, and
 * every byte of JavaScript under `.next/static`. Comparing two configurations
 * means running this on each and reading the medians, which is why it repeats.
 * Three runs of one configuration spread about two seconds on the laptop this
 * was written on, the same size as some of the differences worth arguing about,
 * so a single run is a number and not a measurement.
 *
 * It deletes `frontend/.next` before every run. A warm build measures the cache
 * rather than the build, and one that reuses a cache is not comparable to one
 * that cannot. That is also why it refuses to start while something is serving
 * port 3000: a dev server owns that same directory, so a run would take its
 * numbers from a machine busy doing something else and pull the directory out
 * from under whoever is working in it.
 *
 * Nothing here knows what StyleX is. It is `next build` with a stopwatch, and
 * it measures whatever the config in `frontend/` currently says.
 */

import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const branchName = () => {
	const { status, stdout } = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' });
	return status === 0 ? stdout.trim() : 'build';
};

const [label = branchName(), runs = '1'] = process.argv.slice(2);
const out = process.env.OUT ?? join(tmpdir(), 'frescati-bench');

/** Whether anything is listening on port 3000, which would be a dev server sharing `.next`. */
const portIsBusy = () =>
	new Promise(resolve => {
		const socket = connect({ host: '127.0.0.1', port: 3000 })
			.on('connect', () => {
				socket.destroy();
				resolve(true);
			})
			.on('error', () => resolve(false));
	});

/** Total bytes of every file under `dir` whose name ends in `extension`. */
const bytesUnder = (dir, extension) => {
	let entries;
	try {
		entries = readdirSync(dir, { recursive: true });
	} catch {
		return 0;
	}

	let total = 0;
	for (const entry of entries) {
		if (!entry.endsWith(extension)) continue;
		const stats = statSync(join(dir, entry));
		if (stats.isFile()) total += stats.size;
	}
	return total;
};

/*
 * Next times its own compile step, in whichever unit fits, and the wall clock
 * is not a substitute for it: that carries the type check, the page generation
 * and Sentry's pass over the output, all of which are the same work whatever
 * compiled the source. The gap between the two columns is where a compiler
 * change actually shows.
 */
const compileSeconds = log => {
	const match = log.match(/Compiled successfully in (?:(\d+)m )?([\d.]+)(m?s)/);
	if (!match) return null;

	const [, minutes, value, unit] = match;
	return Number(minutes ?? 0) * 60 + Number(value) / (unit === 'ms' ? 1000 : 1);
};

const sharedFirstLoadBytes = log => {
	const match = log.match(/First Load JS shared by all\s+([\d.]+)\s*(B|kB|MB)/);
	return match ? Number(match[1]) * { B: 1, kB: 1e3, MB: 1e6 }[match[2]] : null;
};

const median = numbers => {
	const sorted = numbers.filter(n => n != null).sort((a, b) => a - b);
	return sorted.length ? sorted[(sorted.length - 1) >> 1] : null;
};

const seconds = value => (value == null ? '?' : `${value.toFixed(1)}s`);
const bytes = value => (value == null ? '?' : value.toLocaleString('en-US'));

if (await portIsBusy()) {
	console.error('Something is already serving port 3000. Stop it first: this wipes frontend/.next.');
	process.exit(1);
}

mkdirSync(out, { recursive: true });
console.log(`${label}: ${runs} run(s), rows in ${out}`);

const rows = [];

for (let run = 1; run <= Number(runs); run++) {
	rmSync(join(root, 'frontend', '.next'), { recursive: true, force: true });

	const started = performance.now();
	const build = spawnSync('pnpm', ['--filter', 'frontend', 'build'], { cwd: root, encoding: 'utf8' });
	const wallSeconds = (performance.now() - started) / 1000;

	// Both streams, because Next writes the summary to one and its warnings to
	// the other, and a failed run is worth keeping whole.
	const log = `${build.stdout ?? ''}${build.stderr ?? ''}`;
	const logPath = join(out, `${label}.${run}.log`);
	writeFileSync(logPath, log);

	if (build.status !== 0) {
		console.error(`build failed on run ${run}, see ${logPath}`);
		process.exit(1);
	}

	// Stripped of the colours Next writes, which otherwise sit between a number
	// and its unit and defeat both patterns above.
	const plain = log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
	const staticDir = join(root, 'frontend', '.next', 'static');

	const row = {
		label,
		run,
		wallSeconds: Number(wallSeconds.toFixed(2)),
		compileSeconds: compileSeconds(plain),
		cssBytes: bytesUnder(join(staticDir, 'css'), '.css'),
		staticJsBytes: bytesUnder(staticDir, '.js'),
		sharedFirstLoadBytes: sharedFirstLoadBytes(plain),
	};
	rows.push(row);
	writeFileSync(join(out, `${label}.${run}.json`), `${JSON.stringify(row, null, '\t')}\n`);

	console.log(
		`  run ${run}: wall ${seconds(row.wallSeconds)}, compile ${seconds(row.compileSeconds)}, ` +
			`css ${bytes(row.cssBytes)} B, static js ${bytes(row.staticJsBytes)} B, ` +
			`shared ${bytes(row.sharedFirstLoadBytes)} B`
	);
}

/*
 * The median rather than the mean. The first run of a session is reliably the
 * slowest, since nothing it touches is in the page cache yet, and an average
 * lets that one run drag every comparison it takes part in.
 */
console.log(`\n${label}, median of ${rows.length}:`);
console.log(`  next build, wall           ${seconds(median(rows.map(row => row.wallSeconds)))}`);
console.log(`  the compile step alone     ${seconds(median(rows.map(row => row.compileSeconds)))}`);
console.log(`  CSS served                 ${bytes(median(rows.map(row => row.cssBytes)))} B`);
console.log(`  First Load JS shared       ${bytes(median(rows.map(row => row.sharedFirstLoadBytes)))} B`);
console.log(`  all static JS emitted      ${bytes(median(rows.map(row => row.staticJsBytes)))} B`);
