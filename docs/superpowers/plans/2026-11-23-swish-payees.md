# Swish payees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A season pays its season fee and its extras' fees to two payees. Each payee is an admin, whose private Swish number a function keeps published on the season, or a custom number.

**Architecture:**

- `shared/finances.ts` holds the pure decisions: which number a charge pays to, and how one person's charges split into payments.
- Admin numbers live at `users/{uid}/private/payment`, owner-only under `firestore.rules`.
- `backend/src/payees.ts` copies a picked admin's number onto the seasons that name them, on both a payment write and a season write.
- A `listPayees` callable gives the settings picker names, never digits.

**Tech Stack:** Next.js 15 App Router, StyleX, Firestore and Cloud Functions v2, Vitest, the Firestore emulator rules suite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-swish-payees-design.md`

## Global Constraints

- **`AGENTS.md` applies.** That means StyleX tokens only, arrow components with a default export, `import type`, and Prettier with tabs and printWidth 120.
- **Prose.** Run `unslop` over all prose before committing. No em dashes, and use straight quotes.
- **Types, exactly:**
    - `Payee = { uid?: string; swish?: string }`
    - `SeasonFees.payees?: { entry?: Payee; extras?: Payee }`
    - `fees.swish` stays as the legacy fallback
    - private doc `users/{uid}/private/payment` = `{ swish: string, updatedAt: string }`
- **Pots.** `entry` charges pay to `payees.entry`. `game` and `late` charges pay to `payees.extras`.
- **Fallback.** A pot falls back to `fees.swish` only when it has no payee at all. A pot naming an admin with no saved number resolves to `undefined`.
- **Client writes.** A client may write a payee as `{ uid }` or as `{ swish }`, never both. Every `swish` is a string of at most 20 characters.
- **`listPayees` never returns digits.**
- **The commit gate** runs lint, format, typecheck, unit tests, build and `fallow` over the whole repo. Use `scripts/bin/fallow`. Export a symbol only in the task that first imports it, because test imports count as uses.
- **Emulator ports.** Port 8080 is taken on this machine. Run the rules and backend suites with the alternate-port emulator config the controller provides. `pnpm test:e2e` cannot run locally.
- **Rules changes** go to a general-purpose agent that loads `firebase:firestore-rules-creation`.

## Review Focus

1. **An admin picked for a pot deletes their number.** Payers see "ask an admin" for that pot, not the legacy `fees.swish`. Pinned in Tasks 1 and 3.
2. **The same admin is payee for both pots on several seasons and changes their number.** Every pot on every season follows. Pinned in Task 3.
3. **A legacy season with only `fees.swish` is saved through the new pickers.** Payees are written, `fees.swish` is untouched, and both pots still pay the old number. Pinned in Task 5.
4. **Someone owes only into one pot.** They see one code labelled for that pot, with no empty second code. Pinned in Tasks 1 and 6.
5. **A client tries to write `{ uid, swish }` to point an admin's name at a different number.** Refused. Pinned in Task 2.

---

### Task 1: Shared payee decisions

**Files:**

- Modify: `shared/types.ts`: add `Payee`, and add `payees` to `SeasonFees`
- Modify: `shared/finances.ts`, `shared/finances.test.ts`

**Interfaces:**

- Produces:
    - `payeeFor(fees: Pick<SeasonFees, 'swish' | 'payees'>, kind: DueKind): string | undefined`
    - `interface Payment { swish: string | undefined; pots: ('entry' | 'extras')[]; amount: number }`
    - `splitByPayee(dues: Pick<Due, 'kind' | 'amount' | 'status'>[], fees): Payment[]`. It counts only `owing` dues. It groups by resolved number and merges pots that share one. A pot that resolves to `undefined` is its own group with `swish: undefined`. Order is entry first, then extras.

- [ ] **Step 1: Write the failing tests.**
    - legacy only: both kinds give `fees.swish`
    - `payees.entry = { uid: 'a', swish: '0701' }`: entry gives `'0701'`, game gives `fees.swish`
    - `payees.extras = { uid: 'b' }` with no swish and `fees.swish = '0709'`: game and late give `undefined`
    - `splitByPayee`, different numbers: entry 500 and game 70 owing make two payments, with amounts 500 and 70
    - `splitByPayee`, same number: one payment of 570, with `pots: ['entry', 'extras']`
    - `splitByPayee`, paid dues are ignored
    - `splitByPayee`, only game dues: one payment
- [ ] **Step 2: Run `pnpm test -- finances`.** Expected: FAIL.
- [ ] **Step 3: Implement both functions.** Export only what the tests import.
- [ ] **Step 4: Run `pnpm test` and `pnpm typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** "A charge knows which Swish number it is paid to".

### Task 2: Rules

**Files:** `firestore.rules`, `rules/firestore.test.ts`

**Requirements:**

