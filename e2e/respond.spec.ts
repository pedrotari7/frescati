import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { aMember, aSeasonAdmin } from './fixtures';
import { openSeasonAs } from './helpers';
import { AT, NO_PROFILE_YET, dialogGone, gameRows, respondControl, sectionUnder } from './locators';

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
 * The bell **is a toggle**: tapping one already on unfollows, so a helper that
 * tapped regardless would unfollow the game it had been asked to follow. It
 * did, and that is what made every test after the first one here fail for a
 * reason none of them was about. The In/Out pair is a choice between two
 * answers rather than a toggle, so a wasted tap there is only a wasted tap, but
 * reading the state first is what makes this helper right for both.
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

	test('holds the answer when the same one is tapped again', async ({ page }) => {
		// The tap that reads as "am I in?". It used to delete the response, which
		// takes the player out of the headcount and starts the reminders again,
		// and nothing on screen said it would.
		const member = aMember();
		await openSeasonAs(page, member);

		const playing = await answer(page, 'in');

		await respondControl(page).inButton.click();

		// Through `settledHeadcount` rather than a bare read. The count this
		// asserts has not moved is the count it already held, so a read taken
		// straight after the tap passes before a withdrawal would have made it
		// back down the listener, which is the regression this is here for.
		expect(await settledHeadcount(page)).toBe(playing);
		await expect(respondControl(page).inButton).toHaveAttribute('aria-pressed', 'true');
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
		const row = gameRows(coming)
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

/**
 * A season admin answering on somebody else's behalf.
 *
 * Here rather than in `admin.spec.ts`, which writes nothing on purpose, because
 * this **is** a write to the next game's responses and that game is this file's.
 * Two specs moving the same roster in parallel is exactly what the split
 * between them exists to stop.
 *
 * It is worth a browser for the reason every other journey here is: the write
 * goes to a document the signed-in player does not own, through the one rule in
 * the app that allows that. The rules suite proves the rule says yes, the
 * frontend suite proves the sheet calls the handler, and neither of them sends
 * the document the client actually builds. `setResponse` carries `respondedAt`,
 * an admin's `confirmOverride` and an admin's `absent` through untouched, and
 * every one of those is a key the rule bounds.
 */

/** Everybody in one roster group an admin can answer for, by name. */
const answerableIn = async (section: Locator): Promise<string[]> =>
	section
		.getByRole('button', { name: /^Answer for / })
		.evaluateAll(buttons =>
			buttons.map(button => (button.getAttribute('aria-label') ?? '').slice('Answer for '.length))
		);

/**
 * Put one named person on one answer, through the sheet and the dialog behind
 * it.
 *
 * By name rather than by row, for the reason the kit handover learned: the
 * roster re-sorts when the profiles subscription lands, so a button found by
 * position hands the answer to whoever sorted first.
 *
 * The answer they already hold stays in the sheet, disabled, so a request for
 * the one they are on is the state the caller asked for rather than a miss.
 */
const answerFor = async (page: Page, displayName: string, answer: 'in' | 'out'): Promise<void> => {
	await page.getByRole('button', { name: `Answer for ${displayName}` }).click();

	const choice = page.getByRole('button', { name: answer === 'in' ? "They're in" : "They're out" });
	await expect(choice).toBeVisible();

	if (await choice.isDisabled()) {
		await page.getByRole('button', { name: 'Cancel' }).click();
		await dialogGone(page);

		return;
	}

	await choice.click();

	// Nothing is written until this lands. The dialog is the whole guard on a
	// control that writes an answer in somebody else's name.
	await page.getByRole('button', { name: answer === 'in' ? 'Say they are in' : 'Say they are out' }).click();
	await dialogGone(page);
};

test.describe('answering for somebody else', () => {
	test('moves one member out of the squad and back into it', async ({ page }) => {
		const admin = aSeasonAdmin();
		await openSeasonAs(page, admin);

		await page
			.getByRole('link', { name: /See who's playing|Game details/ })
			.first()
			.click();
		await expect(page).toHaveURL(AT.game);

		const squad = sectionUnder(page, /^Squad in$/);
		await expect(squad, "nobody has said they are in on this season's next game").toBeVisible();

		// Every name on this roster is a join against the profiles subscription,
		// and these buttons are labelled with one, so none of them is right yet.
		await expect(page.getByText(NO_PROFILE_YET)).toHaveCount(0);

		// Out of the squad rather than the extras, so both halves of the journey
		// land in a group this test can name: an extra who is out drops off the
		// roster entirely, and an extra who is in is not in the squad.
		const [target] = (await answerableIn(squad)).filter(name => name !== admin.displayName);

		if (!target) throw new Error(`no row on this squad ${admin.displayName} can answer for`);

		await answerFor(page, target, 'out');
		await expect(sectionUnder(page, /^Out$/).getByText(target)).toBeVisible();

		await answerFor(page, target, 'in');
		await expect(squad.getByText(target)).toBeVisible();
	});
});
