import { readFileSync } from 'fs';
import { join } from 'path';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Signing in, and finding somebody worth signing in as.
 *
 * The cast is read out of `frontend/public/dev-users.json` rather than written
 * down here. That file is produced by `pnpm seed` from the same scenario the
 * database was built from, so its `hint` is the seeder's own description of who
 * each person is — "App admin · Admin of Autumn 2026", "Member of …", "Signed
 * in, but in no season — an extra". Picking by role off that survives a change
 * to the cast list, which hardcoded names would not.
 */

export interface DevUser {
	uid: string;
	email: string;
	displayName: string;
	hint: string;
}

interface DevUserFile {
	scenario: string;
	users: DevUser[];
}

const DEV_USERS = join(__dirname, '..', 'frontend', 'public', 'dev-users.json');

export const readCast = (): DevUserFile => {
	try {
		return JSON.parse(readFileSync(DEV_USERS, 'utf8')) as DevUserFile;
	} catch {
		throw new Error(
			`No seeded accounts at ${DEV_USERS}. These tests run against a seeded emulator — start it with \`pnpm dev:e2e\`, or let the Playwright webServer do it.`
		);
	}
};

/** Everybody the seeder describes with this in their hint. */
export const whoIs = (pattern: RegExp): DevUser[] => readCast().users.filter(user => pattern.test(user.hint));

/**
 * The first person matching, with a failure that names what was looked for —
 * an empty `[0]` surfaces later as an unrelated "cannot read displayName".
 */
export const someone = (pattern: RegExp): DevUser => {
	const [found] = whoIs(pattern);

	if (!found) {
		throw new Error(
			`No seeded account matching ${pattern}. The scenario may have changed; hints available:\n` +
				readCast()
					.users.map(user => `  ${user.displayName} — ${user.hint}`)
					.join('\n')
		);
	}

	return found;
};

/** Somebody on a season's roster who is not also running it. */
export const aMember = (): DevUser => someone(/^Member of /);

/** Somebody who can confirm a game and reshuffle a lineup. */
export const aSeasonAdmin = (): DevUser => someone(/Admin of /);

/**
 * Become a seeded player.
 *
 * Through the switcher's own UI rather than by planting a token: it is the
 * documented way in locally, and driving it means these tests notice if it
 * breaks — which would cost every other test in this directory at once.
 */
export const signInAs = async (page: Page, user: DevUser): Promise<void> => {
	await page.getByRole('button', { name: 'Switch seeded user' }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Sign in as')).toBeVisible();

	// Filter first: the cast is thirty people and the panel scrolls.
	await dialog.getByPlaceholder('Filter by name, email or role').fill(user.displayName);
	await dialog.getByRole('button', { name: new RegExp(escapeForRegExp(user.displayName)) }).click();

	await expect(dialog).toBeHidden();
};

/** Names carry accents and the odd dot; none of them are meant as syntax. */
const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Open the app as somebody. Waits for the switcher rather than `networkidle`,
 * which never settles with a page full of open Firestore listeners.
 */
export const openAs = async (page: Page, user: DevUser, path = '/'): Promise<void> => {
	await page.goto(path);
	await expect(page.getByRole('button', { name: 'Switch seeded user' })).toBeVisible();
	await signInAs(page, user);
};
