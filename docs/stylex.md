# StyleX

Part of Frescati's CLAUDE.md context. See the root `CLAUDE.md` for the app overview.

The frontend was Tailwind v4 and is now StyleX 0.19. This file is the evaluation that came with the port: what moved, what it cost, what it caught, and whether it was worth it.

It has been measured twice. The first round was the port itself, which put the app on StyleX's Babel plugin and doubled the build. The second round took the Babel plugin out again, and most of what the first round called the price of StyleX turned out to be the price of that one plugin. Every number below is `next build` on one laptop, warm install, no build cache, median of three, all three configurations measured in the same sitting.

## Where the styling lives now

- `frontend/app/tokens.stylex.ts` is the palette, the type stack, the shadows and the breakpoints. It replaces Tailwind's `@theme` block. The `.stylex.ts` suffix is load-bearing. Only a file carrying it may define variables, and StyleX hashes each variable's name off that file's path, which is what stops one token being declared twice under two names. Nothing but `defineVars` and `defineConsts` may be exported from it.
- `frontend/lib/styles.ts` is the shared shapes: the glass surfaces, the animations, the press wash, the focus ring, the tap target, the truncation. These were `@layer components` rules reached by name from a `className`, and they are now style objects you import.
- `frontend/app/globals.css` is 155 lines and holds three things: a hand-written base layer, the `@stylex;` line the compiled rules land on, and the handful of rules that belong to no element (the scrollbar, the iOS input zoom, the reduced-motion blanket).
- `frontend/stylex.config.js` is the compiler's options, and it is one file because three separate compiles read it: the Rust plugin SWC runs over the app, the PostCSS pass that collects the rules, and the Babel plugin jest compiles tests with. A class name is a hash of the declaration that produced it, so two of them reading different options emit two different names for one style, and the name in the stylesheet is then not the name on the element.
- `frontend/next.config.js` compiles the styles, `frontend/postcss.config.js` collects them into the one stylesheet, `frontend/test/babel.config.js` is jest's copy of the compiler, and `.browserslistrc` at the repo root says what to compile and prefix for.
- `frontend/test/stylex.ts` is how a jsdom test asks what an element is wearing.

Everything else is a `stylex.create` next to the component that uses it. There are 93 files with one in them.

## What it costs

StyleX compiles at build time, and the compiler it ships is a Babel plugin. Next sees a Babel config in the project and turns SWC off for the app's own source, so the whole frontend compiles at Babel's speed for a decision about styling. The first round of this port paid that, said so, and called it the entire cost of the migration.

It is not the cost any more. `@stylexswc/nextjs-plugin` is the same transform written in Rust, running inside the SWC pipeline Next already has, so there is no Babel config in the project root and the app is compiled by SWC again. The middle column below is what that was costing:

|                             | Tailwind and SWC | StyleX and Babel | StyleX and SWC |
| --------------------------- | ---------------- | ---------------- | -------------- |
| `next build`, wall          | 27.9s            | 1:09.0           | 30.9s          |
| the compile step alone      | 16.1s            | 54.0s            | 16.5s          |
| CSS served                  | 51,431 B         | 39,137 B         | 39,137 B       |
| First Load JS shared by all | 172 kB           | 179 kB           | 171 kB         |
| all static JS emitted       | 3,116,022 B      | 3,448,197 B      | 3,176,833 B    |

Read down the last two columns rather than across the first two, because that is the part nobody measured the first time. Moving off Babel took 38 seconds off the build, 8 kB off the shared bundle and 271 kB off the JavaScript in total, and changed nothing about the CSS. None of that was ever StyleX's doing. It was the compiler the plugin forced the app onto, and the difference between the two columns is Babel's output next to SWC's for the same browsers.

Against `main` the whole account is now three seconds of build time and 61 kB of static JavaScript, in exchange for 12 kB off the stylesheet every visitor downloads and a shared bundle 1 kB smaller than Tailwind's. The compile step is the same 16 seconds either way. That is a different argument from the one the first round had to make.

