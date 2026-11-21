# Season sign-up and copying a season Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new season can be copied from an old one, opens in a `draft` sign-up phase that asks everybody whether they are joining, and an admin's confirm turns the yeses into the squad with entry fees raised and a push each.

**Architecture:** Pure decisions (dates, copying, the confirmation plan, notification copy) live in `shared/` with unit tests. Answers are documents at `seasons/{id}/signups/{uid}` written straight from the client under `firestore.rules`. Confirming is a callable, `confirmSeason`, that runs `planConfirmation` inside one transaction. The opening push fires from `onSeasonWrite`, and reminders come from a new scheduled function. A `quiet` flag on the season mutes all three senders.

**Tech Stack:** Next.js 15 App Router, StyleX, Firestore and Cloud Functions v2 (`nodejs24`, `europe-west1`), Vitest, the Firestore emulator rules suite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-season-signup-design.md`. Read it before any task. The plan argues from it and does not repeat its reasoning.

## Global Constraints

- **`AGENTS.md` applies throughout.** In particular:
    - StyleX tokens only, no hex values.
    - Arrow-function components with a default export.
    - `import type`.
    - Tabs, width 4, printWidth 120, single quotes.
    - Every screen below a tab has a `backHref` on every branch.
- **Run the `unslop` skill over every piece of prose before committing.** That covers UI copy, push text, JSDoc and test names. No em dashes, straight quotes, sentence case.
- **No placeholder documents.** A missing `signups/{uid}` means no answer.
- **Statuses:** the value stays `'draft'` and the label becomes `'Signing up'`.
- **The new fields on `Season`** are exactly: `copiedFrom?: string`, `signupClosesOn?: string` (civil `YYYY-MM-DD`), `confirmedAt?: string`, `confirmedBy?: string`, `quiet?: boolean`.
- **Signup document:** `{ status: 'yes' | 'no', answeredAt: string, updatedAt: string, answeredBy?: string }`.
- **The fee field is `fees.total`,** read through `feesFor(season)`. Shares come from `entryShare(total, count)` and ids from `dueId('entry', uid)`.
- **Reminders:** every 3 days at 18:00 `Europe/Stockholm`, gated by the `reminders` preference.
- **`seasonConfirmed` has no preference gate** (`null`), and neither does anything else the confirm sends. A quiet season sends nothing at all.
- **The commit gate** runs lint, format, typecheck, unit tests, build and `fallow` over the whole repo. Use `scripts/bin/fallow`, not `pnpm exec fallow`. No dead exports may be left between tasks: export a symbol in the task that first imports it.
- **Emulator ports.** 8080 may be taken by another app on this machine. See the memory note `emulator-ports-taken` before running the rules or backend suites.
- **Any change to `firestore.rules` is authored by the `firebase:firestore-rules-author` subagent,** per the session's tool rules. The task gives it the exact requirements and tests.

## Review Focus

1. **Two confirms at once, from two admins or a double tap.** One wins and the other gets `failed-precondition` and writes nothing. Pinned in Task 5.
2. **A player changes their answer while confirm is running.** Confirm reads the signups inside its transaction, so the squad matches the answers at commit. Pinned in Task 5 (signups read through `tx.get`).
3. **The close date has passed but the season is still a draft.** Answering is still allowed, since the close date only stops reminders. Pinned in Task 4 (rules) and Task 6 (no reminder after the date).
4. **A season with `fees.total` of 0 or no `fees`.** No dues are written and the push has no amount. Pinned in Tasks 2 and 5.
5. **An app admin who is not in `adminUids` and is not a member confirms.** They still need a `yes`, and they become a member. They are not added to `adminUids`, since the app badge already covers them. Pinned in Task 2.

---

### Task 1: Shared season copying, dates and the status label

**Files:**

- Modify: `shared/types.ts` (add the five fields to `Season`, add the `Signup` and `SignupStatus` types)
- Create: `shared/seasonCopy.ts`, `shared/seasonCopy.test.ts`
- Modify: `shared/format.ts:181` (`draft: 'Signing up'`) and its test, if one pins the label

**Interfaces:**

- Produces:
    - `type SignupStatus = 'yes' | 'no'`
    - `interface Signup { uid: string; status: SignupStatus; answeredAt: string; updatedAt: string; answeredBy?: string }`, where `uid` is the document id, as for `GameResponse`
    - `nextSeasonDates(source: Pick<Season, 'startDate' | 'endDate' | 'slot'>): { startDate: string; endDate: string }`
    - `copySeasonSettings(source: Season, creatorUid: string): CopiedSettings`, where `CopiedSettings = Pick<Season, 'venue' | 'slot' | 'minPlayers' | 'responseDeadlineHours' | 'reminderHours' | 'balance' | 'fees' | 'adminUids' | 'copiedFrom'>`. Keys whose source value is absent (`balance`, `fees`) are omitted rather than set to `undefined`, because Firestore rejects `undefined`.

- [ ] **Step 1: Write failing tests in `shared/seasonCopy.test.ts`**
    - `nextSeasonDates` with source `2026-08-18..2026-12-15` and a Tuesday slot gives `startDate: '2026-12-22'` and `endDate: '2027-04-20'`. The end is start plus the old length in days (119).
    - When the old end date is itself the slot weekday, the new start is the _following_ one, 7 days later and never the same day.
    - `copySeasonSettings` sets `copiedFrom` to the source id.
    - It puts the creator at the front of `adminUids` with no duplicate when they're already there.
    - It omits `fees` and `balance` keys when the source lacks them (`expect('fees' in result).toBe(false)`).
    - It never carries `name`, `startDate`, `endDate`, `memberUids`, `status`, `quiet`, `signupClosesOn` or `confirmed*`.
- [ ] **Step 2: Run `pnpm test -- seasonCopy`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement both functions in `shared/seasonCopy.ts`.** Do the date arithmetic on civil dates in UTC, the way `shared/schedule.ts` already walks days. Add the types to `shared/types.ts`, change the label, and update the JSDoc on `SeasonStatus` to say what `draft` now means.
- [ ] **Step 4: Run `pnpm test`.** Expected: PASS. Run `pnpm typecheck`, expected clean.
- [ ] **Step 5: Commit:** "Seasons can be copied, and a draft is a season signing up"

### Task 2: The confirmation plan

**Files:**

- Create: `shared/signup.ts`, `shared/signup.test.ts`

**Interfaces:**

- Consumes: `Signup`, `KitItem`, `Season`, `PlannedDue`, `entryShare`, `feesFor`, `dueId`
- Produces:
    - `interface ConfirmationPlan { memberUids: string[]; adminUids: string[]; demotedAdminUids: string[]; dues: PlannedDue[]; share: number; kit: Omit<KitItem, 'id' | 'updatedAt'>[] }`
    - `planConfirmation(signups: Signup[], season: Pick<Season, 'adminUids' | 'fees'>, sourceKit: KitItem[], confirmerUid: string): ConfirmationPlan`
    - `signupShare(season: Pick<Season, 'fees'>, yesCount: number): number`, for the card and the admin view
    - `signupReminderDue(season: Pick<Season, 'status' | 'quiet' | 'signupClosesOn' | 'createdAt' | 'slot'>, now: Date): boolean`. True only for a non-quiet draft whose close date (if any) is today or later in the season's timezone, and only on every third civil day counted from `createdAt`'s civil date.

- [ ] **Step 1: Write failing tests in `shared/signup.test.ts`**
    - Members are exactly the `yes` uids, sorted. `no` answers are ignored.
    - `adminUids` is the old admins filtered to members. `demotedAdminUids` is the rest.
    - The confirmer is not added to `adminUids` when they weren't an admin (an app admin).
    - With `fees.total: 31240` and 18 yeses, `share` is `1736` and there are 18 dues with `id: 'entry_{uid}'`, `kind: 'entry'` and `amount: 1736`.
    - With `fees.total: 0`, or `fees` absent, there are zero dues and `share` is `0`.
    - Kit held by a member keeps its `holderUid`. Kit held by a non-member moves to `confirmerUid`. `updatedBy` is always `confirmerUid`. `name` and `kind` are copied as they are.
    - `signupShare(season, 0)` is `0` rather than a division by zero.
    - `signupReminderDue`:
        - false for an `active` season
        - false for `quiet: true`
        - false the day after `signupClosesOn`
        - true on day 3 and day 6 after creation at any hour
        - false on days 1, 2, 4 and 5
- [ ] **Step 2: Run `pnpm test -- signup`.** Expected: FAIL.
- [ ] **Step 3: Implement `shared/signup.ts`.** The confirmer's own `yes` is the caller's check (Task 5), not this function's. Keep the plan total.
- [ ] **Step 4: Run `pnpm test`.** Expected: PASS.
- [ ] **Step 5: Commit:** "The confirm is planned in shared, where it can be tested"

### Task 3: Notification kinds and copy

**Files:**

- Modify: `shared/notifications.ts` (add `signupOpen | signupReminder | seasonConfirmed` to `SeasonNotification` and to `SEASON_NOTIFICATIONS`, and add `NOTIFICATION_PREF` entries `reminders`, `reminders` and `null`)
- Modify: `shared/notifications.test.ts`
- Modify: `backend/src/lib/push.ts` (senders)

**Interfaces:**

- Produces:
    - `interface SignupContext { seasonId: string; seasonName: string; closesOn?: string /* already formatted */ }`
    - `buildSignupPush(kind: 'signupOpen' | 'signupReminder', context: SignupContext): PushPayload`. It goes to `/s/{seasonId}` with tag `signup-{seasonId}` and `respondable: false`.
    - `interface SeasonConfirmedContext { seasonId: string; seasonName: string; share: number; swish?: string; blocked: boolean }`
    - `buildSeasonConfirmedPush(context: SeasonConfirmedContext): PushPayload`. It goes to `/s/{seasonId}/finances` when `share > 0` and to `/s/{seasonId}` otherwise, with tag `season-confirmed-{seasonId}`.
    - In `push.ts`: `sendSignupPush(uids: string[], kind, context): Promise<SendResult>` and `sendSeasonConfirmed(uid: string, context): Promise<SendResult>`, both through `sendPush` with `NOTIFICATION_PREF[kind]`.

- [ ] **Step 1: Write failing tests.**
    - `buildSeasonConfirmedPush({ share: 1736, swish: '0701234567', blocked: true, ... })` has a title containing `formatSek(1736)` and a body naming the Swish number and saying In opens once it is paid.
    - With `share: 0`, nothing in the title or body matches `/kr/`.
    - With `blocked: false` (an admin), the body does not say they are locked out.
    - `buildSignupPush('signupReminder', { closesOn: '1 Dec' })` contains `1 Dec`.
    - `NOTIFICATION_PREF.seasonConfirmed` is `null` and `NOTIFICATION_PREF.signupOpen` is `'reminders'`.
- [ ] **Step 2: Run `pnpm test -- notifications`.** Expected: FAIL.
- [ ] **Step 3: Implement the builders and senders.** Wording: start from the spec's examples and run `unslop`. Use `formatSwish` from `shared/swish.ts` if it exists, or the local form otherwise.
- [ ] **Step 4: Run `pnpm test` and `pnpm --filter backend build`.** Expected: PASS and clean. `fallow` will flag the senders as unused until Task 5. Either fold this task's commit into Task 5, or add the senders in Task 5 instead. Pick the first.
- [ ] **Step 5: No separate commit.** It is committed with Task 5.

### Task 4: Firestore rules

**Executor:** dispatch `firebase:firestore-rules-author` with this task's text, the spec's "Rules to watch" and "The answer document" sections, and `rules/firestore.test.ts` as the place for tests.

**Files:**

- Modify: `firestore.rules`, `rules/firestore.test.ts`, and `rules/clientWrites.test.ts` if it lists client writes

**Requirements:**

1. **Allowlist.** `seasonShapeOk()` allows `copiedFrom`, `signupClosesOn`, `confirmedAt`, `confirmedBy` and `quiet`. String sizes are bounded (`copiedFrom` ≤ 128, `signupClosesOn` ≤ 10, `confirmed*` ≤ 128) and `quiet is bool`.
2. **Season create.** `isAppAdmin() || (request.resource.data.copiedFrom is string && isSeasonAdmin(request.resource.data.copiedFrom))`, plus the existing "creator in `adminUids`". Also, `status == 'draft'` and `memberUids.size() == 0` on every create.
3. **Season update, status.**
    - draft stays draft: if `resource.data.status == 'draft'`, then `request.resource.data.status == 'draft'`
    - non-draft never becomes draft: if `resource.data.status != 'draft'`, then `request.resource.data.status != 'draft'`
4. **Season update, members on a draft.** `memberUids` is unchanged while `resource.data.status == 'draft'`. `confirmedAt` and `confirmedBy` are never client-writable.
5. **`match /signups/{uid}`.**
    - Any signed-in user can read.
    - The user can create, update or delete their own document, with no `answeredBy`.
    - A season admin can create, update or delete anybody's, with `answeredBy == request.auth.uid`.
    - Every write requires the season to be `draft`.
    - Shape: `hasOnly(['status','answeredAt','updatedAt','answeredBy'])` and `status in ['yes','no']`, with timestamps as strings of 40 characters or fewer.
6. **Responses.** Every response write, on both the player's path and the admin's `allow write` path, is refused while the parent season is `draft`.

- [ ] **Step 1: Write failing rules tests, one `it` per numbered requirement.**
    - Include the case that a write succeeds after `signupClosesOn` has passed while the season is still a draft.
    - Include the case that a season admin of `copiedFrom` who isn't an app admin can create.
    - Include the case that a plain season update on a season carrying all five new fields still passes.
- [ ] **Step 2: Run `pnpm test:rules`.** Expected: the new tests FAIL and the old ones pass.
- [ ] **Step 3: Change `firestore.rules`.**
- [ ] **Step 4: Run `pnpm test:rules`.** Expected: all PASS.
- [ ] **Step 5: Commit:** "Rules for a season that is still signing up"

### Task 5: `confirmSeason`

**Files:**

- Create: `backend/src/confirmSeason.ts`, `backend/tests/confirmSeason.test.ts`
- Modify: `backend/src/index.ts` (export), `backend/tests/index.test.ts` if it lists exports, and the Task 3 files

**Interfaces:**

- Consumes: `planConfirmation`, `sendSeasonConfirmed`, `requireAuth`, `isSeasonAdmin` (`backend/src/lib/auth.ts`), `hasAppAdminClaim`, `isBlockedBy` (`backend/src/lib/dues.ts`)
- Produces: `onCall<{ seasonId?: string }>` named `confirmSeason`, returning `{ members: number; share: number; demoted: string[] }`

- [ ] **Step 1: Write failing tests** in the style of `backend/tests/getGameWatchers.test.ts`. Seed a draft season with signups `a: yes`, `b: yes`, `c: no`, admins `[a, d]` and `fees.total: 1000`. Then:
    - Called by `a`: the season becomes `active` with `memberUids: ['a', 'b']`, `adminUids: ['a']`, and `confirmedBy: 'a'`. Dues `entry_a` and `entry_b` are 500 each and owing. The return is `demoted: ['d']`.
    - Called a second time: `failed-precondition`, and no further writes.
    - Called by `d`, who has no yes: `failed-precondition`.
    - Called by a non-admin: `permission-denied`.
    - Called by an app-admin claim holder with a yes who isn't in `adminUids`: succeeds.
    - `fees` absent: no dues collection writes.
    - With `copiedFrom` pointing at a season holding kit `{ holderUid: 'b' }` and `{ holderUid: 'z' }`: the new kit has holders `b` and `a`.
    - A quiet season: `sendSeasonConfirmed` is never called. Spy or mock it the way `push.test.ts` does.
    - Two concurrent calls: exactly one resolves.
- [ ] **Step 2: Run `pnpm test:backend -- confirmSeason`.** Expected: FAIL.
- [ ] **Step 3: Implement it.**
    - In a `db.runTransaction`, read the season, signups and source kit with `tx.get`, check the status is `draft` and that the caller has a yes, then run `planConfirmation`.
    - Write the season update, the dues (`createdAt` now, `status: 'owing'`) and the kit documents (`updatedAt` now, auto ids).
    - After the commit, unless `quiet`, send `sendSeasonConfirmed` to each member in parallel, with `blocked: isBlockedBy(season, uid, profile)` from `getProfiles`.
    - Report a failed send with `reportError` and swallow it, the same way `tellThem` in `lib/dues.ts` does.
    - The function does not send `dueRaised`.
- [ ] **Step 4: Run `pnpm test:backend` and `pnpm test`.** Expected: PASS.
- [ ] **Step 5: Commit:** "Confirming a season turns the yeses into the squad"

### Task 6: Announcing and reminding

**Files:**

- Modify: `backend/src/onSeasonWrite.ts`
- Create: `backend/src/sendSignupReminders.ts`, `backend/tests/signupNotifications.test.ts`
- Modify: `backend/src/index.ts`, `backend/src/lib/data.ts` (add `getAllUserUids(): Promise<string[]>` if no equivalent exists)
- Modify: any of `onResponseWrite`'s at-risk path, kit coverage or `calendarFeed.ts` that would act on a draft. Responses are already refused on a draft (Task 4), so at-risk most likely needs nothing. Check each and add a `status === 'draft'` early return only where a draft gets through.

**Interfaces:**

- Consumes: `sendSignupPush`, `signupReminderDue`, `formatGameDate` or whatever civil-date formatter `shared/format.ts` has
- Produces: `onSchedule` `sendSignupReminders` at `0 18 * * *` in `Europe/Stockholm`. It runs daily and lets `signupReminderDue` decide.

- [ ] **Step 1: Write failing tests.**
    - Creating a draft with `quiet` unset sends `signupOpen` to every user uid.
    - Creating one with `quiet: true` sends nothing.
    - Updating a draft from `quiet: true` to `false` sends `signupOpen` once. `false` to `false` sends nothing.
    - On an active season, quiet changes send nothing.
    - The reminder run on a due day sends `signupReminder` only to users with no signup document.
    - It sends nothing when the season is quiet, active or past `signupClosesOn`.
- [ ] **Step 2: Run `pnpm test:backend -- signupNotifications`.** Expected: FAIL.
- [ ] **Step 3: Implement it.** In `onSeasonWrite`, handle the announce branch _before_ the existing `if (!before || !after) return`, because a create has no `before`. Leave the recount path untouched.
- [ ] **Step 4: Run `pnpm test:backend`.** Expected: PASS, including the existing `onSeasonWrite` tests.
- [ ] **Step 5: Commit:** "A new season asks everybody, and reminds whoever has not answered"

### Task 7: Client data layer

**Files:**

- Modify: `frontend/lib/db/paths.ts` (`signupsCol(seasonId)`, `signupDoc(seasonId, uid)`)
- Create: `frontend/lib/db/signups.ts`, `frontend/lib/db/signups.test.ts`
- Modify: `frontend/lib/db/seasons.ts` (`createSeason` stays as it is. Its callers change in Task 8.)

**Interfaces:**

- Produces:
    - `subscribeToSignups(seasonId: string, onData: (signups: Signup[]) => void, onError: (e: Error) => void): Unsubscribe`
    - `setSignup(seasonId: string, uid: string, status: SignupStatus, answeredBy?: string): Promise<void>`. It writes `answeredAt` only on create, so the first answer's time survives a change. Use a transaction or `setDoc` with merge plus a read.
    - `clearSignup(seasonId: string, uid: string): Promise<void>`
    - `confirmSeason(seasonId: string): Promise<{ members: number; share: number; demoted: string[] }>` via `callFunction`
    - `useDraftSeasons(): Season[]`, a hook returning every `status == 'draft'` season, newest `createdAt` first, built on `subscribeToSeasons`. Put it wherever the existing seasons hooks live.

- [ ] **Step 1: Write failing tests in `signups.test.ts`**, mocking Firestore the way `responses.test.ts` does.
    - `setSignup` with `answeredBy` includes it, and without it omits the key.
    - A second `setSignup` keeps the first `answeredAt`.
- [ ] **Step 2: Run `pnpm --filter frontend test -- signups`.** Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: No separate commit.** Commit with Task 8, the first consumer, so `fallow` sees no unused exports.

### Task 8: New season page

**Files:**

- Modify: `frontend/app/(app)/seasons/new/page.tsx`
- Create: `frontend/components/CopiedSettingsSummary.tsx` and its test
- Modify: `frontend/components/AppAdminOnly.tsx` only if the gate needs a new prop

**Behaviour (from the spec, "Copying a season"):**

- `?from={id}` preselects the source. Otherwise the newest season is preselected.
- The dropdown lists every season for an app admin, plus "Start blank". A season admin sees only the seasons in whose `adminUids` they appear, with no blank option.
- Anybody else gets the existing `AppAdminOnly` refusal. Its message now says a season's admins can also start the next one.
- Picking a source refills venue, slot, `minPlayers` and dates (`nextSeasonDates`) and clears the name.
- New fields:
    - "Sign-up closes" date, optional, using the existing `DatePicker`
    - "Don't notify anyone" switch, off by default
- `CopiedSettingsSummary` renders one line from `CopiedSettings` (fees total, per game, deadline, reminders, "team balance" when set, and the count of other admins). It renders nothing for a blank start.
- The create write uses `status: 'draft'`, `memberUids: []`, `...copySeasonSettings(source, uid)` and the edited basics, plus `quiet: true` only when the switch is on and `signupClosesOn` only when it is set. Afterwards it does `router.replace('/s/{id}/admin')`.

- [ ] **Step 1: Write failing component tests.**
    - The summary text for a source with `fees: { total: 31240, perGame: 100 }` and two other admins contains `31 240 kr` and `2 other admins`.
    - The page with `?from=X` and a season-admin user shows X selected and no "Start blank".
    - Submitting calls `createSeason` with `status: 'draft'`, `memberUids: []` and `copiedFrom: X`.
- [ ] **Step 2: Run the frontend tests.** Expected: FAIL.
- [ ] **Step 3: Implement it.** Check the form at phone width first.
- [ ] **Step 4: Run `pnpm --filter frontend test` and `pnpm typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** (with Task 7): "A new season starts from the last one and opens for sign-up"

