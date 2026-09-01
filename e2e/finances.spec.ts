import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { aSeasonAdmin, escapeForRegExp, readCast, signInAs, someone } from './fixtures';
import type { DevUser } from './fixtures';
import { openSeasonAs, openTab, openTheBooks } from './helpers';
import { AT, NO_PROFILE_YET, sectionUnder } from './locators';

/**
 * The season's books: raising the charges, reporting a payment, paying, and what
 * an unpaid one does to the rest of the season.
 *
 * Four claims here, and none of them can be made anywhere else.
 *
 * A charge is a document an admin raises rather than a sum worked out on the
 * fly, and the whole safety of that rests on the document id being derived from
 * what the charge is for. A second press writes the same ids over the same
 * charges and changes nothing; a random id would charge the squad twice. That is
 * a claim about Firestore, so no unit test can make it, and the sweep behind the
 * button is the one place in the app that reads with `getDocs` instead of
 * subscribing, which is a second reason to drive it against a real database.
 *
 * Reporting a payment is the other half. The pill flips because the stored status
 * came back down the listener, not because a button remembered being pressed.
 *
 * The Swish button is drawn under `pointer: coarse`, a media query rather than a
 * sniffed user agent, and a media query is invisible to a jsdom render for the
 * same reason `nav.spec.ts` exists. The QR carries the same link and has to be
 * there at both widths, since anybody can point a phone at a laptop screen. The
 * button must not appear on a desktop, where the link only reaches Swish's
 * download page.
 *
 * The fourth is what an unsettled charge does to the season it was raised in.
 * The notice and the held In button are drawn off the dues listener, and the
 * rule behind them reads a `debtors` marker a Cloud Function writes, so the two
 * are a trigger's round trip apart on purpose: a screen that waited for the
 * marker would offer a live button for that whole window and have the write
 * refused. Only a real database with real triggers puts the charge, the trigger
 * and the two listeners in one place.
 *
 * **This spec writes**, to the dues of two seasons and to nothing else, which is
 * what keeps it disjoint from the five files it runs beside. That is also why
 * the locked button below is never tapped once it comes back: a response written
 * from here moves a headcount `respond.spec.ts` is asserting a delta against,
 * and what the rule does with the write is `rules/firestore.test.ts`'s claim.
 */

/**
 * The one seeded season with fees set and no charges raised.
 *
 * Named, unusually for this directory, because it is the fixture: the state
 * "nobody has opened the books yet" stops existing the first time anybody presses
 * the button, so the seeder holds one season in it on purpose and the sweep
 * journey below is about that season or about nothing. It is asserted rather than
 * assumed, since `openSeasonAs` opens the most recently started active season on
 * a roster and a scenario change could move this admin onto a swept one.
 */
const UNSWEPT_SEASON = 'Sunday Kickabout';

/** Its admin, whoever the scenario has put in charge of it. */
const itsAdmin = (): DevUser => someone(new RegExp(`Admin of [^·]*${escapeForRegExp(UNSWEPT_SEASON)}`));

/**
 * Who owes what, rather than the copy of it above that shows you only your own.
 * Both are the same component, so the section is the only thing telling them
 * apart, and the admin controls are on this one.
 */
const theBook = (page: Page): Locator => sectionUnder(page, /^Who owes what$/);

/** One person's row. The rows are the only thing in the book that expands. */
const bookRows = (book: Locator): Locator => book.locator('button[aria-expanded]');

/**
 * A row read as a person rather than as a position.
 *
 * The name comes off the avatar's `title` and not the row's text, because
 * somebody without a picture draws their initials instead and `innerText` reads
 * back as "TL\nTobias Lind", which matches nothing.
 */
const nameOn = async (row: Locator): Promise<string> => (await row.locator('[title]').first().getAttribute('title'))!;

/** The row belonging to that person, wherever the book has since moved it to. */
const rowFor = (page: Page, name: string): Locator =>
	bookRows(theBook(page)).filter({ has: page.locator(`[title=${JSON.stringify(name)}]`) });

