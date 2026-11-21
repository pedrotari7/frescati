# Season sign-up and copying a season

## Why

Starting a season today means filling in the whole form again and then adding every member by hand on the squad screen. Two changes fix that:

1. **Copy a previous season's settings** so the form arrives filled in.
2. **A sign-up phase.** A new season opens by asking everybody whether they are joining. An admin confirms it, and confirming makes everybody who said yes a member. Nobody gets added by hand.

A "no" is recorded too, so an admin can tell somebody who declined from somebody who has not answered.

## Goals

- A new season can be created from an old one in a couple of taps: pick it, set a name, check the dates, create.
- Everybody in the app is asked, in the app and by push, and reminded until they answer or the sign-up closes.
- Confirming turns the yeses into the squad, raises their entry fees and tells each of them their share.
- A season can be created quiet, so the whole flow can be tried on the live app without messaging anybody.

## Non-goals

- No cap on the squad and no admin selection. A yes is a firm commitment and every yes becomes a member.
- No automatic confirmation. The "answer by" date stops the reminders. It does not confirm anything.
- No reopening. Once confirmed, the season is `active` and there is no way back to sign-up.
- A "no" changes nothing else. A decliner is not a member, can still play as an extra game by game, and still gets every notification they would have got anyway.

## Anti-goals

- Charging somebody who never said yes. Only a stored `yes` answer becomes a member.
- A confirm that half-happens, with members written but the status still `draft`, or dues raised for a squad that did not get saved.
- Players answering games in a season that has no squad yet. The response rules would count everybody as an extra.
- A quiet season that sends something anyway.

## Approaches

- **A. Answers in their own collection, confirmed by a Cloud Function (chosen).** Each answer is a document at `seasons/{id}/signups/{uid}`, written by the player and checked by the rules, the same shape as a game response. Confirm is a callable function that does the conversion, dues, kit and notifications.
- **B. Answer lists on the season document** (`joinUids`, `declinedUids`). Less code, but every answer rewrites the season document and fires `onSeasonWrite`. The season rules would have to let any user edit two lists that only ever hold their own uid. Dues and pushes would still need a function.

A was picked because it follows the response and dues pattern already in the app, and because the work done at confirm is privileged.

## Copying a season

### Who can start one

- An **app admin** can create any season, blank or copied, as today.
- A **season admin** can create the season that follows one they run. The `seasons` create rule becomes `isAppAdmin() || (copiedFrom is string && isSeasonAdmin(copiedFrom))`, and the creator must still be in `adminUids`. A season admin cannot start a blank season.

### Entry points

- A **Copy from** dropdown at the top of `seasons/new`, newest first and set to the newest season by default. An app admin sees every season plus "Start blank" at the end. A season admin sees only the seasons they run and has no blank option.
- A **Start next season** button on each season's admin page (`s/[seasonId]/admin`), which goes to `seasons/new?from={seasonId}` so the dropdown opens already set.

The `AppAdminOnly` gate on `seasons/new` relaxes to match: it lets in an app admin, or anybody who runs at least one season.

### What the form shows

`seasons/new` has its own small form and does not use `frontend/lib/seasonForm.ts`. It keeps that form as editable fields, filled from the source season:

- name (left blank)
- dates
- venue
- slot
- `minPlayers`

It gets three new fields:

- the sign-up close date
- the quiet switch
- the copy picker

The rest of what is copied is carried along unseen and shown as a single summary line under the form, such as "Also copied: fees 31 240 kr, 100 kr per extra game, deadline 24 h, reminders 72 h and 24 h, team balance, 2 other admins". These settings are:

- `responseDeadlineHours`
- `reminderHours`
- `balance`
- `fees`, including the Swish number
- `adminUids`

All of these can be edited on the season's admin settings page, which works on a draft like any other season. Building every setting into the create page would duplicate that page. **(My call.)**

The copying is a pure `copySeasonSettings(source, creatorUid)` in `shared/`, with tests, and so is the date arithmetic, `nextSeasonDates(source)`. The new start is the first slot weekday after the old `endDate`. The new end keeps the old season's length in days. A blank start keeps today's defaults (24 h deadline, 72 h and 24 h reminders).

### Kit

**Kit is copied at confirm, not at creation.** `KitItem.holderUid` must always be in `memberUids`, and a draft season has no members. At confirm, the function copies the kit of the `copiedFrom` season:

- Items held by somebody who joined stay with that person.
- Every other item goes to the admin who confirmed, who is a member by then (see below).

## The sign-up phase

### Status

A new season is created with `status: 'draft'`. That value already exists in `SeasonStatus` and nothing uses it yet. Its label in `SEASON_STATUS_LABELS` changes from "Draft" to "Signing up". The value stays `draft` so no stored data has to move. `seasons/new` always creates seasons as `draft`.

The status dropdown on the admin settings page changes too:

- It is hidden on a draft. Confirming is the only way out of draft.
- It no longer offers Draft on an active or archived season.

The rules enforce both. See "Rules to watch".

### Membership during sign-up

A draft is created with `memberUids: []`. Today the create page writes the creator in, and that stops. The creator is in `adminUids` only.

