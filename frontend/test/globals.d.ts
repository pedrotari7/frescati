/// <reference types="vitest/globals" />

/*
 * Types for the globals `globals: true` installs.
 *
 * `@types/jest` used to declare `describe`, `it` and `expect` for the whole
 * package, and it was auto-included because TypeScript pulls in every
 * `@types/*` package when no `types` field says otherwise. Vitest does not
 * publish under that scope, so nothing pulls its globals in and every `vi` in
 * a test file reads as an undeclared name.
 *
 * A reference here rather than a `types` field in `tsconfig.json`, which would
 * switch that auto-inclusion off for everything else at the same time and take
 * `@types/react` and `@types/node` down with it.
 *
 * It lives in `test/` rather than at `frontend/vitest.d.ts` because
 * `tsconfig.json` sets `baseUrl: "."`, which resolves a bare `import from
 * 'vitest'` against the package root first and finds the declaration file
 * instead of the package.
 *
 * `next build` does not typecheck test files and so never noticed this was
 * missing. `pnpm --filter frontend typecheck` does, which is why that script
 * exists.
 */
