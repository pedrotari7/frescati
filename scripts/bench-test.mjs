#!/usr/bin/env node
/*
 * Measure the test suites under one runner, so the table in `docs/testing.md`
 * can be reproduced rather than believed.
 *
 *   node scripts/bench-test.mjs jest 3          three runs of each jest cell
 *   node scripts/bench-test.mjs vitest 3        the same for vitest
 *   node scripts/bench-test.mjs --table         print the table from the rows
 *   OUT=~/bench node scripts/bench-test.mjs …   keep the rows somewhere durable
 *
 * One runner per invocation, because the two cannot both run: the test files
 * call `vi.*` or they call `jest.*`, never both, so measuring the other side
 * means checking its files back out first. The rows accumulate in `OUT` and
 * `--table` reads whatever is there, so the two halves can be measured
 * minutes or days apart.
 *
 * Two suites, because they are the two that need nothing but a CPU: the pure
 * `shared/` suite and the jsdom-and-components frontend one. The rules and
 * backend suites are left out on purpose. Both spend three quarters of their
 * time waiting on a Firestore emulator and both wipe its database as they go,
 * so repeating them measures Java and picks a fight with whatever else is
 * using port 8080.
 *
 * Three scenarios per suite, because they are different questions:
 *
 *   cold    caches cleared first. What CI pays on every run.
 *   warm    caches left alone. What the second run of the day costs.
 *   single  one test file, warm. The inner loop, where startup is the whole
 *           bill and the size of the suite is irrelevant.
 *
 * Every cell is run `runs` times and reported as a median, because the spread
 * between two runs of one configuration is about the size of some of the
 * differences worth arguing about, so a single run is a number and not a
 * measurement. The test count is parsed back out of every run, and `--table`
 * refuses to report a row whose two runners disagree about how many tests they
 * ran: that is not a comparison, and saying so beats quietly crowning the
 * faster one.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.OUT ?? join(tmpdir(), 'frescati-bench');

/** One file per suite, for the `single` scenario. */
const ONE_SHARED = 'shared/rating.test.ts';
const ONE_FRONTEND = 'components/DuesBook.test.tsx';

const cellsFor = runner =>
	runner === 'jest'
		? [
				{
					suite: 'shared',
					cwd: root,
					command: ['pnpm', 'exec', 'jest', '--config', 'jest.config.ts'],
					single: [ONE_SHARED],
				},
				{ suite: 'frontend', cwd: join(root, 'frontend'), command: ['pnpm', 'exec', 'jest'], single: [ONE_FRONTEND] },
			]
		: [
				{
					suite: 'shared',
					cwd: root,
					command: ['pnpm', 'exec', 'vitest', 'run', '--config', 'vitest.config.ts'],
					single: [ONE_SHARED],
				},
				{
					suite: 'frontend',
					cwd: join(root, 'frontend'),
					command: ['pnpm', 'exec', 'vitest', 'run', '--config', 'vitest.config.ts'],
					single: [ONE_FRONTEND],
				},
			];

