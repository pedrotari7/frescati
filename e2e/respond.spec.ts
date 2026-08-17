import { expect, test } from '@playwright/test';
import { aMember, openAs } from './fixtures';
import { openFirstSeason, respondControl } from './helpers';

/**
 * The loop the whole app exists for: somebody says they are in, and the
 * headcount everybody else is looking at moves.
 *
 * Four suites already cover pieces of this and none of them covers the join.
 * `counts` is written **only** by `onResponseWrite` — rules reject a client
 * write to it — so what happens between the tap and the number is a write
 * through the security rules, a background trigger that re-tallies the whole
 * collection, and an `onSnapshot` pushing the result back down. The frontend
 * tests mock the write away, the rules tests have no trigger behind them, and
 * the backend tests call the trigger by hand with an event nothing produced.
 *
 * Only a browser against the real emulators puts the three together, which is
 * also the only way to catch the failures that live in the gaps — a rule that
 * refuses the exact document the client sends, or a trigger listening on a path
 * the client no longer writes to.
 */

test.describe('answering the next game', () => {
	test('moves the headcount everybody else can see', async ({ page }) => {
		await openAs(page, aMember());
		await openFirstSeason(page);

		const { inButton, outButton } = respondControl(page);
		const headcount = page.getByTestId('headcount-playing');
		await expect(headcount).toBeVisible();

		// Start from a known answer rather than assuming the seed left this
		// player undecided — which member `aMember()` picks depends on the
		// scenario, and several of them have already answered.
		if ((await inButton.getAttribute('aria-pressed')) === 'true') {
			await outButton.click();
			await expect(outButton).toHaveAttribute('aria-pressed', 'true');
		}

		const baseline = Number(await headcount.innerText());

		await inButton.click();

		// The button flips optimistically; the number does not. This is the
		// trigger's answer arriving back down the listener, which is the part
		// nothing else in the repo tests.
		await expect(inButton).toHaveAttribute('aria-pressed', 'true');
		await expect(headcount).toHaveText(String(baseline + 1));
	});

	test('takes the headcount back down again', async ({ page }) => {
		await openAs(page, aMember());
		await openFirstSeason(page);

		const { inButton, outButton } = respondControl(page);
		const headcount = page.getByTestId('headcount-playing');

		await inButton.click();
		await expect(inButton).toHaveAttribute('aria-pressed', 'true');
		const playing = Number(await headcount.innerText());

		await outButton.click();

		await expect(outButton).toHaveAttribute('aria-pressed', 'true');
		await expect(headcount).toHaveText(String(playing - 1));
	});

	test('survives a reload, because it was written rather than remembered', async ({ page }) => {
		await openAs(page, aMember());
		await openFirstSeason(page);

		const { inButton } = respondControl(page);
		await inButton.click();
		await expect(inButton).toHaveAttribute('aria-pressed', 'true');

		await page.reload();

		await expect(respondControl(page).inButton).toHaveAttribute('aria-pressed', 'true');
	});

	test('carries the answer through to the game screen', async ({ page }) => {
		// The same response document read by a different screen through its own
		// listener — which is what catches a path that only one of them builds
		// correctly.
		await openAs(page, aMember());
		await openFirstSeason(page);

		await respondControl(page).inButton.click();
		await expect(respondControl(page).inButton).toHaveAttribute('aria-pressed', 'true');

		await page
			.getByRole('link', { name: /See who's playing|Game details/ })
			.first()
			.click();

		await expect(page).toHaveURL(/\/s\/[^/]+\/g\/[^/]+$/);
		await expect(respondControl(page).inButton.first()).toHaveAttribute('aria-pressed', 'true');
	});
});