### Task 9: Admin page for a draft

**Files:**

- Modify: `frontend/app/(app)/s/[seasonId]/admin/page.tsx`
- Modify: `frontend/lib/seasonForm.ts` and its test (carry `quiet` and `signupClosesOn`)
- Create: `frontend/components/SignupAdmin.tsx` and its test, `frontend/components/ConfirmSeasonSheet.tsx` and its test

**Behaviour:**

- **Status field.** Hidden on a draft. On an active or archived season, the options are only `active` and `archived`.
- **Quiet and close date.** On a draft, the settings form shows the quiet switch and the close date.
- **Start next season.** On a non-draft season the page shows a "Start next season" link to `/seasons/new?from={id}`, for its admins.
- **`SignupAdmin`.** On a draft, it shows three groups (Joining, Not joining, No answer) over every user from the existing profiles subscription. The head shows the yes count and `signupShare`. Each row has an answer-for-them control that calls `setSignup(..., adminUid)`, or `clearSignup` to reset.
- **The Confirm button** is disabled with a reason line until the viewing admin has a `yes`.
- **`ConfirmSeasonSheet`** (built on the existing `Sheet` and `ConfirmDialog` patterns) repeats the count and the share, and names the admins who would be demoted (those in `adminUids` without a yes). It calls `confirmSeason` and shows a toast with the result.

