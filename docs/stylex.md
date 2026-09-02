# StyleX

Part of Frescati's CLAUDE.md context. See the root `CLAUDE.md` for the app overview.

The frontend was Tailwind v4 and is now StyleX 0.19. This file is the evaluation that came with the port: what moved, what it cost, what it caught, and whether it was worth it. The measurements are `next build` on this branch against `main` on one laptop, warm install, no build cache either side.

## Where the styling lives now

- `frontend/app/tokens.stylex.ts` is the palette, the type stack, the shadows and the breakpoints. It replaces Tailwind's `@theme` block. The `.stylex.ts` suffix is load-bearing. Only a file carrying it may define variables, and StyleX hashes each variable's name off that file's path, which is what stops one token being declared twice under two names. Nothing but `defineVars` and `defineConsts` may be exported from it.
- `frontend/lib/styles.ts` is the shared shapes: the glass surfaces, the animations, the press wash, the focus ring, the tap target, the truncation. These were `@layer components` rules reached by name from a `className`, and they are now style objects you import.
- `frontend/app/globals.css` is 155 lines and holds three things: a hand-written base layer, the `@stylex;` line the compiled rules land on, and the handful of rules that belong to no element (the scrollbar, the iOS input zoom, the reduced-motion blanket).
- `frontend/babel.config.js` compiles the styles, `frontend/postcss.config.js` collects them into the one stylesheet, and `.browserslistrc` at the repo root says what to compile for.
- `frontend/test/stylex.ts` is how a jsdom test asks what an element is wearing.

Everything else is a `stylex.create` next to the component that uses it. There are 93 files with one in them.

## What it cost: Babel instead of SWC

StyleX compiles at build time and the only compiler it ships is a Babel plugin. Next sees a Babel config in the project and turns SWC off for the app's own source. That is the entire cost of the migration, and it is not small:

|                             | Tailwind and SWC | StyleX and Babel |
| --------------------------- | ---------------- | ---------------- |
| `next build`, wall          | 32.1s            | 1:02.9           |
| the compile step alone      | 17.5s            | 48s              |
| CSS served                  | 51,431 B         | 39,137 B         |
| First Load JS shared by all | 172 kB           | 179 kB           |
| all static JS emitted       | 3,119,999 B      | 3,448,197 B      |

So the stylesheet is a quarter smaller, the JavaScript is 4% larger on the shared bundle and 10% larger in total, and the build takes twice as long. The JS difference is Babel's output next to SWC's for the same browsers, plus the class name strings, which are now data in the bundle rather than names in the source.

The build time is the real bill. Nothing else in the repo pays it: `shared/` and the backend are compiled by tsc and never see Babel.

## The browserslist trap

The first honest measurement was much worse than the table above: 431 kB of shared JS and 4.85 MB in total, with a regenerator shim wrapped around every `await` in the app.

`next/babel` sets `@babel/preset-env`'s `targets` for the server and test builds and leaves it unset for the client, where preset-env falls back to asking browserslist. This repo had no browserslist config, so it compiled for nothing in particular, which means ES5. SWC never asked, because Next hands it `MODERN_BROWSERSLIST_TARGET` directly.

`.browserslistrc` is that same list written down, and it closes the gap: 1.4 MB of JavaScript that no measurement of StyleX should ever have been charged for. It lives at the repo root because which file a build picks up depends on which directory it started in, and `pnpm --filter frontend build`, a Vercel build and an editor plugin do not agree on that. Autoprefixer reads the same list, so the stylesheet is now prefixed for the browsers the JavaScript is built for.

Anyone comparing a Babel-compiled Next app against an SWC one should check this first.

## `flex-1` is not `flexBasis: 0`

The port's one real bug, and the shape of it is worth writing down because the translation looked exact.

Tailwind's `flex-1` is `flex: 1 1 0%`, and it was on 62 elements. Written out as properties that reads as `flexGrow: 1, flexBasis: 0`, which is what the port did in 48 places. Those are not the same declaration. A percentage flex basis against a container whose main size is indefinite falls back to the item's own content; a length of 0 is simply 0. Every horizontal case in the app is inside something with a definite width, so 47 of them behaved identically.

The one that did not was the dev user switcher: a dialog capped at `80dvh` but sized by its content, so its height is indefinite, so the scrolling list of accounts had no free space to grow into and rendered as nothing at all. Every end-to-end spec failed, all 30 of them, because signing in is the first thing each one does and the person to sign in as was a button with no height.

Jest never saw it and could not have: jsdom has no layout, so a test can read the class list back and confirm the property is set, and the property was set. `pnpm test:e2e` in a real browser is the only thing in this repo that could have caught it, and it caught it immediately.

## What it did to the tests

- `next/jest` installs the SWC transformer and SWC cannot run StyleX, so `jest.config.ts` replaces it with `babel-jest` pointed at the same `babel.config.js` the build uses. Without that every suite that renders anything dies on `Unexpected 'stylex.defineVars' call at runtime`.
- The coverage provider had to move from istanbul to V8. `babel-plugin-istanbul` does not compose with StyleX: an instrumented `stylex.keyframes` comes out of Babel uncompiled and throws on import, and an instrumented arrow inside `stylex.create` fails the build outright. V8 counts what the engine ran and maps it back through the source maps, so nothing is rewritten to be measured. The thresholds moved with it, upwards, which is a difference in counting rather than in testing.
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

Worth keeping, with the build time understood as the price.

What it actually bought:

- A quarter off the stylesheet, and a stronger guarantee behind it: a style nothing imports ships in no stylesheet, where a dead `.glass` rule sat in the CSS forever waiting for somebody to notice.
- Tokens that typecheck. `text-inn` was a string that silently did nothing; `colors.inn` does not compile.
- Repetition that costs something. Under Tailwind a repeated class string was free, so it repeated. Making it a style object to import turned four copies of a search field into `SearchInput`, two card shapes into `LinkCard` and `NavCard`, the focus ring into one export, and the press wash into `press.wash`.
- Seven hover and press collisions found and fixed. The ones the port introduced itself were caught by an end-to-end run rather than by somebody holding a phone.

What would change the answer is where the cost sits. Babel replaces SWC for every file in the app, so the whole frontend pays for a styling decision. If StyleX's compiler becomes usable from SWC inside Next, the case gets much stronger. If the frontend grows enough that a one-minute build turns into a five-minute one, the case gets weaker. Neither is true today.
