import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { DevUser } from './fixtures';
import { openAs, readCast } from './fixtures';

/**
 * A finished season opening on its recap, and letting go once it is watched.
 *
 * `Winter league 2025` is seeded over, rated and stamped for this file alone.
 * Watching it to the end writes to the player's profile, and both viewports run
 * against the same database, so each viewport plays it as somebody different:
 * the second run would otherwise find it already watched and never be taken
 * over at all.
 */

const SEASON = 'Winter league 2025';
const RECAP = /\/s\/[^/]+\/recap$/;
const HOME = /\/s\/[^/]+$/;

const viewer = (testInfo: TestInfo): DevUser => {
	const uid = testInfo.project.name === 'desktop' ? 'dev-tariq' : 'dev-felipe';
	const user = readCast().users.find(candidate => candidate.uid === uid);

	expect(user, `${uid} is not in the seeded cast`).toBeDefined();
	return user!;
};

/** Into the season from the picker, the way a phone gets there. */
const openSeason = async (page: Page, user: DevUser) => {
	await openAs(page, user, '/seasons?browse=1');
	await page.getByRole('link', { name: new RegExp(SEASON) }).click();
};

const watchToTheEnd = async (page: Page) => {
	const next = page.getByRole('button', { name: 'Next' });

	while (await next.isEnabled()) await next.click();
};

test.describe('the season recap', () => {
	test('takes over the home screen of a season that is over, until it has been watched', async ({
		page,
	}, testInfo) => {
		await openSeason(page, viewer(testInfo));

		await expect(page).toHaveURL(RECAP);
		await expect(page.getByText(SEASON).first()).toBeVisible();

		await watchToTheEnd(page);
		await expect(page.getByText('See you next season')).toBeVisible();

		await page.getByRole('button', { name: 'Back' }).click();
		await expect(page).toHaveURL(HOME);
		await expect(page.getByRole('link', { name: /watch the season recap/i })).toBeVisible();

		// A fresh visit, past the once-a-session mark: only the profile can say
		// it has been watched now.
		await page.evaluate(() => window.sessionStorage.clear());
		await page.reload();
		await expect(page.getByRole('link', { name: /watch the season recap/i })).toBeVisible();
		await expect(page).toHaveURL(HOME);
	});

	test('can be watched again from the season home', async ({ page }, testInfo) => {
		await openSeason(page, viewer(testInfo));
		await expect(page).toHaveURL(HOME);

		await page.getByRole('link', { name: /watch the season recap/i }).click();

		await expect(page).toHaveURL(RECAP);
		await expect(page.getByRole('progressbar', { name: 'Recap progress' })).toBeVisible();
	});
});
