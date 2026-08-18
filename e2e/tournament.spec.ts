import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aSeasonAdmin, readCast, signInAs } from './fixtures';
import { openSeasonAs } from './helpers';

/**
 * Scoring a game and confirming it — the longest chain in the app, and the one
 * assembled from the most separately-tested parts.
 *
 * A score is written by anybody holding a response on the game, straight to
 * Firestore. Confirming it runs `finaliseTournament`, which computes the
 * standings, writes the rating ledger, moves every player's career Elo, opens
 * the man-of-the-match vote and notifies the lineup. Each half of that is
 * covered: `shared/` proves the maths, the backend suite proves the callable,
 * the rules suite proves who may write a scoreline. What none of them can show
 * is a browser going from a stepper to a confirmed result — the client calling
 * the real callable, the callable reading documents the client actually wrote,
 * and the answer arriving back on the screen.
 *
 * The vote is the part worth reaching. Confirming opens it, which is a state
 * that only exists after a real confirmation, and `MotmPanel` renders it from
 * three documents whose read permissions differ from each other — your own
 * vote, the published totals, and the turnout in between.
 *
 * Nothing here is allowed to skip. A guard that steps over a game it could not
 * find reports green for a suite that ran nothing, which is how this spec sat
 * silently passing against a season with no games in it at all.
 */

/**
 * The section of the season's home screen under a given heading.
 *
 * `groupGames` splits the calendar into four and the tests want two different
 * ones — the game still being voted on, and the ones that are done — so which
 * section a link came from is the whole question.
 */
const sectionUnder = (page: Page, heading: RegExp) =>
	page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });

/**
 * The most recent played game with a lineup.
 *
 * Played is collapsed by default — it is where a two-day vote goes to be missed,
 * which is why an open vote holds a game out of it. The control is the **Show**
 * button beside the heading; the heading itself is an `h2` and was never a
 * button, so a click on `Played` expanded nothing and every game link found
 * afterwards came from the sections above it.
 */