## Trusting a compiler that is not Meta's

`@stylexswc/nextjs-plugin` is a community project. It tracks the official releases and says out loud which one it is compatible with, currently the 0.19 the app is on, but it is a second implementation of a compiler whose entire job is to produce exactly the right string.

What makes it safe to lean on is that the claim is checkable, and it checks out exactly. The stylesheet the Rust compiler emits is byte for byte the stylesheet Babel emitted: 39,137 bytes, the same rules in the same order, the same hashed class names, down to the same content hash in the filename Next serves it under. Two independent implementations agreeing to the byte is the whole contract. `pnpm test:e2e` then drove the app itself, at both viewports, against a real seeded database.

What that does not cover is a future release of either side drifting. The check is cheap and worth repeating whenever one of them moves: build, and diff `.next/static/css/*.css` against the sheet before the upgrade. If the filename hash still matches, nothing moved.

## Why jest still runs Babel

The Rust compiler rewrites `stylex.create` and leaves the module syntax alone, which is right for a bundler and wrong for jest. The output is still ESM and jest wants CommonJS. Chaining it in front of Next's own SWC transformer means reaching into `next/dist/build/swc`, a private path that moves between releases. `next/babel` is public and does the whole job in one pass, so jest compiles with Babel and the build does not.

That is why `test/babel.config.js` is in `test/` rather than at `frontend/`. A Babel config in the project root is exactly what turns SWC off, so where the file sits is load-bearing, and moving it back would quietly hand the whole build back to Babel.

The two compilers agree on what they emit, which is what makes a class name asserted in a jsdom test the class name that ships, and both read `frontend/stylex.config.js`.

## One stylesheet, and what the second pass costs

The app compiles its styles twice: once in the bundler, to turn `stylex.create` into class names, and once in PostCSS, to collect the rules those names refer to and expand `@stylex;` in `globals.css`. The bundler plugin can do the second job itself instead, extracting the CSS into a stylesheet of its own and leaving PostCSS out of it.

Measured both ways, and the second pass is not what it looks like. Extraction in the bundler builds in 29.3s against 30.9s, which is inside the run-to-run spread, and it costs 128 kB of extra JavaScript and a second render-blocking stylesheet on every page. The pass that looks redundant is close to free. It is Rust reading files that are already in the page cache, and what would replace it costs more than it saves.

So the double compile stays, and so does the property the port was built around: one stylesheet, in one order, with the hand-written base layer above the compiled rules in the same file.

## What was tried and did not pay

- `rsOptions.include`, narrowing the bundler's transform to the four directories that hold styles. No measurable change, and it turns a file in the wrong place into an app that throws at runtime. Not worth a new way to break the app for a difference nothing can measure.
- `treeshakeCompensation: false`. Stylesheet and bundle come out byte for byte identical without it on this app. It stays on anyway, because the failure it exists to prevent is a token that resolves to nothing, which looks like black text on a black screen rather than like an error.

## The browserslist trap, which cost more than StyleX did

Worth keeping written down, because it is the reason the first round's numbers were wrong and it will catch the next person who compares a Babel-compiled Next app against an SWC one.

The first honest measurement of the port was much worse than the table above: 431 kB of shared JS and 4.85 MB in total, with a regenerator shim wrapped around every `await` in the app.

`next/babel` sets `@babel/preset-env`'s `targets` for the server and test builds and leaves it unset for the client, where preset-env falls back to asking browserslist. This repo had no browserslist config, so it compiled for nothing in particular, which means ES5. SWC never asked, because Next hands it `MODERN_BROWSERSLIST_TARGET` directly.

`.browserslistrc` is that same list written down, and it closed the gap: 1.4 MB of JavaScript that no measurement of StyleX should ever have been charged for.

Babel is gone and the trap with it, so the file has one job left rather than two. Next looks for a browserslist config before falling back to that constant, so for the JavaScript it now says exactly what Next would have decided anyway. Autoprefixer is what still needs it, and reads it to prefix the stylesheet for the same browsers the JavaScript is built for. It lives at the repo root because which file a build picks up depends on which directory it started in, and `pnpm --filter frontend build`, a Vercel build and an editor plugin do not agree on that.