/** Every row in the book with something still to pay on it. */
const rowsOwing = (page: Page): Locator => bookRows(theBook(page)).filter({ hasText: /owing/ });

/**
 * Wait for the book to know who these people are.
 *
 * A name read before this is `NO_PROFILE_YET`, which is every row at once, and
 * the aria-labels on the settle controls carry the name, so a label captured
 * early describes a control that no longer exists a moment later.
 */
const namesHaveLanded = async (page: Page): Promise<void> => {
	await expect(rowsOwing(page).first(), 'nobody in this season owes anything').toBeVisible();
	await expect(theBook(page).getByText(NO_PROFILE_YET), 'the profiles never landed').toHaveCount(0);
};

/**
 * Mark every charge under one person paid, one at a time.
 *
 * The count is read back between clicks rather than counted once and clicked
 * that many times. Settling re-sorts the book, so a set of handles captured up
 * front points at controls that have since been redrawn, and waiting for the
 * count to drop is what makes each click a stored status coming back down the
 * listener rather than a button that has been pressed.
 */
const settleEverything = async (page: Page, name: string): Promise<void> => {
	await rowFor(page, name).click();

	const owing = theBook(page).getByRole('button', { name: new RegExp(`^Mark ${escapeForRegExp(name)}'s .* paid$`) });

	await expect(owing.first(), `nothing owing under ${name}`).toBeVisible();

	for (let left = await owing.count(); left > 0; left = await owing.count()) {
		await owing.first().click();
		await expect(owing, `a charge of ${name}'s did not settle`).toHaveCount(left - 1);
	}
};

/**
 * A game still to come that this player has not answered.
 *
 * Not the next one, whose answer the seeder leaves to chance. An In already
 * given is deliberately left live, because draining it would say somebody had
 * been dropped from a game they are still playing in, so the hero is not
 * reliably a half that a debt takes. A row carrying "No answer" is one where it
 * is, and the same row is there before and after the charge is settled.
 */
const unanswered = (page: Page): Locator =>
	sectionUnder(page, /^Coming up$/)
		.locator('.glass-card')
		.filter({ hasText: 'No answer' })
		.first();

/** What the sweep reports, as a sentence, either way round. */
const SWEEP_RESULT = /^(Every charge that should exist already does\.|(\d+) charges? (?:is|are) missing\.)$/;

/**
 * Press "Check what is missing" and say how many it found.
 *
 * The count comes back rather than being asserted here, because what the callers
 * want to know differs run to run: the first pass through a seeded database finds
 * the whole season missing, and the second finds nothing, and both are the same
 * assertion about derived ids.
 */
const checkWhatIsMissing = async (page: Page): Promise<number> => {
	await page.getByRole('button', { name: 'Check what is missing' }).click();

	const line = page.getByText(SWEEP_RESULT);
	await expect(line, 'the sweep never said what it found').toBeVisible();

	const [, , count] = SWEEP_RESULT.exec((await line.innerText()).trim()) ?? [];

	return Number(count ?? 0);
};

