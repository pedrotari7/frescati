# The build

Part of Frescati's CLAUDE.md context. See the root `CLAUDE.md` for the app overview.

The frontend is a Next.js 15 App Router app. This file is an evaluation of moving it to Vite: what that actually means, what was built to find out, what it measures, and what it costs. It is the same shape of exercise as the vitest and StyleX ports, and it reaches a different answer.

The port is in the tree and builds. `pnpm --filter frontend build:vite`, `pnpm bench:stacks 3` and `E2E_STACK=vite pnpm test:e2e` are how any claim below is re-run rather than believed.

## The thing that has to be said first

Vite cannot build a Next.js app. There is no bundler to swap.

That is what makes this different from the two ports it looks like. Vitest replaced jest behind a stable interface, and StyleX's Rust compiler replaced its Babel compiler behind another. Both times the thing on either side of the swap did the same job. Next's App Router is not a bundler with a framework on top, it is a compile whose output includes the RSC graph, the `use client` boundaries, the route manifests `next start` reads, and the metadata. Vite has none of that and no slot to put it in.

So the question is not "which bundler" but "keep the framework or not", and the port is a rewrite of everything the framework was doing.

## Why this app can be asked the question at all

Most Next apps cannot. This one is unusually close to a client-rendered SPA already, which is worth writing down because it is the whole reason the exercise is cheap enough to run:

- **68 of the 74 files under `app/` are `'use client'`.** The six that are not are the tokens file, `robots.ts`, the CSP route, and three trivial server components. The root layout is metadata, `app/page.tsx` is one `redirect`, and the season layout awaits `params` and hands off to `SeasonProvider`.
- **No server actions, no `next/image`, no `next/font`, no middleware, no ISR, no `revalidate`, no server-side data fetching.** Every screen reads Firestore from the browser.
- **Authorization is Firestore rules.** Nothing is protected by being on a server, so nothing is lost by not having one.
- **The service worker is hand-written** in `public/`, not generated.
- **13 of the 24 routes already build as `ƒ`,** server-rendered on demand. On Vercel that is a function invocation whose whole job is to return a shell that then talks to Firestore.

## What was built

Everything is under `frontend/vite/`, plus `frontend/vite.config.ts`, `frontend/index.html` and `frontend/api/`. Nothing under `app/`, `components/`, `hooks/` or `lib/` changed, which is the property that makes the comparison worth anything: both builds compile the same app.

| what              | where                         | standing in for                               |
| ----------------- | ----------------------------- | --------------------------------------------- |
| the bundler       | `vite.config.ts`              | `next.config.js`                              |
| StyleX            | `vite/stylexPlugin.ts`        | the SWC plugin in `next.config.js`            |
| the stylesheet    | `vite/postcss.config.cjs`     | `postcss.config.js`, plus one glob            |
| the document      | `index.html`                  | `metadata` and `viewport` in `app/layout.tsx` |
| the providers     | `vite/Root.tsx`               | the `<body>` of `app/layout.tsx`              |
| the routes        | `vite/routes.tsx`             | the file tree under `app/`                    |
| `next/link`       | `vite/adapters/link.tsx`      | `next/link`                                   |
| `next/navigation` | `vite/adapters/navigation.ts` | `next/navigation`                             |
| `params`          | `vite/adapters/params.ts`     | Next's promise-shaped route params            |
| the CSP endpoint  | `api/csp-report.ts`           | `app/api/csp-report/route.ts`                 |
| the headers       | `vite/headers.mjs`            | `headers()` in `next.config.js`               |

The two `next/*` modules are reached by alias rather than by rewriting 21 files of imports. That is not tidiness: it is what keeps `app/` compiling under both builds, and a port that had rewritten those imports would have deleted the thing being compared against.

### StyleX is the part that ports cleanly, and better than expected

`@stylexswc/rs-compiler` exposes `transform(filename, code, options)` as a plain function. It is the same Rust compiler `next.config.js` runs, just called from a Vite `transform` hook instead of from inside SWC, and it is about twelve lines. The PostCSS pass carries over untouched, because Vite runs PostCSS.