const strip = text => text.replace(/\[[0-9;]*m/g, '');

/**
 * How many tests a run reported. Jest prints `Tests: 659 passed, 659 total`
 * and vitest `Tests  659 passed (659)`. A run with a failure in it is worth
 * nothing here, so anything other than all-passed comes back as null and the
 * row is marked rather than averaged.
 */
const testsRun = output => {
	const clean = strip(output);
	const jest = clean.match(/Tests:\s+(\d+) passed, (\d+) total/);
	if (jest) return jest[1] === jest[2] ? Number(jest[2]) : null;

	const vitest = clean.match(/Tests\s+(\d+) passed \((\d+)\)/);
	if (vitest) return vitest[1] === vitest[2] ? Number(vitest[2]) : null;

	return null;
};

/** Drop whatever the runner would otherwise reuse between runs. */
const clearCaches = runner => {
	if (runner === 'jest') {
		for (const cwd of [root, join(root, 'frontend')]) {
			spawnSync('pnpm', ['exec', 'jest', '--clearCache'], { cwd, encoding: 'utf8' });
		}

		return;
	}

	for (const dir of [root, join(root, 'frontend')]) {
		for (const cache of ['.vite', '.vitest']) {
			rmSync(join(dir, 'node_modules', cache), { recursive: true, force: true });
		}
	}
};

const median = numbers => {
	const sorted = [...numbers].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const time = (cell, extraArgs) => {
	const [command, ...args] = cell.command;
	const started = Date.now();
	const { stdout = '', stderr = '' } = spawnSync(command, [...args, ...extraArgs], {
		cwd: cell.cwd,
		encoding: 'utf8',
		env: { ...process.env, CI: '1' },
	});

	return { seconds: (Date.now() - started) / 1000, tests: testsRun(stdout + stderr) };
};

const printTable = () => {
	const rows = readdirSync(out)
		.filter(name => name.startsWith('test-') && name.endsWith('.json'))
		.flatMap(name => JSON.parse(readFileSync(join(out, name), 'utf8')).rows);

	/** The newest row for a cell wins, so a re-measurement replaces rather than averages with the old one. */
	const pick = (scenario, suite, runner) =>
		rows.filter(r => r.scenario === scenario && r.suite === suite && r.runner === runner).at(-1);

	const table = [
		'| scenario | suite | jest | vitest | change | tests |',
		'| --- | --- | --- | --- | --- | --- |',
	];

	for (const scenario of ['cold', 'warm', 'single']) {
		for (const suite of ['shared', 'frontend']) {
			const jest = pick(scenario, suite, 'jest');
			const vitest = pick(scenario, suite, 'vitest');
			if (!jest || !vitest) continue;

			const agreed = jest.tests !== null && jest.tests === vitest.tests;
			const delta = ((vitest.median - jest.median) / jest.median) * 100;

			table.push(
				`| ${scenario} | ${suite} | ${jest.median.toFixed(2)}s | ${vitest.median.toFixed(2)}s | ` +
					`${delta > 0 ? '+' : ''}${delta.toFixed(0)}% | ${agreed ? jest.tests : '**mismatch**'} |`
			);
		}
	}

	console.log(table.join('\n'));
};

if (process.argv[2] === '--table') {
	printTable();
} else {
	const runner = process.argv[2];
	if (runner !== 'jest' && runner !== 'vitest') {
		console.error('usage: bench-test.mjs <jest|vitest> [runs]   |   bench-test.mjs --table');
		process.exit(1);
	}

	const runs = Number(process.argv[3] ?? 3);
	const rows = [];

	for (const scenario of ['cold', 'warm', 'single']) {
		for (const cell of cellsFor(runner)) {
			const extraArgs = scenario === 'single' ? cell.single : [];
			const seconds = [];
			let tests = null;

			for (let run = 0; run < runs; run++) {
				if (scenario === 'cold') clearCaches(runner);
				// A warm run has to follow something. The first one primes the
				// cache and is thrown away rather than timed.
				else if (run === 0) time(cell, extraArgs);

				const result = time(cell, extraArgs);
				seconds.push(result.seconds);
				tests = result.tests;
			}

			rows.push({ scenario, suite: cell.suite, runner, median: median(seconds), seconds, tests });
			console.error(
				`${scenario.padEnd(7)} ${cell.suite.padEnd(9)} ${runner.padEnd(7)} ` +
					`${median(seconds).toFixed(2)}s  (${tests ?? 'FAILED'} tests)`
			);
		}
	}

	mkdirSync(out, { recursive: true });
	const file = join(out, `test-${runner}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
	writeFileSync(file, JSON.stringify({ runner, runs, cpus: cpus().length, rows }, null, 2));
	console.error(`\nrows written to ${file}`);
}