1. **`match /users/{uid}/private/payment`.**
    - Read: `isSelf(uid) || isAppAdmin()`.
    - Create, update and delete: `isSelf(uid)`.
    - Shape: `hasOnly(['swish','updatedAt'])`, `swish is string && size() <= 20`, and `updatedAt is string && size() <= 40`.
    - No other document under `private/` is allowed.
2. **`feesShapeOk`.** It allows `payees`. `payees` is a map with `hasOnly(['entry','extras'])`. Each pot satisfies `payeeShapeOk(p)`: `hasOnly(['uid','swish'])`, `uid` a string of at most 128 characters, `swish` a string of at most 20.
3. **No client-written number for an admin payee.** On season create and update, a client may not write a pot that has both `uid` and `swish`, unless that pot is unchanged from `resource.data`. Unchanged covers a function-written pot surviving an unrelated settings save.

- [ ] **Step 1: Write the failing tests, one `it` per requirement.**
    - Include: a plain season update on a season whose `entry` pot is `{ uid, swish }` written by admin. Pass by seeding it via `withSecurityRulesDisabled`, then make an unrelated update. Expected: passes.
    - Include: a client changing an `{ uid, swish }` pot's `swish`. Expected: refused.
- [ ] **Step 2: Run the rules suite.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement the rules.**
- [ ] **Step 4: Run the rules suite.** Expected: all PASS.
- [ ] **Step 5: Commit** "Rules for private Swish numbers and season payees".

### Task 3: Keeping the published number in sync

**Files:**

- Create: `backend/src/payees.ts`, `backend/tests/payees.test.ts`
- Modify: `backend/src/onSeasonWrite.ts`, `backend/src/index.ts`, `backend/tests/index.test.ts`
- Modify: `firestore.indexes.json`, only if the emulator asks for the indexes

**Interfaces:**

- Produces:
    - `onPaymentWrite`, an `onDocumentWritten` trigger on `users/{uid}/private/payment`.
    - `syncSeasonPayees(seasonId: string, season: Season): Promise<void>`, called from `onSeasonWrite` inside its own try/catch with `reportError`, so it cannot block the recount.

- [ ] **Step 1: Write the failing tests.**
    - Admin `a` saves `0701`. Two seasons each name `a`, one in `entry` and one in both pots. Every such pot now has `swish: '0701'`.
    - Deleting `a`'s doc removes `swish` from those pots and leaves `uid`.
    - A season written with `entry: { uid: 'a' }` gets `swish` filled in from `a`'s doc.
    - A custom pot `{ swish: '0705' }` is never touched.
    - A pot already in sync causes no write. Assert the season's `updateTime` is unchanged.
    - When the sync throws, the roster recount in the same `onSeasonWrite` still happens.
- [ ] **Step 2: Run the backend suite with a `payees` filter.** Expected: FAIL.
- [ ] **Step 3: Implement it.** Query `seasons` where `fees.payees.entry.uid == uid`, and separately where `fees.payees.extras.uid == uid`. Write with dotted field paths (`fees.payees.entry.swish`) and `FieldValue.delete()`.
- [ ] **Step 4: Run the whole backend suite.** Expected: PASS.
- [ ] **Step 5: Commit** "A season shows its payee's current Swish number".

### Task 4: `listPayees` and the admin's own number

**Files:**

- Create: `backend/src/listPayees.ts` and its test
- Modify: `backend/src/index.ts`, `backend/tests/index.test.ts`
- Create: `frontend/lib/db/payment.ts` and its test
- Create: `frontend/components/SwishNumberField.tsx` and its test
- Modify: `frontend/app/(app)/me/page.tsx`

**Interfaces:**

- Produces:
    - Callable `listPayees(): { payees: { uid: string; displayName: string; hasNumber: boolean }[] }`, sorted by name. It covers every app admin, using `getAppAdminUids`, and every uid in any season's `adminUids`. The caller must hold the app-admin claim or appear in some season's `adminUids`. Anyone else gets `permission-denied`.
    - `subscribeToMyPayment(uid, onData: (swish: string | null) => void, onError): Unsubscribe`
    - `saveMyPayment(uid, swish: string): Promise<void>`
    - `clearMyPayment(uid): Promise<void>`
    - `useMyPayment(uid): string | null`, in `frontend/hooks/useData.ts`
    - `listPayees()` client wrapper in `frontend/lib/db/payment.ts`

- [ ] **Step 1: Write the failing tests.**
    - `listPayees` returns no field containing digits. Assert that every returned object's keys are exactly `['displayName','hasNumber','uid']`.
    - `hasNumber` reflects the private doc.
    - A caller who isn't an admin is refused.
    - `SwishNumberField` saves a trimmed value, and clearing it calls `clearMyPayment`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.** On `/me`, render `SwishNumberField` only when the user is an app admin or appears in any season's `adminUids` (from `useSeasons`). The copy says the number is shown only to people paying a season that sends money to them.
