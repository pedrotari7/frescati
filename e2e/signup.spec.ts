import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { formatSek } from '../shared/format';
import { signupShare } from '../shared/signup';
import { escapeForRegExp, openAs, someone, whoIs } from './fixtures';
import type { DevUser } from './fixtures';
import { openSeasonAs } from './helpers';
import { AT, dialog, dialogGone, gameRows, sectionUnder } from './locators';

/**
 * A season from its first form to its first held In.
 *
 * The one journey that crosses everything the sign-up feature added: the form
 * that copies a finished season, the card on a home screen asking everybody
 * whether they are joining, the admin's list of answers, and the callable that
 * turns the yeses into a squad, a bill and a calendar somebody can play on. The
 * rules refuse every one of those writes from a client that is not allowed to
 * make it, and `confirmSeason` is the only door out of draft, so nothing short
 * of this proves the halves meet.
 *
 * It writes only to its own season. It copies a source nothing else
 * reads (`Midsummer Cup`, held by the seeder for this file) into a season of its
 * own, named per project and per run. The two viewports run this same file
 * against one database, one after the other, so a fixed name would leave the
 * second run with two cards to tell apart.
 *
 * The season is quiet, so nothing here sends a notification. That is part of
 * the claim: a quiet confirm has to work with no push behind it.
 */

/** The seeder's reserved source. Its `finances.total` is what the new season charges. */
const SOURCE = 'Midsummer Cup';
const SOURCE_FEE = 12000;

/** What each of the two who say yes owes: the admin and one player. */
const SHARE = signupShare({ fees: { total: SOURCE_FEE, perGame: 0 } }, 2);

/** Straight to the season, off the picker, by the name on its card. */
const openTheSeason = async (page: Page, user: DevUser, name: string): Promise<void> => {
	await openAs(page, user, '/seasons?browse=1');
	await page.getByRole('link', { name: new RegExp(escapeForRegExp(name)) }).click();
	await expect(page).toHaveURL(AT.season);
};

/** The unanswered card for a season, found by its heading rather than by its place on the screen. */
const questionFor = (page: Page, name: string) => sectionUnder(page, new RegExp(`^${escapeForRegExp(name)}$`));

/** What the card folds to once there is an answer. */
const answerLine = (page: Page, line: string, name: string) => page.getByText(`${line} · ${name}`);

test.describe('signing up for the next season', () => {
	test('copies a season, collects the answers and starts it with a bill', async ({ page }, testInfo) => {
		test.setTimeout(150_000);

		const name = `Next ${testInfo.project.name} ${Date.now().toString(36)}`;

		const admin = someone(/^App admin/);
		const members = whoIs(/^Member of /);

		// The last two on the cast list. Nothing else here leans on them, and
		// neither is on the source or on the draft the seeder holds.
		const joiner = members[members.length - 1];
		const decliner = members[members.length - 2];

		expect(joiner && decliner, 'the cast has fewer than two members').toBeTruthy();

		await test.step('an admin starts the next season from a finished one, quietly', async () => {
			await openAs(page, admin, '/seasons?browse=1');

			await page.getByRole('link', { name: new RegExp(escapeForRegExp(SOURCE)) }).click();
			await expect(page).toHaveURL(AT.season);

			await page.getByRole('link', { name: 'Season admin' }).click();
			await expect(page).toHaveURL(AT.seasonAdmin);

			await page.getByRole('link', { name: /Start next season/ }).click();
			await expect(page).toHaveURL(/\/seasons\/new\?from=/);

			await page.getByPlaceholder('Autumn 2026').fill(name);

			const quiet = page.getByRole('switch', { name: "Don't notify anyone" });
			await quiet.click();
			await expect(quiet).toBeChecked();

			await page.getByRole('button', { name: 'Create season' }).click();
			await expect(page).toHaveURL(AT.seasonAdmin);

			// Nobody has answered, so nobody can be confirmed, the admin included.
			await expect(page.getByText(/^0 joining/)).toBeVisible();
			await expect(page.getByRole('button', { name: 'Confirm season' })).toBeDisabled();
		});

		await test.step("a player says Join on the season's own page", async () => {
			await openTheSeason(page, joiner, name);

			await questionFor(page, name).getByRole('button', { name: 'Join' }).click();
			await expect(answerLine(page, "You're in", name)).toBeVisible();
		});

		await test.step("another is asked on a different season's home, and says no", async () => {
			await openSeasonAs(page, decliner);

			const question = questionFor(page, name);
			await expect(question, 'the draft was not offered on the other season').toBeVisible();

			await question.getByRole('button', { name: 'Not this time' }).click();
			await expect(answerLine(page, 'You said not this time', name)).toBeVisible();
		});

		await test.step('the admin joins too, reads the answers and confirms', async () => {
			await openTheSeason(page, admin, name);

			await questionFor(page, name).getByRole('button', { name: 'Join' }).click();
			await expect(answerLine(page, "You're in", name)).toBeVisible();

			await page.getByRole('link', { name: 'Season admin' }).click();
			await expect(page).toHaveURL(AT.seasonAdmin);

			// Each answer under the group it belongs to, by name.
			await expect(page.getByText(/^2 joining/)).toBeVisible();
			await expect(
				page.getByRole('region', { name: 'Joining', exact: true }).getByText(joiner.displayName)
			).toBeVisible();
			await expect(
				page.getByRole('region', { name: 'Not joining', exact: true }).getByText(decliner.displayName)
			).toBeVisible();

			await page.getByRole('button', { name: 'Confirm season' }).click();

			const sheet = dialog(page);
			await expect(sheet.getByText(/2 players will make up the squad/)).toBeVisible();
			await expect(sheet.getByText(new RegExp(`Each owes ${escapeForRegExp(formatSek(SHARE))}`))).toBeVisible();

			await sheet.getByRole('button', { name: 'Confirm season' }).click();
			await dialogGone(page);

			await expect(page.getByText(`${name} is on with 2 members.`)).toBeVisible();
		});

		await test.step('the admin puts the games on the calendar', async () => {
			await page.getByRole('link', { name: /Generate/ }).click();
			await expect(page).toHaveURL(AT.adminCalendar);

			await page.getByRole('button', { name: /^Add \d+ games?$/ }).click();
			await expect(page.getByText(/^Added \d+ games?\.$/)).toBeVisible();
		});

		await test.step('the player is a member now, owes the entry fee and cannot say In yet', async () => {
			await openTheSeason(page, joiner, name);

			await expect(
				page.getByText(`You're in · ${name}`),
				'the question was still being asked of a season that has started'
			).toHaveCount(0);

			const notice = sectionUnder(page, /^What you owe$/);
			await expect(notice, `${joiner.displayName} owes an entry fee and the season said nothing`).toBeVisible();
			await expect(notice.getByText(formatSek(SHARE)).first()).toBeVisible();
			await expect(notice.getByText(/cannot sign up for another game/)).toBeVisible();

			const unanswered = gameRows(sectionUnder(page, /^Coming up$/))
				.filter({ hasText: 'No answer' })
				.first();

			await expect(unanswered, 'no game on the new season is open and unanswered').toBeVisible();
			await expect(
				unanswered.getByRole('button', { name: /I'm in/ }),
				'the first In was not held'
			).toBeDisabled();
			await expect(unanswered.getByRole('button', { name: /Can't make it/ })).toBeEnabled();
		});
	});
});
