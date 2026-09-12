import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { aMember, whoIs } from './fixtures';
import { openSeasonAs, openTab } from './helpers';
import { AT, NO_PROFILE_YET, dialog, dialogGone } from './locators';

/**
 * Putting kit on the register and handing it over, and the rules that meet on
 * that screen.
 *
 * The register is the one place where an ordinary member may write to a document
 * they do not own. Any member may hand any item to any other member, and any
 * member may add one, because both are settled at a pitch rather than in an
 * admin's inbox, and routing either through one means it never gets recorded at
 * all. What they may not do is change what an item already *is*, and the rules
 * express that as
 * a diff: a member's write to an existing item may touch `holderUid`,
 * `updatedBy` and `updatedAt` and nothing else.
 *
 * A diff rule is exactly the kind that passes a hand-written rules test and
 * fails against the real client, because what it accepts depends on the precise
 * field set the app sends. `transferKitItem` writes those three and no more; if
 * a fourth were ever added, a `transferredAt`, a denormalised name, every
 * handover by every non-admin would start failing and no unit test would notice.
 * A create is the same shape of bet: `kitShapeOk` names five keys and nothing
 * else, so `addKitItem` is only legal for a member as long as it sends exactly
 * those.
 *
 * The other half is `getKitStatus`, which is derived rather than stored: no
 * counter, no trigger, just the register read against the game's responses. So
 * moving the ball to somebody who is out has to change what the next-game card
 * says, immediately and with nothing in between.
 */

/**
 * Into the register, which lives behind the Club tab rather than beside it.
 *
 * Two taps because it is two screens: the Club tab is the roster, and the kit
 * is one of the things the club owns. Worth naming once, every test here
 * starts with the same walk, and none of them is about the walk.
 */
const openTheKitRegister = async (page: Page): Promise<void> => {
	await openTab(page, /^Club$/);
	await page.getByRole('link', { name: /Kit/i }).first().click();

	await expect(page).toHaveURL(AT.kit);
};

/**
 * The name on one of the sheet's rows.
 *
 * Off the avatar's `title`, not the row's text: an account with no picture draws
 * its initials instead, so `innerText` comes back as "DP\nDimitri Petrov" and
 * nothing on the register matches it.
 */
const holderName = async (row: Locator): Promise<string> =>
	(await row.locator('[title]').first().getAttribute('title'))!;

/**
 * Hand the open sheet's item to somebody, and say who it went to.
 *
 * Whoever the sheet itself offers, rather than a name picked out of the cast: it
 * lists the squad and only the squad, because the rules refuse a holder who
 * isn't on `memberUids`, and it disables whoever has it already. So the first
 * enabled option is by construction a legal new holder, which a name chosen
 * here would only be by luck.
 *
 * But it has to be read and clicked as a *person*, not as a position, because
 * the list re-orders underneath itself. `squad` is `season.memberUids` joined
 * against the profiles subscription and sorted by display name, and the page
 * draws before that subscription has landed, so for a moment every row reads
 * "Unknown player", they are in `memberUids` order, and the sort that puts them
 * in alphabetical order happens afterwards. Reading a name off row one and then
 * clicking row one are two different people either side of that.
 *
 * Which is not a hypothetical: it handed the ball to whoever sorted first
 * instead, and the test that reloads to check the write went through was the
 * one that noticed. It passed every time against `next dev`, where the page was
 * slow enough that the profiles always beat the test to the sheet, and failed
 * every time the moment the suite started serving a production build.
 */
const handItToSomebody = async (page: Page, sheet: Locator): Promise<string> => {
	const enabled = sheet.locator('li button:not([disabled])');
	await expect(enabled.first(), 'the sheet offered nobody to hand it to').toBeVisible();

	// The join has landed and the order has stopped moving. Reading a name before
	// this returns the placeholder, which is every row at once.
	await expect(sheet.getByText(NO_PROFILE_YET)).toHaveCount(0);

	const name = await holderName(enabled.first());

	// By name, so this is the row for the person just read even if the list has
	// moved again in between. Two members sharing a display name would fail
	// Playwright's strict mode here rather than quietly hand it to the wrong one.
	await sheet.locator('li button', { has: page.locator(`[title=${JSON.stringify(name)}]`) }).click();

	return name;
};

