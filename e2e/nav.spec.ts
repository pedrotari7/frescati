import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aMember } from './fixtures';
import { openSeasonAs, openTab } from './helpers';
import { AT, gameLinks, playerLinks } from './locators';

/**
 * The way back out of a screen.
 *
 * Every screen declares its way out as a `backHref`, the parent in the
 * hierarchy, and for a long time the chevron pushed exactly that, wherever
 * somebody had come from. On the screens that hang under one parent nobody
 * notices. On the ones that don't it throws away the screen they were reading:
 * a player's profile is opened from a game's roster, a team sheet, the squad
 * list and the table, and all four of them landed back on the season's home
 * page. The kit register did the same thing one tab over.
 *
 * `AppHistory` is the half that decides, and it can only be checked here.
 * jsdom can prove it counts a push, a replace and a `popstate` correctly, which
 * is worth proving, but not that the counting matches what a browser and the
 * Next router actually do between two real screens, which is the whole claim.
 *
 * The same goes double for **which viewport draws the chevron at all**, which is
 * a media query and therefore invisible to a jsdom render. Desktop used to hide
 * it on every screen carrying tabs, on the grounds that the tabs were up there
 * instead, leaving a team sheet, a player and the kit register with no way back
 * whatsoever in an installed window, which has no browser chrome to fall back
 * on. So every journey below runs at both widths and drives the same control.
 *
 * **This spec writes nothing**, like `admin.spec.ts` and for the same reason:
 * the files here run in parallel against one seeded database, so a spec that
 * only ever navigates is one that can overlap with all of them.
 */

/** The chevron in the top bar. A button rather than a link, it moves the router. */
const backChevron = (page: Page) => page.getByRole('button', { name: 'Back' });

/**
 * Somebody on a list of players on whatever screen this is, opened.
 *
 * Deliberately not by name. The profiles subscription lands after the first
 * paint and re-sorts these lists, so a row read now is not the row clicked a
 * moment later, and none of this is about which player it is.
 */
const openAPlayer = async (page: Page): Promise<void> => {
	const player = playerLinks(page).first();

	await expect(player, 'no player to open on this screen').toBeVisible();
	await player.click();

	await expect(page).toHaveURL(AT.player);
};

/**
 * Where the top bar's tabs begin, in page coordinates.
 *
 * The first of them, because what matters is where the row starts: everything
 * to its left is the chevron slot and the fixed-width title column, and those
 * two are the whole of what could push it.
 */
const tabsStartAt = async (page: Page): Promise<number> => {
	const firstTab = page.locator('header nav a').first();

	await expect(firstTab, 'no tabs in the top bar').toBeVisible();

	return (await firstTab.boundingBox())!.x;
};

/** The first game on the season already open. Returns its URL. */
const openTheFirstGame = async (page: Page): Promise<string> => {
	const game = gameLinks(page).first();

	await expect(game, 'this season has no games on it').toBeVisible();
	await game.click();

	await expect(page).toHaveURL(AT.game);

	return page.url();
};

/** Into the season, then into a game on it. Returns the game's URL. */
const openAGame = async (page: Page): Promise<string> => {
	await openSeasonAs(page, aMember());

	return openTheFirstGame(page);
};

test.describe('the way back out of a screen', () => {
	// The reported bug, in the order it was reported: season, game, a player off
	// the roster, back, and back used to mean the season page, with the game
	// somebody was reading gone.
	test('returns to the game a player was opened from', async ({ page }) => {
		const game = await openAGame(page);

		await openAPlayer(page);

		await backChevron(page).click();

		await expect(page, 'the chevron went up to the season instead of back to the game').toHaveURL(game);
	});

	// The same thing one tab across, and the clearer half of it: a profile's
	// declared parent is the season's *Games* tab, so a squad list that came
	// back to itself cannot have been following the declared parent.
	test('returns to the squad list a player was opened from', async ({ page }) => {
		await openSeasonAs(page, aMember());

		await openTab(page, /^Club$/);
		await expect(page).toHaveURL(AT.club);

		const club = page.url();
		await openAPlayer(page);

		await backChevron(page).click();

		await expect(page, 'the chevron went to the Games tab rather than back to Club').toHaveURL(club);
	});

	// The boundary on the change above: drawn on desktop too is not drawn
	// everywhere. A tab root has nothing above it, and the tabs are how you leave
	// it, the season's home page is the one screen in the app that is nobody's
	// child.
	test("draws no chevron on a screen that is nobody's child", async ({ page }) => {
		await openSeasonAs(page, aMember());

		await expect(backChevron(page), 'the season home offered a way up out of itself').toHaveCount(0);
	});

	/**
	 * The price of drawing it up here, and the reason the empty case is a held
	 * slot rather than nothing at all.
	 *
	 * Above `lg` the tabs live in the top bar, to the right of the title column,
	 * and the whole layout is arranged so that nothing which comes and goes can
	 * move them. A chevron that simply appeared would put its own width in front
	 * of the title on every screen below a tab and take it away again on the way
	 * back, the tabs sliding sideways under the pointer each time.
	 */
	test('holds the tabs still between a screen with a way back and one without', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'below lg the tabs are in the bottom bar, not beside the title');

		await openSeasonAs(page, aMember());
		const onTheSeason = await tabsStartAt(page);

		await openTheFirstGame(page);

		await expect(backChevron(page), 'no chevron on a game above lg').toBeVisible();
		expect(await tabsStartAt(page), 'the tabs moved when the chevron appeared').toBeCloseTo(onTheSeason, 0);
	});

	/**
	 * A game opened cold, a notification tap, a pasted link, the first screen of
	 * the installed app. There is no screen behind this one, so the declared
	 * parent is the only answer there is, and a `router.back()` here would walk
	 * out of the app entirely.
	 *
	 * Reached by reloading a game the journey already found, so this is the same
	 * URL a push would have delivered, on a document with nothing behind it.
	 */
	test('goes up to the declared parent when nothing is behind the screen', async ({ page }) => {
		await openAGame(page);

		await page.reload();

		// The roster having rendered is the signal the app came back up signed
		// in, a chevron is drawn long before that, and on desktop not at all.
		await expect(playerLinks(page).first(), 'the game did not come back after a reload').toBeVisible();

		await backChevron(page).click();

		await expect(page, 'a cold-loaded game had somewhere to go back to').toHaveURL(AT.season);
	});
});
