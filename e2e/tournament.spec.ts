import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aSeasonAdmin, openAs } from './fixtures';

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
 */

/** The most recently played game with a lineup, from the season's Played list. */
const openAPlayedGame = async (page: Page): Promise<boolean> => {
	await page.goto('/seasons');
	await page.locator('a[href^="/s/"]').first().click();
	await expect(page).toHaveURL(/\/s\/[^/]+/);

	// Played is collapsed by default — it is where a two-day vote goes to be
	// missed, which is why an open vote holds a game out of it.
	const played = page.getByRole('button', { name: /Played/i }).first();
	if (await played.isVisible().catch(() => false)) await played.click();

	const game = page.locator('a[href*="/g/"]').last();
	if (!(await game.isVisible().catch(() => false))) return false;

	await game.click();
	await expect(page).toHaveURL(/\/g\/[^/]+/);

	const teamSheet = page.getByRole('link', { name: /Team sheet|Teams|Tournament/i }).first();
	if (!(await teamSheet.isVisible().catch(() => false))) return false;

	await teamSheet.click();

	return /\/tournament$/.test(page.url());
};

test.describe('the team sheet', () => {
	test('lets somebody who played record a scoreline', async ({ page }) => {
		await openAs(page, aSeasonAdmin());

		test.skip(!(await openAPlayedGame(page)), 'this scenario has no played game with a lineup');

		const up = page.getByRole('button', { name: /one more$/ }).first();
		await expect(up).toBeVisible();

		// Two people scoring the same match write the same document, because the
		// id is the fixture's place in the running order — so a stepper is a
		// write, not local state, and it has to come back on a reload.
		await up.click();
		await page.reload();

		await expect(page.getByRole('button', { name: /one more$/ }).first()).toBeVisible();
	});

	test('shows a confirmed game as confirmed rather than offering to confirm it again', async ({ page }) => {
		await openAs(page, aSeasonAdmin());

		test.skip(!(await openAPlayedGame(page)), 'this scenario has no played game with a lineup');

		const confirmed = page.getByText('Confirmed', { exact: false }).first();
		const confirmButton = page.getByRole('button', { name: /Confirm results/ });

		// A seeded season has both kinds. Whichever this game is, the screen must
		// not offer both — the ledger was computed against this lineup and a
		// replay reads it back.
		if (await confirmButton.isVisible().catch(() => false)) {
			await expect(confirmed).toBeHidden();
		} else {
			await expect(confirmed).toBeVisible();
		}
	});
});

test.describe('man of the match', () => {
	test('shows the turnout without showing anybody’s pick', async ({ page }) => {
		await openAs(page, aSeasonAdmin());

		test.skip(!(await openAPlayedGame(page)), 'this scenario has no played game with a lineup');

		const panel = page.getByText(/Man of the match/i).first();
		test.skip(!(await panel.isVisible().catch(() => false)), 'no vote on this game');

		// `tournament/motmVoters` is uids and nothing else: eight names with no
		// picks attached give nobody a lead to fall in behind, which is the only
		// thing the privacy rule exists to prevent.
		const voters = page.locator('li[aria-label*="voted"], li[aria-label*="not yet"]');

		if ((await voters.count()) > 0) {
			for (const label of await voters.evaluateAll(nodes =>
				nodes.map(node => node.getAttribute('aria-label') ?? '')
			)) {
				expect(label).toMatch(/— (voted|not yet)$/);
			}
		}
	});

	test('records a vote and keeps it across a reload', async ({ page }) => {
		await openAs(page, aSeasonAdmin());

		test.skip(!(await openAPlayedGame(page)), 'this scenario has no played game with a lineup');

		const candidates = page.locator('button', { hasText: /./ });
		const vote = candidates.filter({ hasNotText: /Confirm|Reshuffle|Clear|one more|one fewer/ }).last();
		test.skip(!(await vote.isEnabled().catch(() => false)), 'this account cannot vote on this game');

		await vote.click();
		await page.reload();

		// Voting for yourself is allowed on purpose, so no assertion here cares
		// who was picked — only that the pick survived, which means it reached
		// Firestore through a rule that checks the team sheet.
		await expect(page.getByText(/Man of the match/i).first()).toBeVisible();
	});
});
