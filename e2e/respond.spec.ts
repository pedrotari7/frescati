import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { aMember } from './fixtures';
import { openSeasonAs } from './helpers';
import { AT, respondControl, sectionUnder } from './locators';

/**
 * The loop the whole app exists for: somebody says they are in, and the
 * headcount everybody else is looking at moves.
 *
 * Four suites already cover pieces of this and none of them covers the join.
 * `counts` is written **only** by `onResponseWrite`, rules reject a client
 * write to it, so what happens between the tap and the number is a write
 * through the security rules, a background trigger that re-tallies the whole
 * collection, and an `onSnapshot` pushing the result back down. The frontend
 * tests mock the write away, the rules tests have no trigger behind them, and
 * the backend tests call the trigger by hand with an event nothing produced.
 *
 * Only a browser against the real emulators puts the three together, which is
 * also the only way to catch the failures that live in the gaps, a rule that
 * refuses the exact document the client sends, or a trigger listening on a path
 * the client no longer writes to.
 */

/** How long the headcount has to hold still, and for how many tries. */
const SETTLE_MS = 1_000;
const SETTLE_READS = 15;

/**
 * The headcount, once it has stopped moving.
 *
 * Two separate things make an early read wrong. The number arrives with the game
 * document, so for a moment the element is on screen with nothing in it, and
 * `Number('')` is a confident `0`, which is how a test came to assert that a game
 * with fourteen people in it would drop to none. Then every answer moves it a
 * second time: the write goes to Firestore, `onResponseWrite` recounts the whole
 * collection, and the result comes back down the listener, so throughout that
 * window the number on screen is still the one from before the tap.
 *
 * Waiting for it to hold still needs to know neither what the seed left this
 * player on nor how quick the trigger is that day.
 */
const settledHeadcount = async (page: Page): Promise<number> => {
	const headcount = page.getByTestId('headcount-playing');

	// A bare numeral, which waits out the empty render as well as the mount.
	await expect(headcount).toHaveText(/^\d+$/);

	let last: number | null = null;

	for (let read = 0; read < SETTLE_READS; read += 1) {
		const current = Number(await headcount.innerText());

		if (current === last) return current;

		last = current;
		await page.waitForTimeout(SETTLE_MS);
	}

	throw new Error(`the headcount never stopped moving, last read ${last}`);
};

/**
 * Put a control into the state a test needs it in, whichever one it is in now.
 *
 * Both controls this file drives are **toggles and not radio groups**, tapping
 * the answer already given withdraws it, and tapping a bell already on unfollows,
 * so a helper that tapped regardless would take somebody out of a game it had
 * been asked to put them in. It did, and that is what made every test after the
 * first one here fail for a reason none of them was about.
 *
 * Which attribute says so depends on the control: the In/Out pair are buttons
 * with `aria-pressed`, the bell is a `switch` with `aria-checked`. Both are
 * driven straight off the document as the listener has it, with no optimistic
 * state behind them, "Saving…" is the pending state and the button does not
 * move until the write has come back, so both are server truth. They just are
 * not there yet on arrival, which is what each caller waits out first.
 */
const ensureOn = async (control: Locator, attribute: 'aria-pressed' | 'aria-checked'): Promise<void> => {
	if ((await control.getAttribute(attribute)) !== 'true') await control.click();

	await expect(control).toHaveAttribute(attribute, 'true');
};

/** Get this player to the given answer, and wait for the count to agree. */
const answer = async (page: Page, status: 'in' | 'out'): Promise<number> => {
	await settledHeadcount(page);

	const { inButton, outButton } = respondControl(page);

	await ensureOn(status === 'in' ? inButton : outButton, 'aria-pressed');

	return settledHeadcount(page);
};

