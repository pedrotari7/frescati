import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aSeasonAdmin } from './fixtures';
import { openSeasonAs } from './helpers';
import { AT, dialog, expand, sectionUnder } from './locators';

/**
 * The admin calendar, and the one button on it that notifies the whole group.
 *
 * Cancelling is the write on this screen with the widest blast radius,
 * `onGameWrite` pushes to everybody the game affects the moment `status` moves,
 * and it is the smallest, quietest control in the row, sitting beside a
 * Delete that has always asked first. Two things guard it now and neither can
 * be checked anywhere but here: a confirm dialog, and the refusal to offer it
 * at all once the football has been played.
 *
 * That second one is not cosmetic. `getGameLifecycle` answers `cancelled`
 * before it answers `finished`, so calling off a game that has already been
 * played stops it being finished, puts it back in `groupGames`'s scheduled
 * bucket, and floats a confirmed and rated game to the top of the season home
 * screen as the next one.
 *
 * **This spec mutates nothing**, deliberately. The files here run in parallel
 * against one seeded database and are disjoint on purpose; `respond.spec.ts`
 * answers the current season's next game, which is the very game an admin spec
 * would reach for. So the destructive half is tested by opening the dialog and
 * dismissing it, which is exactly the assertion worth making anyway, since the
 * bug was that no dialog stood between a tap and the notification.
 */

/** Straight to the calendar, through the gear the season admin gets. */
const openTheCalendar = async (page: Page): Promise<void> => {
	await openSeasonAs(page, aSeasonAdmin());

	await page.getByRole('link', { name: 'Season admin' }).click();
	await expect(page).toHaveURL(AT.seasonAdmin);

	// By its subtitle, not by "Games": the bottom nav has a tab of that name
	// pointing back at the season, and it is the one that wins on a phone.
	await page.getByRole('link', { name: /Generate/ }).click();
	await expect(page).toHaveURL(AT.adminCalendar);
};

test.describe('the admin calendar', () => {
	test('splits the season on the final whistle, with the played half collapsed', async ({ page }) => {
		await openTheCalendar(page);

		const coming = sectionUnder(page, /^Coming up \(/);
		const played = sectionUnder(page, /^Played \(/);

		await expect(coming, 'no upcoming section on the calendar').toBeVisible();
		await expect(played, 'this season has played no games').toBeVisible();

		// The reason for the split: by March this is twenty rows of football
		// that has already happened, above the game an admin came to change.
		await expect(played.getByRole('button', { name: 'Delete' })).toHaveCount(0);

		await expand(played);
		await expect(played.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
	});

	test('refuses to offer Cancel on a game that has already been played', async ({ page }) => {
		await openTheCalendar(page);

		const played = sectionUnder(page, /^Played \(/);
		await expand(played);

		const rows = played.getByRole('button', { name: 'Delete' });
		await expect(rows.first(), 'the played list expanded to nothing').toBeVisible();

		// Every played row still offers Delete, so this is the absence of one
		// control rather than of the whole row. Restore is the exception and
		// stays on a cancelled game whenever it happened, that is the way back
		// from having called one off by mistake.
		const cancels = await played.getByRole('button', { name: 'Cancel' }).count();
		expect(cancels, 'a played game still offered Cancel').toBe(0);
	});

	// A cancelled game that hasn't been played yet stays here rather than moving
	// to Played, because putting it back on is a thing an admin does from this
	// list, so Coming up is where Restore has to be.
	test('keeps a called-off game that has not been played under Coming up', async ({ page }) => {
		await openTheCalendar(page);

		const coming = sectionUnder(page, /^Coming up \(/);

		await expect(coming.getByText('Cancelled').first(), 'no cancelled game seeded ahead of us').toBeVisible();
		await expect(coming.getByRole('button', { name: 'Restore' }).first()).toBeVisible();
	});

	test('asks before calling a game off, and does nothing when told no', async ({ page }) => {
		await openTheCalendar(page);

		const coming = sectionUnder(page, /^Coming up \(/);
		const cancels = coming.getByRole('button', { name: 'Cancel' });
		const restores = coming.getByRole('button', { name: 'Restore' });

		// Counted rather than asserted absent: the seed already has a cancelled
		// game ahead of us, and what this test is about is that nothing *moved*.
		const [wasCancellable, wasCancelled] = [await cancels.count(), await restores.count()];
		expect(wasCancellable, 'nothing on this calendar left to call off').toBeGreaterThan(0);

		await cancels.first().click();

		// The dialog is the fix: this used to fire straight into Firestore, and
		// push to everybody the game affects, on the tap.
		//
		// Asserted on its content rather than on the sheet itself, for the reason
		// `dialog` in `locators.ts` gives.
		const sheet = dialog(page);
		await expect(sheet.getByText(/gets a notification/), 'no confirmation before calling a game off').toBeVisible();

		await sheet.getByRole('button', { name: 'Cancel' }).click();
		await expect(sheet).toBeHidden();

		// Backing out left the game alone, which is the whole point of asking.
		// Had it gone through, this row's Cancel would now read Restore.
		await expect(cancels).toHaveCount(wasCancellable);
		await expect(restores).toHaveCount(wasCancelled);
	});
});
