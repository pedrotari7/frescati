import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { escapeForRegExp, openAs, seasonsOf } from './fixtures';
import type { DevUser } from './fixtures';

/** Navigation and the handful of controls more than one journey drives. */

/**
 * A season card on the picker: a link into a season carrying its status pill.
 *
 * The pill is what tells a card apart from the back link `PageShell` renders
 * when a season is already in scope, which points at `/s/…` too and would
 * otherwise be the first one found.
 */
const seasonCards = (page: Page): Locator =>
	page.locator('a[href^="/s/"]').filter({ has: page.getByText(/^(active|draft|archived)$/) });

/**
 * Sign in as somebody and go straight into a season they play in.
 *
 * Signing in **on the picker** rather than on `/` and navigating afterwards, and
 * that is the whole reason this does both jobs. A `page.goto` after signing in is
 * a full reload: the bundle boots again, Firebase Auth restores the session from
 * IndexedDB, and the write that put it there had not necessarily finished. Losing
 * that race lands the next page on the sign-in screen, which looked from here
 * exactly like a season list that came back empty. Done this way there is one
 * page load in the whole journey and every step after it is the client-side
 * navigation a phone actually does.
 *
 * Which season is deliberately not the first card. The list is ordered by start
 * date descending, so a season that has not started yet sorts above every season
 * that has — and the seeded scenario opens with a draft one, which has no games
 * and no kit because that is what a draft is. Every journey here needs a
 * calendar, and the kit rules check the signed-in player against `memberUids`,
 * so the season and the person have to be chosen together rather than one hoping
 * for the other.
 *
 * The link between them is the seeder's own hint — it names the seasons it put
 * each account on, and a card is labelled with that same name — so this survives
 * a change to the scenario, which an id written down here would not.
 *
 * `?browse=1` marks a deliberate visit: `/seasons` forwards straight into the
 * season when there is exactly one active one, and a helper that only works with
 * two of them breaks on the next scenario.
 */
export const openSeasonAs = async (page: Page, user: DevUser): Promise<void> => {
	const names = seasonsOf(user);
	expect(names, `${user.displayName} is on no season's roster — "${user.hint}"`).not.toHaveLength(0);

	await openAs(page, user, '/seasons?browse=1');

	await expect(seasonCards(page).first(), 'the seasons picker listed nothing').toBeVisible();

	// Still ordered by start date descending, so this is the most recent season
	// they are on that is being played.
	const season = seasonCards(page)
		.filter({ hasText: new RegExp(names.map(escapeForRegExp).join('|')) })
		.filter({ has: page.getByText('active', { exact: true }) })
		.first();

	await expect(season, `no active season on ${user.displayName}'s roster — "${user.hint}"`).toBeVisible();

	await season.click();
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
