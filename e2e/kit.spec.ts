import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { aMember, whoIs } from './fixtures';
import { openSeasonAs, openTab } from './helpers';
import { AT, dialog } from './locators';

/**
 * Handing the ball over, and the two rules that meet on that screen.
 *
 * The register is the one place where an ordinary member may write to a document
 * they do not own, any member may hand any item to any other member, because a
 * handover happens at a pitch between two people and routing it through an admin
 * means it never gets recorded at all. What they may not do is change what an
 * item *is*, and the rules express that as a diff: a member's write may touch
 * `holderUid`, `updatedBy` and `updatedAt` and nothing else.
 *
 * A diff rule is exactly the kind that passes a hand-written rules test and
 * fails against the real client, because what it accepts depends on the precise
 * field set the app sends. `transferKitItem` writes those three and no more; if
 * a fourth were ever added, a `transferredAt`, a denormalised name, every
 * handover by every non-admin would start failing and no unit test would notice.
 *
 * The other half is `getKitStatus`, which is derived rather than stored: no
 * counter, no trigger, just the register read against the game's responses. So
 * moving the ball to somebody who is out has to change what the next-game card
 * says, immediately and with nothing in between.
 */

/**
 * Into the register, which lives behind the Squad tab rather than beside it.
 *
 * Two taps because it is two screens: the Squad tab is the roster, and the kit
 * is one of the things that roster owns. Worth naming once, every test here
 * starts with the same walk, and none of them is about the walk.
 */
const openTheKitRegister = async (page: Page): Promise<void> => {
	await openTab(page, /^Squad$/);
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
 * What a squad row reads as before the profiles have arrived. `people.ts`.
 *
 * Not a defensive fallback but a real state, which is exactly why it can be
 * waited for: nothing on the register stores a name, so every list of people is
 * a join against the profiles subscription, and this is what a row says while
 * that join is still outstanding.
 */
const NO_PROFILE_YET = 'Unknown player';

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

		await expect(sheet).toBeHidden();
		// The register now says so, which is the only question it answers.
		await expect(page.getByText(other).first()).toBeVisible();
	});

	test('refuses to offer a member the admin-only controls', async ({ page }) => {
		// Naming, re-kinding, adding and deleting stay with season admins: a
		// member who could re-kind the vests as `other` would silence that
		// warning for the whole squad.
		const member = whoIs(/^Member of /).find(candidate => !/Admin of /.test(candidate.hint));
		// Not a skip: every scenario seeds seasons with ordinary members in them,
		// so no such person means the cast changed shape, which is a thing to
		// fix, not to quietly step over.
		expect(member, 'no seeded season member who is not also an admin').toBeTruthy();

		await openSeasonAs(page, member!);
		await openTheKitRegister(page);

		await expect(page.getByRole('button', { name: /^Rename / })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
		// The one thing they can do is still there.
		await expect(page.getByRole('button', { name: 'Hand over' }).first()).toBeVisible();
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
		await expect(sheet).toBeHidden();

		await page.reload();

		await expect(page.getByText(holder).first()).toBeVisible();
	});
});