So none of what `docs/stylex.md` measured Babel costing is paid here, and one long-standing wart gets better rather than worse. The unit tests compile StyleX with Babel while the build compiles it with Rust, which is the divergence that whole "Trusting a compiler that is not Meta's" section exists to guard against. Under Vite the tests and the build could finally run one compiler.

`pnpm check:stylex vite` runs the same orphan check against `frontend/dist`. It reports **452 class names worn, every one among the 513 the stylesheet defines**, against 502 for the Next build. The gap is prerendering. Next's server bundle carries classes for markup no browser ever builds.

Getting it to read the second build took two fixes, and the second one is the interesting half. See "What the check was actually doing" below.

## What it measures

`pnpm bench:stacks 3`. Medians of three, one laptop, no build cache, both stacks in the same sitting.

Three things had to be handled or the comparison is dishonest. The script's header says so at more length.

- **The typecheck.** `next build` runs `tsc` and eslint as part of the build; `vite build` does neither. Timing one against the other measures the removal of a typecheck more than it measures a bundler. The Vite column runs `tsc --noEmit` first and pays for it on the same clock.
- **The units.** Next reports sizes gzipped, Vite reports them raw. That is a factor of about three and it reads as an enormous win for whichever one you misread. Everything below is measured off the files on disk and reported both ways.
- **What a visitor downloads.** "All JS emitted" is not that number on either side. `firstLoad` walks the import graph the way a browser would, entry chunk plus everything it statically imports plus the screen's own chunk, and reports the bytes on that path.

|                                       | `next build`     | `tsc` + `vite build` |
| ------------------------------------- | ---------------- | -------------------- |
| wall                                  | 32.5s            | 3.5s                 |
| of which typecheck                    | inside the build | 2.1s                 |
| CSS, raw                              | 39,376 B         | 47,929 B             |
| CSS, gzipped                          | 7,358 B          | 7,717 B              |
| all JS emitted, raw                   | 3,177,439 B      | 1,722,058 B          |
| first load `/seasons`                 | 346,000 B        | 417,665 B            |
| first load `/s/[seasonId]`            | 387,000 B        | 440,041 B            |
| first load `/s/[seasonId]/g/[gameId]` | 378,000 B        | 429,569 B            |
| first load `/me`                      | 367,000 B        | 434,020 B            |

The build is where the win is, and it is a big one. 32.5s becomes 3.5s, and 2.1s of that 3.5s is the typecheck, so the bundling itself is about 1.4 seconds. That is nine times faster with the typecheck included and twenty without.

The last four rows are the ones that decide it, and they are why this file recommends what it does. **Every screen costs a visitor 50 to 70 kB more under Vite**, gzipped, even though the build emits 46% less JavaScript in total. Those two facts are the same fact. Next splits into many small chunks and accepts duplication across them; Rolldown builds fewer, larger shared ones, so less is emitted overall and more of it is on the path to any given screen.

That is a default rather than a law, and `build.rolldownOptions.output` is where to go and argue with it. Nobody has yet. That number wants to be below Next's before any of this is taken seriously, because it is the only one in the table a person standing at a pitch can feel.

The stylesheet is 8.5 kB heavier raw and 359 bytes heavier gzipped. That is not StyleX, whose rules are byte-identical from the same compiler and the same config. It is esbuild declining to merge selectors that Next's CSS pipeline merges, `::backdrop` split into a rule of its own rather than folded in with the four that share its declarations. It compresses away to almost nothing, which is why it stays unfixed.

## What it costs

### The prerender, which is the real one

Eleven routes ship real HTML today with the critical CSS inlined. The SPA ships one empty shell for all of them, and the first paint waits on the JavaScript. `index.html` carries a hardcoded `#07080a` so the wait is dark rather than white, and that hex is duplicated from `app/tokens.stylex.ts` because there is no way to reach a token from a document no build step renders. It is the one hardcoded colour in the app and it is a direct cost of losing the prerender.

