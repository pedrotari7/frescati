import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Navigation and the handful of controls more than one journey drives. */

/**
 * From the seasons list into the first season.
 *
 * `/` redirects to `/seasons` — picking a season needs the signed-in user, so
 * a server component cannot do it — and which seasons exist is the scenario's
 * business, so the first link is taken rather than an id written down here.
 */
export const openFirstSeason = async (page: Page): Promise<void> => {
	await page.goto('/seasons');

	const seasons = page.getByRole('link', { name: /./ }).filter({ hasNot: page.locator('nav a') });
	await expect(seasons.first()).toBeVisible();

	await page.locator('a[href^="/s/"]').first().click();
	await expect(page).toHaveURL(/\/s\/[^/]+/);
};

/** The In / Out pair, which appears on the hero card and the game screen. */
export const respondControl = (page: Page): { inButton: Locator; outButton: Locator } => ({
	inButton: page.getByRole('button', { name: /I'm in|Saving/ }).first(),
	outButton: page.getByRole('button', { name: /Can't make it|Saving/ }).first(),
});

/** Move to one of the season's tabs by its visible name. */
export const openTab = async (page: Page, name: RegExp): Promise<void> => {
	await page.getByRole('link', { name }).first().click();
};