That breaks, for the length of the sign-up, an invariant the rest of the app keeps: every admin is a member (`removeSeasonMember` strips admin rights: "You can't run a season you're not in"). Confirming puts it back (see below). The builder should check whatever reads it, such as kit holders, the squad screen and `RespondControl`'s admin paths. A draft has no kit and no answerable games, so not much should.

### New fields on the season

```ts
/** The season this one's settings were copied from, if any. Read at create by the rules, and at confirm for the kit. */
copiedFrom?: string;
/** Civil date `YYYY-MM-DD`. Reminders stop after it. Optional, editable while in draft. */
signupClosesOn?: string;
/** Stamped by `confirmSeason`. */
confirmedAt?: string;
confirmedBy?: string;
/** Mutes the sign-up's pushes and emails. See "Quiet seasons". */
quiet?: boolean;
```

All five go on the `seasonShapeOk()` allowlist in `firestore.rules`. `docs/finances.md` explains why: on an update that list is checked against the merged document, so a stored key it doesn't name locks the season.

### The answer document

```
seasons/{seasonId}/signups/{uid}   status: 'yes' | 'no', answeredAt, updatedAt, answeredBy?
```

- **No document means no answer.** That is the third state, as it is for responses, and no placeholder is ever written.
- `answeredBy` is set only when an admin answered on someone's behalf, and holds that admin's uid. It exists so a wrong proxy answer can be traced back to whoever wrote it, which is the same reason scorelines are signed.
- **Rules:**
    - Readable by any signed-in user, consistent with the rest of the app.
    - A user may create, update or delete their own document while the season is `draft`.
    - A season admin may do the same for anybody, but must set `answeredBy` to their own uid.
    - Nobody may write once the season is no longer `draft`.
    - The shape is checked with `hasOnly` and `status in ['yes', 'no']`.

### Games during sign-up

An admin can generate games while the season is a draft, as today. Players can see the schedule, but every response write is refused while the season is a draft. That covers the player's own path and the admin's own `allow write` path for answering on somebody's behalf. The UI shows the games without In/Out buttons and with a line saying answers open once the season is confirmed.

`sendReminders` already queries only `status == 'active'` seasons, so per-game reminders need nothing. The at-risk flag, kit coverage warnings and the calendar feed each need checking. Any of them that would act on a draft gets a status check.

### Where the question appears

1. **A card at the top of every season home** whenever some season is a draft and the viewer hasn't answered it yet. It shows the name, the slot, the venue, the dates, and the entry fee as `fees.total` ÷ yeses so far, with a note that the final share depends on how many join. It has two buttons: Join / Not this time. After an answer, the card collapses to a single line with a way to change the answer. It goes away when the season is confirmed.
2. **The draft season's own page** (`s/[seasonId]`) shows the same question in full, plus the schedule (read-only) and who has said yes so far.
3. **The seasons list** shows the draft with its "Signing up" pill.

The card also shows on the draft season's own page, for people with no active season. They reach it from the seasons list or from the push.

### Admin view

On the draft season's admin page, a **Sign-up** section lists everybody in the app in three groups: Joining, Not joining, No answer. Each row has an "answer for them" control, the same idea as `docs/answering-for-somebody.md`, and the player is not notified. Above the list:

- the number of yeses
- the share each person would pay, `entryShare(fees.total, yeses)`
- a **Confirm season** button, with a confirmation sheet that repeats the count and the share

There's no minimum. The admin decides when to confirm. The button is disabled, with a line saying why, until the admin looking at it has said yes themselves.

## Confirming

A callable function, `confirmSeason({ seasonId })`, in `backend/src/confirmSeason.ts`.

1. **Checks:**
    - The caller is a season admin or an app admin.
    - The season exists and is `draft`. Otherwise `failed-precondition`, so a second press does nothing.
    - The caller has a `yes` answer. Otherwise `failed-precondition`, because the confirming admin has to end up a member to keep their admin rights and to hold leftover kit.
2. **In one transaction:**
    - Read every `signups` document with `status == 'yes'`.
    - Set `memberUids` to exactly those uids.
    - Set `adminUids` to the admins who are also in that list. **An admin who didn't say yes loses admin rights on this season**, which restores the "every admin is a member" invariant. The confirm sheet names anybody who is about to lose admin rights this way.
    - Set `status: 'active'`, `confirmedAt` and `confirmedBy`.
    - If `fees.total` is set, write an `entry_{uid}` due for each member, priced with `entryShare(fees.total, members.length)`. Use the same id and shape the client sweep uses, so a later sweep finds them and leaves them alone.
    - If `copiedFrom` is set, write the kit copies as described above.
3. **After the commit:** unless the season is quiet, send each new member a push (and the email fallback) with their share. This is a new `SeasonNotification` kind, `seasonConfirmed`, and it replaces the per-due `dueRaised` for these charges, so nobody gets two messages. It has no preference switch, for the same reason `dueRaised` has none: the person asked to join and this is the answer. With no fee it says "You're in for Autumn 2026" and gives no amount.

