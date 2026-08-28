import type { Locator, Page } from '@playwright/test';

/**
 * The shapes this app draws, named once.
 *
 * `fixtures.ts` says who you are and `helpers.ts` walks you from one screen to
 * the next. This is the layer under both: the handful of selectors and URLs
 * that more than one spec has to agree about.
 *
 * They are here because every one of them has already been got wrong somewhere,
 * and a duplicated locator is a fix that lands in one copy: the Played list's
 * control is a button beside the heading rather than the heading itself, a
 * screen's URL nests inside its parent's so a loose match passes everywhere, and
 * a Headless UI dialog reads as hidden while the sheet is plainly up. Each of
 * those is written down once below rather than three times in three files, two
 * of which will be the stale ones.
 */

/**
 * Where a journey has got to.
 *
 * Anchored at the end, all of them, and that is not tidiness: the paths nest, so
 * a game's URL contains its season's and a team sheet's contains the game's. An
 * unanchored `/\/s\/[^/]+/` is true on every screen in the app and would pass a
 * navigation that never happened.
 */
export const AT = {
	season: /\/s\/[^/]+$/,
	game: /\/s\/[^/]+\/g\/[^/]+$/,
	teamSheet: /\/tournament$/,
	squad: /\/members$/,
	kit: /\/kit$/,
	player: /\/u\/[^/]+$/,
	seasonAdmin: /\/admin$/,
	adminCalendar: /\/admin\/games$/,
} as const;

/**
 * The section of a screen under a given heading.
 *
 * Both the season's home page and the admin calendar are a column of these, and
 * which section a row came from is usually the whole question: `groupGames`
 * splits the calendar into four, so a test that means "the ones already played"
 * takes whatever the page drew first unless it says so.
 */
export const sectionUnder = (page: Page, heading: RegExp): Locator =>
	page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });

/**
 * Open a collapsed section.
 *
 * Played is collapsed by default on both screens that draw it, it is where a
 * two-day vote goes to be missed, which is why an open vote holds a game out of
 * it. The control is the **Show** button beside the heading; the heading itself
 * is an `h2` and was never a button, so a click on `Played` expanded nothing and
 * every row found afterwards came from the sections above it.
 */
export const expand = async (section: Locator): Promise<void> => {
	await section.getByRole('button', { name: 'Show' }).click();
};

/** Every link into a game, on this screen or in this section of it. */
export const gameLinks = (scope: Page | Locator): Locator => scope.locator('a[href*="/g/"]');

/**
 * Every link into somebody's record.
 *
 * A roster, a team sheet, the squad list and the table all draw them, which is
 * the whole reason the back chevron cannot simply go up: all four of those used
 * to land on the season's home page.
 */
export const playerLinks = (scope: Page | Locator): Locator => scope.locator('a[href^="/u/"]');

/**
 * The sheet on top of whatever is behind it.
 *
 * Wait on its *content* rather than on this, Headless UI's root is a zero-size
 * `relative` wrapper around a `fixed` panel, so Playwright reads the dialog
 * itself as hidden while the sheet is plainly up. `toBeHidden` on the way out is
 * a different question and is safe, which is why every caller closes on it.
 */
export const dialog = (page: Page): Locator => page.getByRole('dialog');

/**
 * The In / Out pair, which appears on the hero card and the game screen.
 *
 * Each half answers to three names. It asks ("I'm in"), it reports once it is
 * the answer ("You're in"), and it says `Saving` while the write is out. A
 * locator holding one of the three resolves to nothing for as long as the
 * button is in either of the others. The cost is that the
 * patterns overlap mid-write, the In button reading "Saving…" matches the Out
 * pattern as well, so `.first()` is doing real work: `RespondControl` draws In
 * first, so the earlier match is In whichever of them is busy. It self-corrects
 * either way, since the overlap lasts exactly as long as the round trip and
 * every assertion here retries.
 */
export const respondControl = (page: Page): { inButton: Locator; outButton: Locator } => ({
	inButton: page.getByRole('button', { name: /I'm in|You're in|Saving/ }).first(),
	outButton: page.getByRole('button', { name: /Can't make it|You're out|Saving/ }).first(),
});
