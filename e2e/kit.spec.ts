import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { aMember, whoIs } from './fixtures';
import { openSeasonAs } from './helpers';

/**
 * Handing the ball over, and the two rules that meet on that screen.
 *
 * The register is the one place where an ordinary member may write to a document
 * they do not own — any member may hand any item to any other member, because a
 * handover happens at a pitch between two people and routing it through an admin
 * means it never gets recorded at all. What they may not do is change what an
 * item *is*, and the rules express that as a diff: a member's write may touch
 * `holderUid`, `updatedBy` and `updatedAt` and nothing else.
 *
 * A diff rule is exactly the kind that passes a hand-written rules test and
 * fails against the real client, because what it accepts depends on the precise
 * field set the app sends. `transferKitItem` writes those three and no more; if
 * a fourth were ever added — a `transferredAt`, a denormalised name — every
 * handover by every non-admin would start failing and no unit test would notice.
 *
 * The other half is `getKitStatus`, which is derived rather than stored: no
 * counter, no trigger, just the register read against the game's responses. So
 * moving the ball to somebody who is out has to change what the next-game card
 * says, immediately and with nothing in between.
 */

/**
 * The name on one of the sheet's rows.
 *
 * Off the avatar's `title`, not the row's text: an account with no picture draws
 * its initials instead, so `innerText` comes back as "DP\nDimitri Petrov" and
 * nothing on the register matches it.
 */
const holderName = async (row: Locator): Promise<string> =>
	(await row.locator('[title]').first().getAttribute('title'))!;

test.describe('the kit register', () => {
	test('lets an ordinary member hand an item to somebody else', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);

		await page
			.getByRole('link', { name: /Squad|Members/i })
			.first()
			.click();
		await page.getByRole('link', { name: /Kit/i }).first().click();
		await expect(page).toHaveURL(/\/kit$/);

		const handOver = page.getByRole('button', { name: 'Hand over' }).first();
		await expect(handOver).toBeVisible();
		await handOver.click();

		const sheet = page.getByRole('dialog');
		await expect(sheet.getByText(/Who has /)).toBeVisible();

		// Whoever the sheet itself offers, rather than a name picked out of the
		// cast: it lists the squad and only the squad, because the rules refuse a
		// holder who isn't on `memberUids`, and it disables the current holder.
		// So the first enabled option is by construction a legal new holder —
		// which a name chosen here would only be by luck.
		const candidate = sheet.locator('li button:not([disabled])').first();
		await expect(candidate, 'the sheet offered nobody to hand it to').toBeVisible();

		const other = await holderName(candidate);
		await candidate.click();

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
		// so no such person means the cast changed shape — which is a thing to
		// fix, not to quietly step over.
		expect(member, 'no seeded season member who is not also an admin').toBeTruthy();

		await openSeasonAs(page, member!);
		await page
			.getByRole('link', { name: /Squad|Members/i })
			.first()
			.click();
		await page.getByRole('link', { name: /Kit/i }).first().click();

		await expect(page.getByRole('button', { name: /^Rename / })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
		// The one thing they can do is still there.
		await expect(page.getByRole('button', { name: 'Hand over' }).first()).toBeVisible();
	});

	test('survives a reload, because the handover was written', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);
		await page
			.getByRole('link', { name: /Squad|Members/i })
			.first()
			.click();
		await page.getByRole('link', { name: /Kit/i }).first().click();

		await page.getByRole('button', { name: 'Hand over' }).first().click();
		const sheet = page.getByRole('dialog');

		// The same "whoever is offered" rule as above, and here it also avoids
		// handing the item to whoever already holds it — that button is disabled,
		// and a handover that was a no-op would survive a reload for the wrong
		// reason.
		const candidate = sheet.locator('li button:not([disabled])').first();
		const holder = await holderName(candidate);
		await candidate.click();
		await expect(sheet).toBeHidden();

		await page.reload();

		await expect(page.getByText(holder).first()).toBeVisible();
	});
});