**The debt lock applies, deliberately.** Each entry due is owing the moment it is written, `onDueWrite` marks the member a debtor, and `settledUp()` refuses their In until it is paid. Paying is what makes the place real. So the `seasonConfirmed` text says how to pay (Swish number and amount) and that their first In opens once it's paid: "You're in for Autumn 2026. Your share is 1 736 kr, Swish it to 070 123 45 67 to start answering games." Wording goes through `unslop`.

`onSeasonWrite` will see `memberUids` change and repair game counts. No game can hold a response yet, so the repair finds nothing to do.

A season with no yeses besides the confirming admin's is still a valid confirm. The admin sees that number before pressing.

**People who never answered** stay unanswered. They aren't members, and nothing is recorded for them. They can join later through the late-join route that already exists (`LateJoinSheet`), which handles the pro-rated fee.

## Notifications

Three new `SeasonNotification` kinds, all added to `docs/notifications.md`:

- **`signupOpen`.** "Autumn 2026 is starting. Are you in?" Sent to every user in the app and deep-links to the draft season's page. Its preference switch is `reminders`, because asking somebody to answer is the same thing, and somebody who muted reminders has said they don't want to be chased. It fires from `onSeasonWrite` in either of two cases:
    - a season is created as a non-quiet draft
    - a draft goes from quiet to not quiet (see below)
- **`signupReminder`.** Same text with the close date if there is one. Sent by a new scheduled function every 3 days at 18:00 Stockholm time, to everyone with no `signups` document. It only goes out while the season is a non-quiet draft and `signupClosesOn` hasn't passed. Same `reminders` switch.
- **`seasonConfirmed`.** Covered above.

## Quiet seasons

So the flow can be tested on the live app without messaging real people.

- A **Don't notify anyone** switch on `seasons/new`, off by default, stored as `quiet: true`. It is also on the season's admin settings page while the season is a draft.
- A quiet season sends **none** of `signupOpen`, `signupReminder` or `seasonConfirmed`, by push or by email. The check sits in each sender, read off the season document they already load.
- **Turning quiet off on a draft announces it.** `onSeasonWrite` sends `signupOpen` then, so a season set up and checked in quiet can go live without being recreated. **(My call.)**
- Quiet changes nothing else. Answers, confirm, dues and kit all behave exactly as they would otherwise.
- It covers the sign-up only. Once the season is active, game notifications go out as usual whether or not it was quiet. Archive or delete a test season after confirming it.

## Testing

- `shared/`:
    - `copySeasonSettings`
    - `nextSeasonDates`
    - a pure `planConfirmation(signups, season, sourceKit, confirmerUid)` that returns the members, the admins kept, the dues and the kit to write

    The function only runs `planConfirmation` in a transaction, so the decisions stay unit-testable, the same split as `owesForGame`.

- `rules/`:
    - signups: self, admin proxy with `answeredBy`, no writes after `draft`, shape
    - responses refused on a draft season, from both the player's path and the admin's
    - season create by a season admin of `copiedFrom`, refused without it
    - season updates cannot move into or out of `draft`
    - new season fields on the allowlist
- `backend/`:
    - `confirmSeason`: happy path, second press, caller without a yes, no fee, admin who said no loses admin, kit handover
    - quiet seasons send nothing
    - quiet to loud announces
- `e2e/`: a new `signup.spec.ts`. An admin creates a quiet season copied from a seeded one, two players answer yes and no from the home card, the admin answers yes and confirms, and the yes player sees the season as a member with a due and a held In button. It needs its own seeded source season so it doesn't touch the other specs' data.
- Seeder: a quiet draft season with a mix of answers in `scenarios.ts`, so it can be looked at locally.

## Rules to watch

- **Status.** Season admins update the season document from the client (`allow update: if isSeasonAdmin`). Add both directions:
    - if `resource.data.status == 'draft'`, then `request.resource.data.status == 'draft'`. Only `confirmSeason` takes a season out of draft.
    - if `resource.data.status != 'draft'`, then `request.resource.data.status != 'draft'`. Nothing goes back.

    Archiving an active season stays as it is.

- **Membership on a draft.** While `status == 'draft'`, a client update must not change `memberUids`. Otherwise the squad screen could add members around the sign-up.
- **Create.** Covered under "Who can start one".

## Left to the builder

- Reminder cadence and hour (3 days, 18:00 proposed).
- Which of at-risk, kit coverage and the calendar feed need a draft check, and whether they share a helper.
- Wording of the card, the push texts, the confirm sheet and the summary line, run through `unslop`.
- What the home card shows when two seasons are drafts at once. Proposed: one card per draft, newest first.

## Calls I made (check these)

- The dates move forward by the old season's length, starting on the next slot weekday.
- `seasons/new` edits only the basics. The other copied settings show as a summary line and are edited afterwards in admin settings.
- People can change their answer until confirm.
- Confirm can't be undone.
- The confirming admin must have said yes.
- Reminders go every 3 days and use the `reminders` preference.
- The share on the card is "so far" and updates live.
- Turning quiet off on a draft sends the opening push.
- Quiet covers only the sign-up's three notifications.