## `flex-1` is not `flexBasis: 0`

The port's one real bug, and the shape of it is worth writing down because the translation looked exact.

Tailwind's `flex-1` is `flex: 1 1 0%`, and it was on 62 elements. Written out as properties that reads as `flexGrow: 1, flexBasis: 0`, which is what the port did in 48 places. Those are not the same declaration. A percentage flex basis against a container whose main size is indefinite falls back to the item's own content; a length of 0 is simply 0. Every horizontal case in the app is inside something with a definite width, so 47 of them behaved identically.

The one that did not was the dev user switcher: a dialog capped at `80dvh` but sized by its content, so its height is indefinite, so the scrolling list of accounts had no free space to grow into and rendered as nothing at all. Every end-to-end spec failed, all 30 of them, because signing in is the first thing each one does and the person to sign in as was a button with no height.

Jest never saw it and could not have: jsdom has no layout, so a test can read the class list back and confirm the property is set, and the property was set. `pnpm test:e2e` in a real browser is the only thing in this repo that could have caught it, and it caught it immediately.

## What it did to the tests

- `next/jest` installs the SWC transformer and SWC on its own cannot run StyleX, so `jest.config.ts` replaces it with `babel-jest` pointed at `test/babel.config.js`. Without that every suite that renders anything dies on `Unexpected 'stylex.defineVars' call at runtime`. The build no longer uses Babel; see "Why jest still runs Babel" for why this one does.
- The coverage provider had to move from istanbul to V8. `babel-plugin-istanbul` does not compose with StyleX: an instrumented `stylex.keyframes` comes out of Babel uncompiled and throws on import, and an instrumented arrow inside `stylex.create` fails the build outright. V8 counts what the engine ran and maps it back through the source maps, so nothing is rewritten to be measured. The thresholds moved with it, upwards, which is a difference in counting rather than in testing. Still true, and still Babel's problem: jest is where Babel lives now.
- `babel-plugin-jest-hoist` is stricter than SWC's: a `jest.mock` factory may not reach for a variable outside its scope unless the name starts with `mock`. Two mocks were rewritten.
- A test can no longer ask what colour something is, because a class called `text-in` is now a hash and jsdom has no stylesheet to resolve it against. `frontend/test/stylex.ts` answers the question that is still askable: `stylesFor` compiles the style a test means and `stylesOf` reads what the element carries. StyleX hashes a class off the property and value, so a `stylex.create` in a test file compiles to the same class as the component's, and the two compare equal. That is also why `dev` is on for the dev server only: it emits a second, file-specific class per entry, and a test comparing those would be coupled to the file that wrote them.
- Two end-to-end specs used to find a game row by `.glass-card`. Class names belong to the compiler now, so the row carries a `data-testid` and `e2e/locators.ts` exports it. That is a fair trade. A test hook you can see beats styling a test had quietly made load-bearing.

## Priority decides, not source order

StyleX resolves a collision by a priority it computes per declaration, and merging two styles replaces a property outright rather than blending. Measured on `backgroundColor`: a resting value scores 3000, a bare `:active` 3170, a `:hover` inside `@media (hover: hover)` 6130 and an `:active` inside that same query 6170.

So a press written as a bare `:active` loses to a hover it has nothing to do with, and only the copy inside the hover query outranks it. Tailwind got the pair for free by emitting `active:` after `hover:` in one sheet. Seven places in the app are the same collision: six controls whose press wash a hover was outranking, and a row that already carried the highlight for being yours and lost it to a hover. `lib/styles.ts` has the fixed pair as `press.wash`.

The same rule is what finally settles composition. `mb-2 mb-3` on one element left the winner to CSS source order. The later style in a `stylex.props` call wins, and the code says which one that is.

## What StyleX will not express

Each of these needed a different shape. StyleX's vocabulary is smaller than Tailwind's, which is not the same as broken.

