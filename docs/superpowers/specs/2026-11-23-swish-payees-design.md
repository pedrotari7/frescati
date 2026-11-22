# Swish payees: a number per pot, picked from the admins

## Why

A season has one Swish number today (`fees.swish`), and every charge is paid to it. The group splits the work differently. One admin collects the season fee that pays the pitch bill, and another handles the extras' money. Admins also retype numbers for every season, because nothing remembers them.

This change gives each of the two pots its own payee, and lets an admin keep their Swish number on file so a season can just name them. A custom number is still allowed for anybody who isn't an admin.

## Goals

- A season can send the season fee (`entry` charges) to one number, and extras' fees (`game` and `late` charges) to another.
- A payee is either an admin, picked by name, or a custom number typed in.
- An admin saves their own Swish number once, and it is kept private.
- When an admin changes their number, every season that pays to them follows.
- A payer who owes into both pots sees two Swish codes, each for its own amount. When both pots pay the same number, they see one code for the total, as today.

## Non-goals

- No payee per charge. There are two pots and two payees.
- No phone number for anybody who isn't an admin. The profile field appears only for admins.
- No change to how charges are raised, priced or settled.

## Anti-goals

- **An admin's number readable by anybody who doesn't need it.** Numbers are published only on a season that pays to that admin, which is where payers have to read them anyway. The picker never sees the digits.
- **A payer shown a stale number after the admin changed theirs.**
- **Existing seasons breaking.** A season that only has `fees.swish` must keep paying to it, for both pots.

## Approaches

- **A. The season names its payees, and a function keeps the published number in sync (chosen).** Payers keep reading the season document in real time, as they do today. Only numbers actually in use are public.
- **B. The season stores only the uid, and payers ask a function for the number.** Nothing is copied, but every payment screen waits on a call before it can draw a code, and a failed call means no code at the pitch.
- **C. Copy the digits when an admin is picked.** This is the simplest, but it doesn't follow a changed number, which was asked for.

## Data

### An admin's number

```
users/{uid}/private/payment    { swish: string, updatedAt: string }
```

- **Readable** by its owner and by app admins. Functions use the Admin SDK.
- **Writable** by its owner only, with the shape `hasOnly(['swish','updatedAt'])`. `swish` is a string of 20 characters or fewer, the same bound `feesShapeOk` puts on `fees.swish` today.
- **Who sees the field.** The rules can't ask "is this person an admin of some season", so any user may write their own. The profile shows the field only to app admins and season admins, and the picker only lists admins. A non-admin who writes one anyway publishes nothing.
- **Deleting it** clears the number from every season that pays to them. Those seasons then fall back to "ask an admin how to pay".

### A season's payees

```ts
interface Payee {
	/** Set when the payee is an admin. The published number then follows theirs. */
	uid?: string;
	/** The number payers see. Typed in for a custom payee; written by the function for an admin. */
	swish?: string;
}

interface SeasonFees {
	total: number;
	perGame: number;
	/** Kept for seasons that predate payees: the number for both pots when `payees` names none. */
	swish?: string;
	payees?: { entry?: Payee; extras?: Payee };
}
```

- **One shared reader.** `payeeFor(fees, kind: DueKind): string | undefined` in `shared/finances.ts` decides which number a charge is paid to. `entry` charges read `payees.entry.swish`, while `game` and `late` read `payees.extras.swish`. They fall back to `fees.swish` only when that pot has no payee at all. A pot that names an admin who has no saved number resolves to nothing, rather than to the old number, because paying the wrong person is worse than being told to ask. Every screen and notification asks this function. None of them reads `fees.swish` directly any more.
- **Client writes are limited by the rules.** A client may write a payee as `{ uid }` alone, or as `{ swish }` alone (a custom number). It may never write `{ uid, swish }` together, because the digits for an admin come only from the function. Allowlists: `feesShapeOk` gains `payees`, and each payee is `hasOnly(['uid','swish'])` with the same 20-character bound.
- **Copying a season** copies `fees` whole, payees included (`copySeasonSettings`), so a new season pays the same people.

### Keeping the published number in sync

One function module, `backend/src/payees.ts`, with two triggers that share one helper.

