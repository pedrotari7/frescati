import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { DevUser } from './fixtures';
import { aMember, openAs, readCast } from './fixtures';
import { openSeasonAs } from './helpers';
import { AT } from './locators';

/**
 * Game day around the football: the programme before it and the full-time card
 * after it.
 *
 * The programme's ways in are kept to game day, and the seeded next game is days
 * away, so this opens it by its address, which works on any day on purpose. The
 * card takes over a season home, which every other spec stops it doing; here it
 * is let through. It writes nothing but this browser's own storage, so the two
 * viewports could share a player, and are kept apart anyway as `recap.spec` does,
 * so neither run can be the reason the other passed.
 */

const SUNDAY = 'Sunday Kickabout';
const FULL_TIME = /\/s\/[^/]+\/g\/[^/]+\/full-time$/;

const viewer = (testInfo: TestInfo): DevUser => {
	const uid = testInfo.project.name === 'desktop' ? 'dev-nina' : 'dev-elena';
	const user = readCast().users.find(candidate => candidate.uid === uid);

	expect(user, `${uid} is not in the seeded cast`).toBeDefined();
	return user!;
};

/** Into Sunday Kickabout from the picker, letting the card take over. */
const openSunday = async (page: Page, user: DevUser) => {
	await openAs(page, user, '/seasons?browse=1', { fullTime: true });
	await page
		.getByRole('link', { name: new RegExp(SUNDAY) })
		.first()
		.click();
};

test.describe('the matchday programme', () => {
	test('reads the odds and the form for the next game', async ({ page }) => {
		await openSeasonAs(page, aMember());

		await page.getByRole('link', { name: /see who's playing/i }).click();
		await expect(page).toHaveURL(AT.game);
		await page.goto(`${page.url()}/programme`);

		await expect(page.getByText('Chance of topping the table')).toBeVisible();

		const odds = page.getByRole('listitem', { name: /^Team [A-D], \d+%$/ });
		await expect(odds.first()).toBeVisible();

		const labels = await odds.evaluateAll(items => items.map(item => item.getAttribute('aria-label') ?? ''));
		const total = labels.reduce((sum, label) => sum + Number(/(\d+)%$/.exec(label)![1]), 0);
		expect(total, `the odds read ${labels.join(', ')}`).toBe(100);

		await expect(page.getByRole('region', { name: 'Form' })).toBeVisible();
	});
});

test.describe('the full-time card', () => {
	test('takes over once, lets go, and stays gone', async ({ page }, testInfo) => {
		await openSunday(page, viewer(testInfo));

		await expect(page).toHaveURL(FULL_TIME);
		await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

		await page.getByRole('button', { name: 'Done' }).click();
		await expect(page).toHaveURL(AT.season);

		await page.reload();
		await expect(page.getByRole('link', { name: /see who's playing/i })).toBeVisible();
		await expect(page).toHaveURL(AT.season);
	});

	test('saves the card as an image where the phone cannot share files', async ({ page }, testInfo) => {
		await openSunday(page, viewer(testInfo));
		await expect(page).toHaveURL(FULL_TIME);

		await page.evaluate(() =>
			Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
		);

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Share' }).click(),
		]);

		expect(download.suggestedFilename()).toMatch(/^full-time-.+\.png$/);
	});
});
