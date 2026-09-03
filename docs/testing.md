# Testing

Four suites, one runner. Vitest runs all of them; jest's configs are still in the tree, unused, so the comparison below can be re-run rather than believed.

## What runs what

| command | config | what it covers | needs |
| --- | --- | --- | --- |
| `pnpm test` | `vitest.config.ts` | the pure `shared/` logic | nothing |
| `pnpm test:frontend` | `frontend/vitest.config.ts` | components, hooks, `lib/`, in jsdom | nothing |
| `pnpm test:rules` | `rules/vitest.config.ts` | `firestore.rules` and `storage.rules` | Firestore + Storage emulators |
| `pnpm test:backend` | `backend/vitest.config.ts` | the real Cloud Functions | Firestore + Auth emulators |
| `pnpm test:e2e` | `playwright.config.ts` | whole journeys through the built app | its own stack, which it starts |

`pnpm test:all` runs the first four. Playwright is untouched by any of this: it was never a jest suite and is still not one.

## The shape of a suite

`vitest.setup.ts` at the root silences `console.log` and `console.warn` for every suite, as a spy rather than a stub so a test can still assert a call happened. The frontend imports it and adds the two observers jsdom does not implement. The backend has its own pair, because `firebase-functions/logger` snapshots the console the moment it is first required and the assignment has to land before that.

`globals: true` everywhere, so `describe`, `it`, `expect` and `vi` need no import. That is what jest gave, and keeping it meant the move was a rename rather than 128 files of new import lines.

## Compiling StyleX for a test

`frontend/test/stylexPlugin.ts` is the whole of it: a Vite plugin that runs `@stylexjs/babel-plugin` and nothing else, before Vite's own transform, on any file that mentions `@stylexjs/stylex`. Without it every suite that renders a component dies on `Unexpected 'stylex.defineVars' call at runtime`.

It parses TypeScript and JSX rather than compiling them. No preset rewrites the file, so what comes out is the same source with the `stylex.create` calls resolved, and stripping the types and the tags stays Vite's job. `jsx` is left off `.ts`, where `<T>` is a type assertion and turning the tag on makes the file unparseable.

The obvious place to hang a Babel plugin is `@vitejs/plugin-react`, and it is the wrong place as of version 6: the React transform moved to oxc and Babel became an optional peer, so a `babel.plugins` option there is ignored unless `@rolldown/plugin-babel` is installed beside it. It fails silently, which is worth knowing before spending an afternoon on it.

`frontend/stylex.config.js` is still the single set of options every compiler reads, so a class name asserted in a test is the class name that ships.

## What moving off jest actually cost

Nothing in the app changed. The changes were all in test files, and almost all of them mechanical.

- **A rename, mostly.** `jest.*` became `vi.*` in 76 files, with the four exceptions below.
- **The mock types moved off the namespace.** `jest.Mock`, `jest.MockedFunction` and `jest.SpyInstance` are not on `vi`. They are named exports of `vitest` now, and `SpyInstance` is called `MockInstance`, so the files using them gained an import line.
- **`jest.isolateModulesAsync` does not exist.** Two files read a module-scope environment variable and re-import to test it. `vi.resetModules()` followed by the dynamic import does the same job in fewer lines.
- **`jest.requireActual` is `vi.importActual`, and it is async.** One factory, in `SwishPay.test.tsx`, became an async factory.
- **`vi.advanceTimersByTimeAsync` resolves to `vi`, where jest's resolved to `undefined`.** One assertion in `teams.test.ts` was written against the old value. Awaiting the call is the assertion that matters, so it now just awaits it.

The mock-factory hoisting rule people warn about turned out not to bite. Vitest hoists a factory above the imports and forbids it reaching for an outer variable, but every factory here touches its outer variable lazily, from inside the function it returns, by which time the variable exists.

## What it is worth

Medians of three runs on an otherwise idle ten-core M-series laptop, 654 frontend tests and 659 shared, the two runners measured minutes apart. `node scripts/bench-test.mjs jest 3`, then the same for `vitest`, then `--table`. One runner per invocation, because the test files call `vi.*` or they call `jest.*` and never both, so measuring the other side means checking its files back out first.

| scenario | suite | jest | vitest | change |
| --- | --- | --- | --- | --- |
| cold | shared | 3.47s | 1.41s | -59% |
| cold | frontend | 16.14s | 12.79s | -21% |
| warm | shared | 2.49s | 1.41s | -43% |
| warm | frontend | 13.79s | 11.58s | -16% |
| single file | shared | 2.03s | 0.94s | -54% |
| single file | frontend | 3.44s | 2.59s | -25% |

