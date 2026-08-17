import { expect, test } from '@playwright/test';
import { aMember, openAs, whoIs } from './fixtures';
import { openFirstSeason } from './helpers';

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

test.describe('the kit register', () => {
	test('lets an ordinary member hand an item to somebody else', async ({ page }) => {
		const member = aMember();
		await openAs(page, member);
		await openFirstSeason(page);

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

		// Somebody on the roster who is not the person signed in — the rules
		// check the incoming holder against `memberUids`.
		const other = whoIs(/^Member of |Admin of /).find(candidate => candidate.uid !== member.uid);
		expect(other, 'the scenario needs at least two people in a season').toBeTruthy();

		await sheet.getByLabel('Search the squad').fill(other!.displayName);
		await sheet
			.getByRole('button', { name: new RegExp(other!.displayName.split(' ')[0]) })
			.first()
			.click();

		await expect(sheet).toBeHidden();
		// The register now says so, which is the only question it answers.
		await expect(page.getByText(other!.displayName).first()).toBeVisible();
	});

	test('refuses to offer a member the admin-only controls', async ({ page }) => {
		// Naming, re-kinding, adding and deleting stay with season admins: a
		// member who could re-kind the vests as `other` would silence that
		// warning for the whole squad.
		const member = whoIs(/^Member of /).find(candidate => !/Admin of /.test(candidate.hint));
		test.skip(!member, 'this scenario has no season member who is not also an admin');

		await openAs(page, member!);
		await openFirstSeason(page);
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
		await openAs(page, member);
		await openFirstSeason(page);
		await page
			.getByRole('link', { name: /Squad|Members/i })
			.first()
			.click();
		await page.getByRole('link', { name: /Kit/i }).first().click();

		await page.getByRole('button', { name: 'Hand over' }).first().click();
		const sheet = page.getByRole('dialog');
		await sheet.getByLabel('Search the squad').fill(member.displayName);
		await sheet
			.getByRole('button', { name: new RegExp(member.displayName.split(' ')[0]) })
			.first()
			.click();
		await expect(sheet).toBeHidden();

		await page.reload();

		await expect(page.getByText(member.displayName).first()).toBeVisible();
	});
});