const openAPlayedGame = async (page: Page): Promise<void> => {
	const section = sectionUnder(page, /^Played \(/);
	await expect(section, 'this season has played no games').toBeVisible();

	await section.getByRole('button', { name: 'Show' }).click();

	const games = section.locator('a[href*="/g/"]');
	await expect(games.first(), 'the Played list expanded to nothing').toBeVisible();

	// Reversed by `groupGames`, so this walks back from the most recent. Not
	// every played game has a lineup: a cancelled one has none, and a turnout
	// short of eight is not a tournament.
	const hrefs = await games.evaluateAll(nodes => nodes.map(node => node.getAttribute('href') ?? ''));

	for (const href of hrefs) {
		await page.goto(href);

		const teamSheet = page.getByRole('link', { name: /Team sheet|Teams|Tournament/i }).first();
		const hasLineup = await teamSheet
			.waitFor({ state: 'visible', timeout: 5_000 })
			.then(() => true)
			.catch(() => false);

		if (!hasLineup) continue;

		await teamSheet.click();
		await expect(page).toHaveURL(/\/tournament$/);

		return;
	}

	throw new Error(`no played game here has a lineup — looked at ${hrefs.length}`);
};

/**
 * The game whose vote is still running.
 *
 * Its own group, not a corner of Played: a finished game only reaches the last
 * list once its window is gone. The seeded scenario pins one open on purpose,
 * because the voting screen can otherwise only be seen by confirming a game by
 * hand — and the row already links to the team sheet, which is where the vote is
 * and where the notification lands.
 */
const openTheVotingGame = async (page: Page): Promise<void> => {
	// Its heading is the question, not the state: "Man of the match", above the
	// games still to come, because it is the only thing on that screen with a
	// deadline on it.
	const section = sectionUnder(page, /^Man of the match$/);
	await expect(section, 'no game in this season has a vote open').toBeVisible();

	await section.locator('a[href*="/g/"]').first().click();
	await expect(page).toHaveURL(/\/tournament$/);
};

test.describe('the team sheet', () => {
	test('lets somebody who played record a scoreline', async ({ page }) => {
		const admin = aSeasonAdmin();
		await openSeasonAs(page, admin);
		await openAPlayedGame(page);

		const up = page.getByRole('button', { name: /one more$/ }).first();
		await expect(up).toBeVisible();

		// Which side the first stepper belongs to is the fixture's business, so
		// the label is read off the control rather than assumed to be Team A.
		const label = (await up.getAttribute('aria-label'))!.replace(/ one more$/, '');
		const score = page.getByTestId(`score-${label}`).first();

		// Wait for the number to be *there* before reading it. The stepper renders
		// before the match document arrives, and an empty read is `Number('')`,
		// which is a confident `0` — so this asked a 5–3 game to become 1–0 and
		// waited out its timeout watching it go to 6. A match nobody has played
		// reads as an en dash, which is the third state and not a zero.
		await expect(score).toHaveText(/^(\d+|–)$/);

		const before = Number((await score.innerText()).replace('–', '0'));

		// Two people scoring the same match write the same document, because the
		// id is the fixture's place in the running order — so a stepper is a
		// write, not local state, and the number itself has to come back on a
		// reload. Asserting only that the button is still there would pass
		// against a screen that never wrote anything.
		await up.click();
		await expect(score).toHaveText(String(before + 1));

		await page.reload();

		await expect(page.getByTestId(`score-${label}`).first()).toHaveText(String(before + 1));
	});

	test('shows a confirmed game as confirmed rather than offering to confirm it again', async ({ page }) => {
		const admin = aSeasonAdmin();
		await openSeasonAs(page, admin);
		await openAPlayedGame(page);

		// Exact, and that is the point: the *unconfirmed* screen carries the
		// sentence "Nothing counts towards anyone's rating until this is
		// confirmed", which a substring match finds case-insensitively — so the
		// loose locator reported every game as confirmed, including the one
		// offering to confirm it. The pill is the only thing that says only this.
		const confirmed = page.getByText('Confirmed', { exact: true }).first();
		const confirmButton = page.getByRole('button', { name: /Confirm results/ });

		// `isVisible` is an instant check that waits for nothing, so branching on
		// it straight off a navigation asks the question before the screen has
		// answered it — and "not confirmed yet" and "not drawn yet" look the same.
		// Wait for whichever of the two this game is to appear first.
		await expect(confirmButton.or(confirmed), 'the team sheet showed neither state').toBeVisible();

		// A seeded season has both kinds. Whichever this game is, the screen must
		// not offer both — the ledger was computed against this lineup and a
		// replay reads it back.
		if (await confirmButton.isVisible()) {
			await expect(confirmed).toBeHidden();
		} else {
			await expect(confirmed).toBeVisible();
		}
	});
});

test.describe('man of the match', () => {
	test('shows the turnout without showing anybody’s pick', async ({ page }) => {
		const admin = aSeasonAdmin();
		await openSeasonAs(page, admin);
		await openTheVotingGame(page);

		await expect(page.getByText(/Man of the match/i).first()).toBeVisible();

		// `tournament/motmVoters` is uids and nothing else: eight names with no
		// picks attached give nobody a lead to fall in behind, which is the only
		// thing the privacy rule exists to prevent. Drawn only while the vote is
		// open, which is why this asks the voting game rather than a played one —
		// against a decided game the list is empty and the check is vacuous.
		const voters = page.locator('li[aria-label*="voted"], li[aria-label*="not yet"]');
		await expect(voters.first(), 'the turnout strip drew nobody').toBeVisible();

		for (const label of await voters.evaluateAll(nodes =>
			nodes.map(node => node.getAttribute('aria-label') ?? '')
		)) {
			expect(label).toMatch(/— (voted|not yet)$/);
		}
	});

	test('records a vote and keeps it across a reload', async ({ page }) => {
		const admin = aSeasonAdmin();
		await openSeasonAs(page, admin);
		await openTheVotingGame(page);

		// Only the lineup may vote — the rules check the team sheet at both ends,
		// so an admin who sat this one out is being told, not asked. Rather than
		// stepping over that, become somebody the panel is actually offering a
		// ballot to: the lineup is on screen, and every name in it is a seeded
		// account.
		// `.last()` is the innermost match, so this is the panel rather than
		// anything that happens to wrap it. Only the ballot has buttons in its
		// rows — the turnout strip below it is avatars and `aria-label`s.
		const panel = sectionUnder(page, /^Man of the match$/).last();
		const ballot = panel.locator('li button');

		// `evaluateAll` does not wait for anything: called before the panel has
		// drawn it returns `[]`, which reads back as a lineup with nobody in it.
		await expect(ballot.first(), 'the ballot listed nobody').toBeVisible();

		const names = await ballot.evaluateAll(nodes => nodes.map(node => node.textContent?.trim() ?? ''));

		const player = readCast().users.find(user => names.some(name => name.includes(user.displayName)));
		expect(player, `no seeded account in this lineup — ${names.join(', ')}`).toBeTruthy();

		await signInAs(page, player!);
		await expect(page).toHaveURL(/\/tournament$/);

		// Somebody they have not already picked. Like the In/Out pair, the ballot
		// is a toggle — tapping your own pick takes it back — and the seeded game
		// has votes in it already, so the first row is quite often theirs.
		// Withdrawing a vote and then asserting one survived the reload is a test
		// that can only fail.
		await expect(ballot.first(), `${player!.displayName} was offered no ballot`).toBeEnabled();

		const pressed = await ballot.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed')));
		const unpicked = pressed.findIndex(state => state !== 'true');
		expect(unpicked, 'every name on the ballot was already picked').toBeGreaterThan(-1);

		// By position, not by "the row that isn't pressed": that describes the
		// button before the tap and a *different* button after it, so the
		// assertion below would follow the locator onto the next name and wait out
		// its timeout on one nobody had voted for. The order holds still while the
		// vote is open — `MotmPanel` only re-sorts by count once it is decided.
		const vote = ballot.nth(unpicked);

		await vote.click();
		await expect(vote).toHaveAttribute('aria-pressed', 'true');

		await page.reload();

		// Voting for yourself is allowed on purpose, so no assertion here cares
		// who was picked — only that the pick survived, which means it reached
		// Firestore through a rule that checks the team sheet.
		await expect(panel.locator('li button[aria-pressed="true"]')).toHaveCount(1);
	});
});