test.describe('the season books', () => {
	test('open off the Club tab and hand the chevron back to it', async ({ page }) => {
		await openSeasonAs(page, aSeasonAdmin());

		await openTab(page, /^Club$/);
		await expect(page).toHaveURL(AT.club);

		const club = page.url();

		await page
			.getByRole('link', { name: /Finances/ })
			.first()
			.click();
		await expect(page).toHaveURL(AT.finances);

		// Both sides of it, which is the screen anybody in the squad gets: the
		// season's bill on one card and the extras' money on the other. They are
		// not the same shape and the two ids are how a test tells them apart.
		await expect(page.getByTestId('season-shortfall')).toBeVisible();
		await expect(page.getByTestId('equipment-balance')).toBeVisible();

		await page.getByRole('button', { name: 'Back' }).click();

		await expect(page, 'the chevron went up to the season instead of back to Club').toHaveURL(club);
	});

	test('raise every charge that is missing, and nothing at all on the next sweep', async ({ page }) => {
		await openSeasonAs(page, itsAdmin());
		await openTheBooks(page);

		await expect(
			page.getByText(UNSWEPT_SEASON).first(),
			`this admin landed on a season other than ${UNSWEPT_SEASON}, so there is nothing here to raise`
		).toBeVisible();

		const missing = await checkWhatIsMissing(page);
		const raise = page.getByRole('button', { name: /^Raise/ });

		if (missing > 0) {
			// The count is on the button before it is pressed, because "raise 43
			// charges" is not a thing to find out you have done.
			await expect(raise).toHaveText(`Raise ${missing}`);

			await raise.click();

			// Transient, and the only thing that says how many went in. Asserted
			// with the number the check reported, so this is the button raising what
			// it offered to rather than some other amount.
			await expect(page.getByRole('status')).toContainText(`Raised ${missing} charge`);
		}

		// A reload rather than a second press straight away, for two reasons. The
		// charges have to have reached Firestore rather than a list in the client,
		// and with the screen's own count reset to nothing the line below is drawn
		// by this sweep instead of left over from the one before it.
		await page.reload();

		expect(await checkWhatIsMissing(page), 'sweeping a second time found charges to raise').toBe(0);
		await expect(raise, 'nothing to raise, and the button still offered to').toBeDisabled();

		// Whichever run this was, the books are open now: on the first pass because
		// the button raised them, on the second because `desktop` runs against the
		// database `mobile` left behind, which is the same claim a project apart.
		await expect(theBook(page).getByText('Nothing charged yet.')).toHaveCount(0);
		await expect(rowsOwing(page).first()).toBeVisible();
	});

	test("report a payment against one person's charge", async ({ page }) => {
		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		await namesHaveLanded(page);

		// By person and not by position. The book is sorted by who owes the most, so
		// reporting a payment moves somebody down it, and the row read here is
		// somebody else's row a moment later.
		const name = await nameOn(rowsOwing(page).first());

		await rowFor(page, name).click();

		const settle = theBook(page)
			.getByRole('button', { name: new RegExp(`^Mark ${escapeForRegExp(name)}'s .* paid$`) })
			.first();

		await expect(settle, `nothing owing under ${name}`).toBeVisible();

		// The label names the charge as well as the person, which is what makes the
		// assertions below about one Tuesday rather than about a row.
		const label = (await settle.getAttribute('aria-label'))!;
		const putBack = label.replace(/^Mark /, 'Put ').replace(/ paid$/, ' back to owing');

		await settle.click();

		// The controls swap because the stored status changed and came back down the
		// listener. A screen that had only remembered the tap would still be
		// offering to mark the same charge paid.
		await expect(theBook(page).getByRole('button', { name: putBack }), 'the charge did not settle').toBeVisible();

		await page.reload();

		await rowFor(page, name).click();

		await expect(
			theBook(page).getByRole('button', { name: putBack }),
			'the payment did not survive a reload'
		).toBeVisible();
	});

	test('draw the QR at both widths and offer the Swish app only under a finger', async ({ page }, testInfo) => {
		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		await namesHaveLanded(page);

		// Whoever the book says has not paid, rather than a name written down here:
		// which of the seeded players has settled up is the scenario's business.
		const name = await nameOn(rowsOwing(page).first());
		const player = readCast().users.find(user => user.displayName === name);

		expect(player, `${name} is in the book but is not a seeded account`).toBeTruthy();

		await signInAs(page, player!);

		// `.last()` is the innermost match: the pay panel sits inside the "What you
		// owe" section, so the bare filter matches both and reads as two elements.
		const pay = sectionUnder(page, /^Pay with Swish$/).last();
		await expect(pay, `${name} owes money and was offered no way to pay it`).toBeVisible();

		// Real `<path>` elements. `next.config.js` claims as a security property
		// that this app contains no `dangerouslySetInnerHTML`, and a QR library
		// handing back a string of SVG would have quietly cost us that.
		await expect(pay.getByTestId('swish-qr').locator('path').first(), 'the QR drew no modules').toBeVisible();

		const openSwish = page.getByTestId('swish-open');

		// In the document at both widths, because this is a media query and not a
		// render branch. A `toBeHidden` that turns out to be an unmounted node would
		// pass the desktop half below for the wrong reason.
		await expect(openSwish).toHaveCount(1);

		if (testInfo.project.name === 'mobile') {
			await expect(openSwish, 'a phone was left with nothing but the QR').toBeVisible();

			// The payee has to be bare digits. A `+` is the malformed link the
			// Swish app opens on an error dialog instead of the payment sheet.
			await expect(openSwish).toHaveAttribute('href', /^https:\/\/app\.swish\.nu\/1\/p\/sw\/\?sw=\d+&amt=\d+&/);
		} else {
			await expect(openSwish, "a desktop was offered Swish's download page").toBeHidden();
		}
	});

	/**
	 * The trimmed view, and the only place the constrained query gets driven.
	 *
	 * An extra is in no season's squad, so the rules refuse them the book and the
	 * app asks a different question instead, `where('uid', '==', them)`, which is
	 * the one shape of read a rule expressed as `resource.data.uid ==
	 * request.auth.uid` will allow. Whether that query is actually allowed is a
	 * question only the deployed ruleset answers, and a denied one leaves this
	 * screen on its skeleton for good.
	 */
	test('show an extra their own charges and nobody else at all', async ({ page }) => {
		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		const books = page.url();

		await signInAs(page, someone(/an extra$/));
		await expect(page).toHaveURL(books);

		await expect(
			page.getByRole('heading', { name: 'What you owe' }),
			'the screen never got past loading an extra their own charges'
		).toBeVisible();

		await expect(theBook(page), 'an extra was shown the whole book').toHaveCount(0);
		await expect(
			page.getByTestId('season-shortfall'),
			'an extra was told how much the group has collected'
		).toHaveCount(0);
	});

	test('hold the In of somebody who owes, and hand it back when they settle', async ({ page }) => {
		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		await namesHaveLanded(page);

		// Whoever the book says owes the most, rather than a name written here.
		// Which of the seeded players has settled up is the scenario's business,
		// and this test leaves one fewer of them owing than it found.
		const name = await nameOn(rowsOwing(page).first());
		const player = readCast().users.find(user => user.displayName === name);

		expect(player, `${name} is in the book but is not a seeded account`).toBeTruthy();

		const books = page.url();

		await signInAs(page, player!);
		await expect(page).toHaveURL(books);

		await openTab(page, /^Games$/);
		await expect(page).toHaveURL(AT.season);

		const notice = sectionUnder(page, /^What you owe$/);
		await expect(notice, `${name} owes money and the season said nothing about it`).toBeVisible();
		await expect(notice.getByText(/cannot sign up for another game/)).toBeVisible();

		const held = unanswered(page);
		await expect(held, 'no game on this season is still open and unanswered').toBeVisible();

		// The half that is taken and the half that is not. An Out is the answer
		// somebody who owes is most likely to be giving and the one the organiser
		// most needs, so a debt may never reach it.
		await expect(held.getByRole('button', { name: /I'm in/ }), 'the In stayed live for a debtor').toBeDisabled();
		await expect(held.getByRole('button', { name: /Can't make it/ }), 'the Out was held too').toBeEnabled();
		await expect(
			held.getByRole('link', { name: 'Settle up' }),
			'the held button was left with no reason beside it'
		).toBeVisible();

		await signInAs(page, aSeasonAdmin());
		await openTheBooks(page);
		await namesHaveLanded(page);

		await settleEverything(page, name);

		await signInAs(page, player!);
		await openTab(page, /^Games$/);
		await expect(page).toHaveURL(AT.season);

		// The lock lifts because the stored status came back down this player's own
		// dues listener, on a screen that never reads the book the admin settled it
		// in. A client holding its own idea of what was owed would still be locked.
		//
		// The live button first, and the two absences after it. This screen draws a
		// skeleton until the season has landed, and everything is absent from that.
		await expect(unanswered(page).getByRole('button', { name: /I'm in/ })).toBeEnabled();
		await expect(sectionUnder(page, /^What you owe$/), 'still billed after paying up').toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Settle up' }), 'a row still explaining a lock').toHaveCount(0);
	});
});