- [ ] **Step 4: Run the frontend and backend suites.** Expected: PASS.
- [ ] **Step 5: Commit** "Admins keep a Swish number, and the picker can list them".

### Task 5: Picking payees in season settings

**Files:**

- Modify: `frontend/lib/seasonForm.ts` and its test
- Create: `frontend/components/PayeePicker.tsx` and its test
- Modify: `frontend/app/(app)/s/[seasonId]/admin/page.tsx` (Money section)
- Modify: `frontend/components/CopiedSettingsSummary.tsx` and its test

**Interfaces:**

- Consumes: `listPayees()`, `Payee`
- Produces:
    - `SeasonForm` replaces `swish: string` with `entryPayee: PayeeChoice` and `extrasPayee: PayeeChoice`, where `PayeeChoice = { kind: 'admin'; uid: string } | { kind: 'custom'; swish: string }`.
    - `formFromSeason` reads `payees`, or opens a legacy season as `{ kind: 'custom', swish: fees.swish ?? '' }` for both.
    - `seasonUpdateFrom` writes `fees.payees.{pot}` as `{ uid }` or `{ swish }`, and omits a pot whose custom number is empty. It keeps `fees.swish` as it was.

- [ ] **Step 1: Write the failing tests.**
    - A legacy season form round-trips to `payees` with both pots `{ swish: legacy }` and `fees.swish` unchanged.
    - An admin choice writes `{ uid }` with no `swish`.
    - A pot that already holds `{ uid: 'a', swish: '0701' }` and is left on admin `a` saves as `{ uid: 'a', swish: '0701' }`, unchanged. This keeps the Task 2 rule satisfied. Re-picking a different admin writes `{ uid }` only.
    - `PayeePicker` lists names, marks "(no number saved)", and reveals the text field on "Custom number".
    - The summary reads "season fee to Anna, extras to Mateo".
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.** Use two pickers with the labels "Season fee paid to" and "Extras' fees paid to". They stack below `md`.
- [ ] **Step 4: Run the frontend suite and `pnpm typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** "Season settings pick who each fee is paid to".

### Task 6: Paying the right number

**Files:**

- Modify: `frontend/app/(app)/s/[seasonId]/finances/page.tsx` (`HowToPay`)
- Modify: `frontend/components/SeasonDebtNotice.tsx`
- Modify: `frontend/components/PaymentTriggers.tsx`
- Modify: `backend/src/confirmSeason.ts`
- Create: `frontend/components/PaymentCodes.tsx` and its test

**Interfaces:**

- Consumes: `splitByPayee`, `payeeFor`, `useMyPayment`
- Produces: `PaymentCodes({ dues, fees, reference, mySwish })`. It renders one block per `Payment`:
    - The heading is "Season fee", "Extras' fees", or "What you owe" when one block covers both pots.
    - The body is a `SwishPay`, or "ask an admin" when `swish` is undefined, or "This one is paid to you. Mark it paid in the book below." when `swish === mySwish`.

- [ ] **Step 1: Write the failing tests.**
    - Two numbers give two `SwishPay` with amounts 500 and 70.
    - A matching number gives one code of 570.
    - Only game dues give one code labelled "Extras' fees".
    - The viewer's own number gives no `SwishPay`, plus the "paid to you" line.
    - An entry pot with no number gives the ask-an-admin line for that pot, and the extras code still draws.
    - Backend: `seasonConfirmed` uses `payeeFor(fees, 'entry')`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.** Replace both `fees.swish` reads with `PaymentCodes`, and remove the old self-payment warning.
- [ ] **Step 4: Run the frontend and backend suites.** Expected: PASS.
- [ ] **Step 5: Commit** "Each fee is paid to its own number".

### Task 7: Seed, e2e and docs

**Files:**

- Modify: `backend/scripts/seed/scenarios.ts` and `write.ts`. Give one admin a saved number. Give one active season `entry` → that admin and `extras` → a custom number.
- Modify: `e2e/finances.spec.ts`. A member who owes both pots sees two codes, labelled "Season fee" and "Extras' fees".
- Modify: `docs/finances.md`, covering payees, the private number, the sync and the split.
- Modify: `AGENTS.md`, adding the data-model line `users/{uid}/private/payment`.
- Modify: `docs/season-signup.md`, noting that the confirm push names the season-fee payee.

- [ ] **Step 1: Seed.** Verify it against the alternate-port emulators.
- [ ] **Step 2: Write the e2e steps.** Read the components for the real labels. The suite cannot run locally, so CI is its first run.
- [ ] **Step 3: Write the docs.** Run `unslop`, then `pnpm format:check` and `scripts/bin/fallow audit`.
- [ ] **Step 4: Commit** "Swish payees are seeded, tested end to end and written down".
