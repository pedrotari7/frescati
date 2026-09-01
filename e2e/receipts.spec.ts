import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aSeasonAdmin, openAs, someone } from './fixtures';
import { openSeasonAs, openTheBooks } from './helpers';
import { AT, sectionUnder } from './locators';

/**
 * The season's receipts: an admin puts one in, everybody else takes a copy.
 *
 * The reason this journey needs a real stack rather than a jsdom render is that
 * the file is the one thing in this app that is not a Firestore document. An
 * upload is a Cloud Storage write, guarded by a ruleset that decides by reading
 * the season document out of Firestore, and a download is an authorised fetch
 * of the bytes handed to the browser as a blob. Nothing short of the whole
 * thing running at once, both emulators, both rulesets and a real browser, can
 * say whether a receipt uploaded by an admin comes back down to a squad member
 * as a file their employer would accept.
 *
 * The link is the other claim. It is deliberately a link into the app rather
 * than the download URL Cloud Storage would happily mint, because that one
 * works for whoever holds it, forever. So the test copies what the button
 * copies, opens exactly that, and then opens it again as somebody the season
 * has never heard of, which is the case the whole design exists for.
 *
 * **This spec writes** to one season's receipts and to nothing else, which is
 * what keeps it disjoint from the five files it runs beside. It also clears up
 * after itself, so the two viewports do not leave a pile behind.
 */

/**
 * Named after the viewport rather than at random, and that is not decoration.
 * The two projects share one seeded database and run one after the other, so
 * each needs a file of its own; and a name derived from the run would be lost
 * the moment Playwright replaced this file's worker, which it does after a
 * failed test.
 */
const receiptName = (project: string): string => `Pitch invoice, ${project}`;

/**
 * A real, if very short, PDF. The type is what the rules and the form check, so
 * any bytes would pass, but a file called an invoice that would not open in a
 * reader is a poor thing to prove a download with.
 */
const A_PDF = Buffer.from(
	[
		'%PDF-1.4',
		'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
		'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
		'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
		'trailer<</Root 1 0 R>>',
		'%%EOF',
	].join('\n')
);

/** Where the copied link went, handed from the test that copies it to the ones that open it. */
let link = '';

const theReceipts = (page: Page) => sectionUnder(page, /^Receipts$/);

/** Reading the clipboard needs asking for; writing to it is what the button does. */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/**
 * Serial, unlike the other specs here, which each rebuild what they need from
 * the database on the way in. This one cannot: there is exactly one file, put
 * there by the first test and taken away by the last, so a failure half way
 * through should skip the rest rather than run four more tests against a
 * receipt that was never uploaded.
 */
test.describe.configure({ mode: 'serial' });

test.describe('the season receipts', () => {
	test('an admin puts one in the books', async ({ page }, testInfo) => {
		const receipt = receiptName(testInfo.project.name);

		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		await theReceipts(page).getByRole('button', { name: 'Add a receipt' }).click();

		await page.getByLabel('Receipt file').setInputFiles({
			name: 'pitch_invoice.pdf',
			mimeType: 'application/pdf',
			buffer: A_PDF,
		});

		// Filled in from the file name, which is why the form does it at all. What
		// is typed here is what the file downloads as later.
		await expect(page.getByLabel('What it is')).toHaveValue('pitch invoice');

		await page.getByLabel('What it is').fill(receipt);
		await page.getByRole('button', { name: 'Upload it' }).click();

		// The row is drawn from the Firestore listener, so this is the document
		// coming back rather than a form that remembers being submitted, and the
		// size is read off the object that actually landed.
		await expect(
			theReceipts(page).getByText(receipt),
			'the receipt never came back down the listener'
		).toBeVisible();
		await expect(
			theReceipts(page)
				.getByText(/PDF · \d+ B ·/)
				.first()
		).toBeVisible();

		await page.reload();
		await expect(theReceipts(page).getByText(receipt), 'it did not survive a reload').toBeVisible();
	});

	test('anybody in the squad takes their own copy', async ({ page }, testInfo) => {
		const receipt = receiptName(testInfo.project.name);

		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		await expect(theReceipts(page).getByText(receipt)).toBeVisible();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			theReceipts(page)
				.getByRole('button', { name: `Download ${receipt}` })
				.click(),
		]);

		// The name an admin typed, with the extension the stored type says, which
		// is the file somebody forwards to their payroll department.
		expect(download.suggestedFilename()).toBe(`${receipt}.pdf`);
	});

	test('the copied link opens the receipt on its own screen', async ({ page }, testInfo) => {
		const receipt = receiptName(testInfo.project.name);

		await openSeasonAs(page, aSeasonAdmin());
		await openTheBooks(page);

		const books = page.url();

		await theReceipts(page)
			.getByRole('button', { name: `Copy a link to ${receipt}` })
			.click();

		await expect(page.getByRole('status')).toContainText('Link copied');

		link = await page.evaluate(() => navigator.clipboard.readText());

		expect(link, 'the copied link was not a link into this app').toMatch(/\/s\/[^/]+\/finances\/r\/[^/]+$/);

		await page.goto(link);

		await expect(page).toHaveURL(AT.receipt);
		await expect(page.getByRole('heading', { name: receipt })).toBeVisible();

		// Somebody arriving from a group chat has nothing behind them, which is
		// the one case the chevron is allowed to go up rather than back.
		await page.getByRole('button', { name: 'Back' }).click();
		await expect(page, 'the chevron left somebody stranded off the books').toHaveURL(books);
	});

	test('and refuses somebody the season has never heard of', async ({ page }, testInfo) => {
		const receipt = receiptName(testInfo.project.name);

		expect(link, 'no link was copied, so there is nothing to open').not.toBe('');

		await openAs(page, someone(/an extra$/), link);

		// The file is refused by the storage rules either way; this is the screen
		// saying so rather than a download that quietly fails.
		await expect(page.getByText('Not yours to open')).toBeVisible();
		await expect(page.getByRole('button', { name: `Download ${receipt}` })).toHaveCount(0);
	});

	test('an admin takes it back off the books', async ({ page }, testInfo) => {
		const receipt = receiptName(testInfo.project.name);

		await openAs(page, aSeasonAdmin(), link);

		await expect(page.getByRole('heading', { name: receipt })).toBeVisible();

		await page.getByRole('button', { name: 'Remove this receipt' }).click();
		await page.getByRole('button', { name: 'Remove', exact: true }).click();

		// Back on the books by a `replace`, so the chevron cannot hand anybody
		// straight back to a receipt that is no longer there.
		await expect(page).toHaveURL(AT.finances);
		await expect(theReceipts(page).getByText(receipt), 'the receipt outlived its own removal').toHaveCount(0);
	});
});