Cold is caches cleared, which is what CI pays every run. Warm is the second run of the day. Single file is the inner loop, where startup is the whole bill.

Vitest is ahead in every cell, and none of the six pairs of run ranges overlap.

The first version of this table said a warm frontend run was 22% slower under vitest, and that was wrong. Both halves of it were measured on a laptop that had emulators, builds and a browser on it, and vitest's frontend runs lost far more to that than jest's did. The likely reason is worker count: this jest config pins `maxWorkers: 4` while vitest sizes its pool to the machine, so contention costs it more. Re-measured back to back on a quiet machine, every cell moved, shared included, and the frontend regression disappeared. The lesson is in the method rather than the runner, and it is why the harness records every individual run and not just the median: the mistake was visible in the numbers before it was visible in the table.

Half the frontend suite's time goes on building a jsdom, once per file. A thread is a cheaper place to do that than a child process, which is why `pool: 'threads'` is set and worth about nine seconds. The two faster options are closed. `isolate: false` shares one environment across files and fails 169 tests, so this suite's independence is real rather than incidental, and `vmThreads` crashes a worker outright.

## The coverage numbers changed, and the old ones were flattering

The frontend thresholds fell about ten points on the way across. No test was lost: 654 passed before and 654 pass now.

Both runners counted with V8. Jest measured the file Babel had already compiled, all 13,406 statements of it, where the source holds 2,106. The extra 11,300 are JSX factory calls, interop shims and the helpers a transpiler writes, and generated code of that sort is nearly all executed, so it pulled every percentage up towards itself. Vitest maps the same V8 ranges back to the TypeScript that was written before counting them.

So 69/70/61/70 is the first honest reading of that suite and 78/89/61/78 never described the code. Raising it is a matter of writing tests, not of changing what gets counted.

`shared/` moved from istanbul to V8 and barely twitched, a point here and there. Its branch floor went from 90 to 95 because the real figure is 95.13 and five points of slack is five points nobody would notice losing.

## The faster environment, and what it costs

`happy-dom` in place of jsdom takes a warm frontend run to roughly a third of what it costs on jsdom, measured at 5.81s against 18.50s in the loaded session above. It is installed, so `pnpm exec vitest run --environment=happy-dom` from `frontend/` will show you.

It is not the default because it is not free. As it stands it fails 24 tests. Twenty-two of those are one idiom: the suite stubs the clipboard with `Object.assign(navigator, ...)` and happy-dom makes that property getter-only, so `Object.defineProperty` is needed instead. The remaining two are the ones that matter. `ErrorBoundary` and `useLiveGameRedirect` both test what happens when storage is blocked, and happy-dom's storage does not fail the way jsdom's does, so the guard never trips and the test watches the wrong branch run.

So the speedup is real and large, and it is paid for by a DOM that is less like a browser exactly where these tests ask whether the app survives a browser behaving badly.

## Reproducing the table

`scripts/bench-test.mjs` runs each cell some number of times and reports the median, because the spread between two runs of one configuration is about the size of some of the differences worth arguing about. It parses the test count back out of every run and refuses to report a row whose two runners disagree about how many tests they ran.

The rules and backend suites are left out on purpose. Both spend three quarters of their time waiting on a Firestore emulator, so repeating them measures Java, and both wipe its database as they go, so repeating them picks a fight with whatever else is using port 8080. Both were run once each to confirm they pass: 292 rules tests and 450 backend tests, unchanged.

## What is still jest's

Nothing. The configs, the setup files, `frontend/test/babel.config.js` and the `jest`, `ts-jest`, `@types/jest`, `jest-environment-jsdom` and `eslint-plugin-jest` dependencies are all gone.

`@testing-library/jest-dom` stays, despite the name. It is the matcher library, not a jest dependency, and `frontend/vitest.setup.ts` imports its `/vitest` entry point.

Two things went with jest, and both needed replacing rather than deleting.

`ts-jest` typechecked every test file as it compiled it, and vitest does not: esbuild strips the types without reading them. A deliberate type error in a `shared/` test failed jest and passed vitest, which is how that got noticed. `pnpm --filter frontend typecheck` covers the frontend, and `"types": ["vitest/globals"]` in `frontend/tsconfig.json` is what makes it possible, since `@types/jest` was quietly supplying `describe`, `it` and `expect` to the whole package and vitest publishes its own globals outside `@types/`, where nothing picks them up unasked. The `shared/`, `rules/` and `backend/` test files sit in no tsconfig at all and are still unchecked. That predates this move, but jest was hiding it.

`scripts/bench-test.mjs` can only run its vitest half now. The jest half needs a checkout from before this commit, which is the price of the table above and worth paying once.