- [ ] **Step 1: Write failing tests.**
    - The status options for an active season are `['active', 'archived']`.
    - `SignupAdmin` with signups `a: yes` and `b: no` and users `a`, `b`, `c` puts each user in the right group.
    - The confirm button is disabled when the viewer has no yes.
    - The sheet lists `d` as demoted when `adminUids` is `[a, d]` and only `a` said yes.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** "Admins see who is joining and confirm the season"

### Task 10: The question, for players

**Files:**

- Create: `frontend/components/SignupCard.tsx` and its test
- Modify: `frontend/app/(app)/s/[seasonId]/page.tsx` (the card above the content on every season home, and the draft branch of this page)
- Modify: `frontend/components/RespondControl.tsx` or `GameRow.tsx`, whichever draws In/Out, to show a "Answers open once the season is confirmed" line instead of the buttons when `season.status === 'draft'`

**Behaviour:**

- `SignupCard({ season, signup, yesCount, uid })`:
    - **Unanswered:** the full card (name, slot, venue, dates, "about {share} kr so far" when the fee is set, Join and Not this time).
    - **Answered:** one line, "You're in" or "You said not this time", with a Change control that opens the two buttons again.
- It appears for each draft from `useDraftSeasons()`, newest first, at the top of whatever season home the viewer is on, including the draft's own page.
- **The draft season's page** shows the card, then "Who's joining" (the yes list), then the games, read-only.