test.describe('the kit register', () => {
	test('lets an ordinary member hand an item to somebody else', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);
		await openTheKitRegister(page);

		const handOver = page.getByRole('button', { name: 'Hand over' }).first();
		await expect(handOver).toBeVisible();
		await handOver.click();

		const sheet = dialog(page);
		await expect(sheet.getByText(/Who has /)).toBeVisible();

		const other = await handItToSomebody(page, sheet);

		await dialogGone(page);
		// The register now says so, which is the only question it answers.
		await expect(page.getByText(other).first()).toBeVisible();
	});

	test('offers a member both of their controls and neither of the admin ones', async ({ page }) => {
		// Renaming, re-kinding and deleting stay with season admins: a member who
		// could re-kind the vests as `other`, or delete them outright, would
		// silence that warning for the whole squad. Adding and handing over are
		// theirs, because both are a claim about a bag somebody is carrying.
		const member = whoIs(/^Member of /).find(candidate => !/Admin of /.test(candidate.hint));
		// Not a skip: every scenario seeds seasons with ordinary members in them,
		// so no such person means the cast changed shape, which is a thing to
		// fix, not to quietly step over.
		expect(member, 'no seeded season member who is not also an admin').toBeTruthy();

		await openSeasonAs(page, member!);
		await openTheKitRegister(page);

		await expect(page.getByRole('button', { name: /^Rename / })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);

		await expect(page.getByRole('button', { name: 'Hand over' }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add kit' })).toBeVisible();
	});

	test('survives a reload, because the handover was written', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);
		await openTheKitRegister(page);

		await page.getByRole('button', { name: 'Hand over' }).first().click();
		const sheet = dialog(page);

		// Never the current holder, that button is disabled, and a handover that
		// was a no-op would survive a reload for the wrong reason.
		const holder = await handItToSomebody(page, sheet);

		// The sheet closes on the write, so this is the wait for Firestore to
		// have acked it. Reloading before that point unloads the page with the
		// request still queued in the browser, and the handover is gone.
		await dialogGone(page);

		await page.reload();

		await expect(page.getByText(holder).first()).toBeVisible();
	});

	// Last in the file on purpose: this is the one test here that puts a new
	// document on the register, and the tests above reach for the first row of a
	// list. Tests inside a spec file run in order, so leaving this at the end
	// means every one of them still sees the register the seeder wrote.
	test('lets an ordinary member put something new on the register', async ({ page }) => {
		// Through the real form, because what a create is allowed to carry is a
		// shape check on five named keys, and only the app knows which fields it
		// actually sends.
		const member = whoIs(/^Member of /).find(candidate => !/Admin of /.test(candidate.hint));
		expect(member, 'no seeded season member who is not also an admin').toBeTruthy();

		await openSeasonAs(page, member!);
		await openTheKitRegister(page);

		await page.getByRole('button', { name: 'Add kit' }).click();

		// Named for this run, so the assertion below can't match kit that was
		// seeded or left behind by an earlier test in this file.
		const name = `Spare ball ${Date.now()}`;
		await page.getByLabel('What is it').fill(name);

		// Whoever the form offers, which is the squad and only the squad: the
		// rules refuse a holder who isn't on `memberUids`, so a name picked out
		// of the cast here would be legal only by luck.
		const holder = page.getByLabel('Who has it');
		await expect(holder.locator('option:not([value=""])').first()).toBeAttached();
		await holder.selectOption({ index: 1 });

		await page.getByRole('button', { name: 'Add', exact: true }).click();

		// On the register, and still there once the write has been round
		// Firestore rather than only in the form that sent it.
		await expect(page.getByText(name)).toBeVisible();
		await page.reload();
		await expect(page.getByText(name)).toBeVisible();
	});
});