This is the trade that matters and a build timer cannot see it. The build got much faster. The thing the group actually experiences, opening the app at the pitch on a cold phone, got slower by an amount nothing here has measured. Measuring it needs Playwright against both stacks, not a stopwatch around a build.

### Prefetching

`next/link` fetches a route's chunk when the link scrolls into view. React Router's `Link` does not, and the routes are lazy, so the chunk is fetched on the tap. On a phone-first app that is a real regression, and it is invisible to every number in this file.

### The routing is now written down by hand

`vite/routes.tsx` names all 21 screens. Adding one under `app/` used to be a file; now it is a file and a route, with nothing to catch the second being forgotten except a 404. The CI job exists mostly for this.

### The computed CSP becomes a generated file

`next.config.js` computes the policy from `NODE_ENV` and the project id, and 100 lines of comments explain which host is in it and why. `vercel.json` is static JSON and can express none of that, so `vite/headers.mjs` generates it and `pnpm --filter frontend headers:check` fails when what is committed is stale. The generated output is byte-identical to what the Next config produces, all ten rules.

A generated file that needs a CI job to police it is worse than a config that is simply evaluated. It is the honest option available, not a good one.

### Sentry

`@sentry/nextjs` becomes `@sentry/react` by alias. Gone with it are `captureRouterTransitionStart`, `captureRequestError`, the source-map upload wiring, the `/api/whistle` tunnel the SDK generates today, and `webpack.treeshake.removeTracing`, which `README.md` credits with 28 kB gzipped off the shared bundle. The tunnel matters more than it looks. `docs/error-reporting.md` explains that content blockers block Sentry's ingest hosts by name, and without it the people on phones report nothing while the inbox looks healthy.

### Two copies of small things

The CSP handler, the document styles in `vite/Root.tsx`, the `NEXT_PUBLIC_` inlining. Each is small; each can drift.

## What the end-to-end suite says, which is the part worth trusting

`E2E_STACK=vite pnpm test:e2e` builds and serves the port instead of the Next build. The specs know nothing about either: they open URLs and click things, which is exactly what makes them evidence.

**33 of 35 mobile specs pass against the port, and the Next build scores exactly the same.** Both were run back to back in one sitting, on the same seeded database. The shared failure is `tournament.spec.ts:128`, which is the flake this repo already has on `main` and which passes when its file runs alone. Each stack then loses one more somewhere else, Next at `finances.spec.ts:340` and the port at `tournament.spec.ts:229`, one line further into the file `:128` had already left in a bad state.

So the honest reading is that the two builds are indistinguishable to the suite, not that the port is one test worse.

The suite earned its keep twice over here, because it found two real bugs that nothing else could have.

### A promise built during render, which never converged

The four screens that read a route parameter get it as a promise, because that is the shape Next 15 hands a page, and they read it with `use()`. The obvious way to supply one is `useMemo(() => Promise.resolve(params), [id])`.

That is wrong, and quietly. A component that suspends on its first render has its hook state thrown away. React re-renders it from scratch when the promise settles, the memo does not survive, a second promise is built, and that one suspends too. It never converges. React Router runs navigations inside a `startTransition`, and a transition that never finishes keeps the **previous** screen on the page. So the symptom was not a spinner and not an error. It was the URL changing to a game while the season list stayed on screen, indefinitely.

`vite/adapters/params.ts` caches the promises outside React, keyed by the values, where nothing can discard them. Nine specs went green on that one change.

### The static build serves a copy of `public/`

`next start` serves `frontend/public` from where it sits, so a file written into it after the build is served. `vite build` copies that directory into `dist` and `vite preview` serves the copy. `pnpm seed` writes `public/dev-users.json` **after** the build, deliberately, so the port was serving the previous run's cast. That is 30 specs failing at the sign-in switcher. `scripts/e2e-stack.sh` re-copies after the seed.