- [ ] **Step 1: Write failing tests.**
    - Unanswered, it shows both buttons. Pressing Join calls `setSignup(seasonId, uid, 'yes')`.
    - Answered `no`, it shows the one-line state. Change shows both buttons.
    - With `fees.total: 1000` and 3 yeses it shows `334`. With no fees there is no `kr`.
    - On a draft, the In/Out control renders the line and no buttons.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.** Check it at 375 px and on desktop. `backHref` is unchanged, since the season home is a tab root.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** "Everybody is asked whether they are joining the next season"

### Task 11: Seed and end to end

**Files:**

- Modify: `backend/scripts/seed/scenarios.ts` (a quiet draft season with a mix of answers, and a completed source season reserved for the e2e spec)
- Modify: `e2e/locators.ts` (the signup card and the confirm button, if they are shared) and `e2e/fixtures.ts` if a new cast member is needed
- Create: `e2e/signup.spec.ts`

- [ ] **Step 1: Seed the scenario.** Keep the seeder deriving shares through `signupShare` rather than writing a number.
- [ ] **Step 2: Write `e2e/signup.spec.ts`.**
    - An admin opens `/seasons/new?from={reserved source}`, turns quiet on, names the season and creates it.
    - Player A presses Join on the home card and player B presses Not this time.
    - The admin presses Join, then confirms.
    - Player A sees the season as a member, with an owing entry fee and a held In.
    - Click people by name, not by row position (see `AGENTS.md`).
- [ ] **Step 3: Run `pnpm test:e2e --project=mobile`,** after checking that port 3000 and the emulator ports are free. Expected: PASS. Then run the full `pnpm test:e2e`.
- [ ] **Step 4: Commit:** "The sign-up journey is seeded and tested end to end"

### Task 12: Docs

**Files:**

- Create: `docs/season-signup.md`
- Modify: `AGENTS.md` (a data-model line for `signups`, plus a "Feature docs" entry), `docs/notifications.md` (the three kinds and quiet), `docs/finances.md` (entry dues are raised at confirm), `README.md` if it describes creating a season

- [ ] **Step 1: Write `docs/season-signup.md`.** Cover the lifecycle, why confirm is a function, what quiet does and doesn't cover, and the admin-must-be-a-member rule. Run `unslop`.
- [ ] **Step 2: Run `pnpm format:check` and `scripts/bin/fallow audit`.** Expected: clean.
- [ ] **Step 3: Commit:** "Season sign-up is written down"