test.describe('answering the next game', () => {
	test('moves the headcount everybody else can see', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);

		const { inButton } = respondControl(page);
		const headcount = page.getByTestId('headcount-playing');
		await expect(headcount).toBeVisible();

		// Start from a known answer rather than assuming the seed left this
		// player undecided, which member `aMember()` picks depends on the
		// scenario, and several of them have already answered. Taken through
		// `answer` so the count has settled first: a baseline read while the
		// trigger is still catching up is the number from before this test.
		const baseline = await answer(page, 'out');

		await inButton.click();

		// The button moves when the response document comes back; the number
		// takes a second hop, through `onResponseWrite` re-tallying the whole
		// collection. That hop is the part nothing else in the repo tests.
		await expect(inButton).toHaveAttribute('aria-pressed', 'true');
		await expect(headcount).toHaveText(String(baseline + 1));
	});

	test('takes the headcount back down again', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);

		const playing = await answer(page, 'in');

		await respondControl(page).outButton.click();

		await expect(respondControl(page).outButton).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('headcount-playing')).toHaveText(String(playing - 1));
	});

	test('survives a reload, because it was written rather than remembered', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);

		// Out first, so the In that follows is a real change rather than a tap on
		// an answer this player had already given, which would survive a reload
		// for the wrong reason.
		await answer(page, 'out');
		await answer(page, 'in');

		await page.reload();

		await expect(respondControl(page).inButton).toHaveAttribute('aria-pressed', 'true');
	});

	test('carries the answer through to the game screen', async ({ page }) => {
		// The same response document read by a different screen through its own
		// listener, which is what catches a path that only one of them builds
		// correctly.
		const member = aMember();
		await openSeasonAs(page, member);

		await answer(page, 'out');
		await answer(page, 'in');

		await page
			.getByRole('link', { name: /See who's playing|Game details/ })
			.first()
			.click();

		await expect(page).toHaveURL(AT.game);
		await expect(respondControl(page).inButton.first()).toHaveAttribute('aria-pressed', 'true');
	});
});

/**
 * The bell, from the row rather than from the game's own screen.
 *
 * Following a game is one document whose *presence* is the whole subscription,
 * and the calendar reads every one of them through a single collection-group
 * query, which is a shape nothing else here exercises. The rules suite proves
 * the rule allows it and the frontend suite proves the row draws it, and both
 * of them would pass a query that Firestore refuses: a collection-group read is
 * allowed by proving every document it could return would pass, so a missing
 * `where` is a rule failure rather than a wrong answer, and it only happens
 * against a real database with real rules in front of it.
 */
test.describe('following a game from the calendar', () => {
	test('turns the bell on from a row, and the game screen agrees', async ({ page }) => {
		const member = aMember();
		await openSeasonAs(page, member);

		const coming = sectionUnder(page, /^Coming up$/);
		await expect(coming, 'this season has nothing further out than its next game').toBeVisible();

		// Found by the bell rather than by position. A called-off game carries
		// none, there is nothing left to hear about, and which row that is
		// depends on how far into the season the seed has got.
		const row = coming
			.locator('.glass-card')
			.filter({ has: page.getByRole('switch', { name: /notify/i }) })
			.first();
		const bell = row.getByRole('switch', { name: /notify/i });

		const href = await row.getByRole('link').getAttribute('href');
		expect(href, 'the row leads nowhere').toBeTruthy();

		// Through `ensureOn` for a subtler version of the same reason the answers
		// need it: the bell draws off until the watchers snapshot lands, so a tap
		// on whatever was found could be acting on a state one frame old.
		// Following is a `setDoc`, so following twice is following.
		await ensureOn(bell, 'aria-checked');

		await row.getByRole('link').click();
		await expect(page).toHaveURL(AT.game);
		expect(new URL(page.url()).pathname, 'landed on a different game than the bell was tapped on').toBe(href);

		// The same document read back by a different screen off its own listener,
		// which is what catches a query only one of the two builds correctly.
		await expect(page.getByRole('switch', { name: /notify/i })).toHaveAttribute('aria-checked', 'true');

		// And off again from the row it went on from. Waiting for the row to say
		// it is on first, because this is a fresh mount of the calendar and the
		// snapshot has to land before the tap means "off".
		await page.goBack();
		await expect(bell).toHaveAttribute('aria-checked', 'true');

		await bell.click();
		await expect(bell).toHaveAttribute('aria-checked', 'false');
	});
});