Neither bug is exotic and both are invisible to a typecheck, a lint, a unit test and a build. This is the argument for the e2e suite existing, restated by a change that had nothing to do with it.

## What the check was actually doing

`scripts/check-stylex-classes.mjs` reads every StyleX class the built app wears and asserts the stylesheet defines it. Pointing it at a second bundler broke it twice, and neither break was in the part being pointed.

**It only matched double-quoted strings.** Rolldown writes template literals, so the check found 35 files carrying compiled StyleX and not one class name in them. That is the shape of a total failure, and it reported it rather than passing, because of the floor that refuses to report a reading too small to be this app. That floor is the only reason this was visible at all.

**Then it passed locally and failed on CI over the same commit,** which is the one worth writing down. Two separate things were wrong.

A regex cannot read string literals. Quotes only pair with their own kind, and a minified bundle is full of apostrophes sitting inside template literals. One of those opens a match that runs to the next apostrophe and swallows whatever is in between, class names included. Which names survived depended on what the bundler happened to put in the chunk. So the check now scans rather than matches, tracking the opening quote and skipping escapes.

And the `$$css` file filter had quietly stopped doing its job. It exists to keep Firebase's `xmlhttp` out of the answer, a real string that is exactly the shape of a class name, and it worked because webpack kept Firebase in chunks of its own. Rolldown merges them, so a file carrying compiled StyleX now carries the transport too. What separates them is not the name but the position. Compiled StyleX is always an object value, `{kzqmXN:'xh8yej3', …}`, where `xmlhttp` is an argument. The check requires a `:` before the literal now.

Both fixes make it stricter and more complete on **both** builds. It found 476 names in the Next build before and finds 502 now, which means the old regex had been losing real names in the app that ships, silently, for as long as it has existed. Confirmed still able to fail. Delete `enableFontSizePxToRem` from `frontend/stylex.config.js`, rebuild, and it names ten orphans, `xboafo0` among them, which is the exact bug `docs/stylex.md` wrote it for.

## The other thing that was tried

`next build --turbopack` is the cheaper question, and `docs/stylex.md` already names it as the next place to look. It half works.

As currently wired it fails. `stylexPlugin` from the package root only touches webpack, so the build compiles in 6.1s and then dies with `Unexpected 'stylex.defineVars' call at runtime`. Pointing that one `require` at `@stylexswc/nextjs-plugin/turbopack` fixes it and gives a green build in 18.4s against webpack's 33.4s.

Two reasons it was not taken.

- **Shared First Load JS goes from 172 kB to 402 kB.** That is the wrong direction for a phone-first app and it is the number this repo has spent the most effort on.
- **The stylesheet moves to `static/chunks/`,** where `pnpm check:stylex` cannot find it. The guard against the two StyleX compilers disagreeing goes quiet rather than red, which is the failure mode that check was written to prevent.

Worth revisiting when the plugin's Turbopack path settles, and worth a chunking investigation first.

## The recommendation

**Don't take the port.** Not because it does not work. It does, and 33 of 35 journeys pass through it.

The build goes from 32.5s to 3.5s and the StyleX story gets simpler. Against that, every screen costs 50 to 70 kB more to open, the prerendered shell goes, prefetching goes, the Sentry tunnel and the source-map wiring have to be rebuilt, the computed CSP becomes a generated file with a CI job to police it, and the routing becomes 21 hand-written lines that nothing verifies.

The build time is paid by whoever is committing. The first paint is paid by everyone opening the app on a phone at a floodlit pitch in November. Those are not the same person, and 29 seconds of a committer's time is not worth 70 kB of everybody else's.

What the exercise is worth is the two bugs, the header generator, the `firstLoad` measurement, and knowing the answer rather than assuming it. It stays in the tree and in CI for the reason the jest configs stayed through the vitest port. A comparison nobody can re-run stops being evidence within a release or two.

**Do look at Turbopack**, once the shared-bundle number is understood. It is a one-line config change against a framework nobody has to leave.
