import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { escapeForRegExp, openAs, seasonsOf } from './fixtures';
import type { DevUser } from './fixtures';
import { AT } from './locators';

/**
 * Getting from one screen to the next.
 *
 * The verbs, in other words: `fixtures.ts` holds who you are and
 * `locators.ts` holds what a screen is made of. What lives here is a walk that
 * more than one journey starts with and that has a reason to be done in a
 * particular order, which is the whole of `openSeasonAs` below.
 */

/**
 * A season card on the picker: a link into a season carrying its status pill.
 *
 * The pill is what tells a card apart from the back link `PageShell` renders
 * when a season is already in scope, which points at `/s/…` too and would
 * otherwise be the first one found.
 *
 * Matched against the labels in `SEASON_STATUS_LABELS`, which is what the pill
 * shows. It used to look for the lowercase stored value, because that is what
 * the pill used to print.
 */
const seasonCards = (page: Page): Locator =>
	page.locator('a[href^="/s/"]').filter({ has: page.getByText(/^(Active|Draft|Archived)$/) });

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
 * that has, and the seeded scenario opens with a draft one, which has no games
 * and no kit because that is what a draft is. Every journey here needs a
 * calendar, and the kit rules check the signed-in player against `memberUids`,
 * so the season and the person have to be chosen together rather than one hoping
 * for the other.
 *
 * The link between them is the seeder's own hint, it names the seasons it put
 * each account on, and a card is labelled with that same name, so this survives
 * a change to the scenario, which an id written down here would not.
 *
 * `?browse=1` marks a deliberate visit: `/seasons` forwards straight into the
 * season when there is exactly one active one, and a helper that only works with
 * two of them breaks on the next scenario.
 */
export const openSeasonAs = async (page: Page, user: DevUser): Promise<void> => {
	const names = seasonsOf(user);
	expect(names, `${user.displayName} is on no season's roster: "${user.hint}"`).not.toHaveLength(0);

	await openAs(page, user, '/seasons?browse=1');

	await expect(seasonCards(page).first(), 'the seasons picker listed nothing').toBeVisible();

	// Still ordered by start date descending, so this is the most recent season
	// they are on that is being played.
	const season = seasonCards(page)
		.filter({ hasText: new RegExp(names.map(escapeForRegExp).join('|')) })
		.filter({ has: page.getByText('Active', { exact: true }) })
		.first();

	await expect(season, `no active season on ${user.displayName}'s roster: "${user.hint}"`).toBeVisible();

	await season.click();
	await expect(page).toHaveURL(AT.season);
};

/** Move to one of the season's tabs by its visible name. */
export const openTab = async (page: Page, name: RegExp): Promise<void> => {
	await page.getByRole('link', { name }).first().click();
};

/**
 * Into the books, which sit behind the Squad tab beside the kit register.
 *
 * Here rather than in one spec because two of them start with it, the dues
 * journey and the receipts one, and they are not allowed to disagree about where
 * the screen is: it is reached from a link on the squad page rather than from a
 * tab of its own, which is exactly the sort of thing that gets moved.
 */
export const openTheBooks = async (page: Page): Promise<void> => {
	await openTab(page, /^Squad$/);
	await page
		.getByRole('link', { name: /Finances/ })
		.first()
		.click();

	await expect(page).toHaveURL(AT.finances);
};