- No child, sibling or parent selectors, and no `group`. `divide-y` became `borderTopWidth: { default: 1, ':first-child': 0 }` on the row itself. `space-y-*` became a flex parent with a `gap`. `group-hover:translate-x-0.5` on a chevron became a custom property the row sets on its own hover and the chevron reads.
- No compile-time alpha. `bg-brand/15` did that arithmetic in the build; a token here is a CSS variable whose value is not known until the browser resolves it, so `tint.brand15` is a `color-mix` the browser does instead. They are `defineConsts`, so the stylesheet carries one variable per colour rather than one per colour per opacity.
- No function calls and no runtime values inside `create`. Styles are static, which is the property the whole compiler rests on.
- A media query cannot be a top-level key. It nests inside the property, which reads oddly at first and then reads better: every state of one property is in one place.
- A media query's condition cannot be a variable either, because the browser parses it before it resolves anything. The breakpoints are `defineConsts` and inline.
- There is no preflight. Tailwind's is written out by hand in `globals.css`, cut to the elements this app renders, and every style object in the app is written on top of it.
- The eslint plugin's `valid-styles` does not know `WebkitBackdropFilter`, which every glass surface needs because Safari 17 and earlier only frost behind the prefix. It is allowed by a `propLimits` entry that says why. `sort-keys` is deliberately off: these objects read best grouped by what they are doing.

## Mobile and desktop

The breakpoints are Tailwind's, to the pixel, because every responsive decision in the app was already written against them. What the port changed is that a breakpoint is now a value with a name: `bp.sm`, `bp.lg`, and the three that are about the device rather than the width. Counted across the app: 12 `bp.sm`, 10 `bp.lg`, 49 `bp.hover`, and one each of `bp.fine`, `bp.coarse` and `bp.reducedMotion`, which matches what `main` carried as class prefixes.

`bp.hover` doing most of the work is the point. Every hover style in the app is nested inside `@media (hover: hover)` so that a tap does not leave a row looking hovered until something else is touched, which is what an unguarded `:hover` does on iOS. Under Tailwind that was a `hoverOnly` variant somebody had to remember; here it is the only spelling of hover in the codebase.

The suite is `pnpm test:e2e`, which runs every journey at a phone viewport and then again at a desktop one against the same seeded database.

## Whether to keep it

Worth keeping, and the question is no longer close.

What it actually bought:

- A quarter off the stylesheet, and a stronger guarantee behind it: a style nothing imports ships in no stylesheet, where a dead `.glass` rule sat in the CSS forever waiting for somebody to notice.
- Tokens that typecheck. `text-inn` was a string that silently did nothing; `colors.inn` does not compile.
- Repetition that costs something. Under Tailwind a repeated class string was free, so it repeated. Making it a style object to import turned four copies of a search field into `SearchInput`, two card shapes into `LinkCard` and `NavCard`, the focus ring into one export, and the press wash into `press.wash`.
- Seven hover and press collisions found and fixed. The ones the port introduced itself were caught by an end-to-end run rather than by somebody holding a phone.

What it costs, against the Tailwind build it replaced: three seconds of build time, 61 kB of static JavaScript across every route, and a vocabulary smaller than Tailwind's in the specific ways listed above.

The first round of this file said the thing that would change the answer is whether StyleX's compiler becomes usable from SWC inside Next. It has, by way of somebody outside Meta writing the transform again in Rust, and that is where the whole of this round's improvement came from. The honest caveat is the same fact from the other side: the fast path through this build is maintained by one project that is not the one that maintains StyleX, and if the two ever stop tracking each other the app goes back to the Babel column, which is a 69 second build rather than a broken one. That is a bad day, not a rewrite, and the way to see it coming is written down under "Trusting a compiler that is not Meta's".

What is left unmeasured is the dev server. `next dev` runs webpack here, and both the Rust plugin and StyleX's PostCSS pass have a Turbopack path that nothing in this repo has tried. That is the next place to look, and it wants somebody with the app open in front of them rather than a build timer.