- **`onPaymentWrite`** (`users/{uid}/private/payment`) finds every season where `fees.payees.entry.uid == uid` or `fees.payees.extras.uid == uid`, and writes the new `swish` there, or removes it when the number was deleted. It needs two queries, one per pot, and two single-field indexes in `firestore.indexes.json` if Firestore asks for them.
- **On a season write** (inside the existing `onSeasonWrite`, guarded like the sign-up announce so it can't block the recount), for each pot whose payee has a `uid` but whose `swish` is missing or differs from the admin's saved number, write the number. Its own write retriggers it, then finds nothing to do.
- **No saved number.** An admin who has not saved a number can still be picked. The payee stays `{ uid }` with no `swish`, payers see "ask an admin how to pay", and the moment the admin saves a number it appears.

## Picking a payee

- **The callable.** `listPayees()` returns `{ uid, displayName, hasNumber }[]` for every app admin and every uid in any season's `adminUids`. The caller must be an app admin or an admin of at least one season. It never returns digits. It is a callable because the numbers are private, and listing who has one needs the Admin SDK. The same reasoning applies to `getPushDevices`.
- **Season settings.** Under Money, the single "Swish number" field becomes two pickers, "Season fee paid to" and "Extras' fees paid to". Each is a dropdown of the listed admins, with names, and "(no number saved)" beside anybody without one. After that comes "Custom number", which reveals a text field.
- **Older seasons.** A season with only the legacy `fees.swish` shows both pickers set to "Custom number" with that number filled in. Saving writes `payees` and leaves `fees.swish` alone. It's still the fallback, and removing it is not this change's job.
- **The New season form** copies payees through `copySeasonSettings`. The "Also copied" line names them, for example "season fee to Anna, extras to Mateo".

## The admin's own number

On `/me`, an admin (app admin, or in `adminUids` of any season) sees a "Your Swish number" field. It explains that the number is only shown to people paying a season that sends money to you. Saving writes `users/{uid}/private/payment`, and clearing it deletes the document.

## Paying

- **Splitting what is owed.** The finances screen ("What you owe") and the debt notice on the season home split the person's outstanding charges by payee number, using `payeeFor`. Each distinct number gets its own `SwishPay` code and amount, labelled "Season fee" or "Extras' fees". When both resolve to the same number there is one code for the total, as today. A pot with no number shows the existing "ask an admin" line for that pot only.
- **Your own number.** The old warning, "Swish will not let you pay your own number", becomes exact. The viewer can read their own payment doc, so when a code's number equals it, the code is replaced by "This one is paid to you. Mark it paid in the book below." This needs no other read, because only the owner compares against their own number.
- **`seasonConfirmed`** names the entry payee's number, the season fee.
- **`PaymentTriggers`** on `/debug` uses the entry payee.

## Testing

- **`shared/`:** `payeeFor` covers the legacy fallback, each pot, and a missing number. A pure `splitByPayee(dues, fees)` returns `{ swish, label, amount }[]` and merges groups that share a number.
- **`rules/`:**
    - private payment: owner read and write, app admin read, nobody else, shape.
    - season payees: `{uid}` and `{swish}` are accepted, `{uid, swish}` from a client is refused, and a plain season update carrying `payees` passes.
- **`backend/`:**
    - `onPaymentWrite` updates both pots on two seasons and clears them on delete.
    - The season-write sync fills a newly picked admin and leaves a custom payee alone.
    - `listPayees` returns no digits and refuses a non-admin caller.
- **`frontend/`:**
    - The settings pickers write `{uid}` or `{swish}`, and a legacy season opens as custom.
    - The `/me` field shows only for admins.
    - The payment section draws two codes when two numbers are owed, one code when they match, and the "paid to you" line for your own number.
- **`e2e/`:** extend `finances.spec.ts`. An admin saves a number and picks themselves for the season fee and a custom number for extras. A member who owes both sees two codes.

## Left to the builder

- The exact copy on the pickers, the `/me` field and the per-pot labels, run through `unslop`.
- Whether the season-write sync lives inline in `onSeasonWrite` or in `payees.ts` called from it. It must not delay or block the roster recount.
- Whether the two pickers sit side by side above `md` or stack.
