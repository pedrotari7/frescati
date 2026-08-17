import type { AppUser } from '@shared/types';
import { UNKNOWN_PLAYER, displayNameOf, nameByUid, personRow } from './people';

const user = (overrides: Partial<AppUser>): AppUser =>
	({ uid: 'anna', displayName: 'Anna Bergström', photoURL: null, ...overrides }) as AppUser;

const usersByUid = new Map<string, AppUser>([
	['anna', user({ uid: 'anna', photoURL: 'https://example.test/anna.png' })],
	['marco', user({ uid: 'marco', displayName: 'Marco Rossi' })],
]);

describe('displayNameOf', () => {
	it('uses the stored name', () => {
		expect(displayNameOf(user({}))).toBe('Anna Bergström');
	});

	/**
	 * Not a defensive fallback but a real state: `forget-player` deliberately
	 * leaves the uid in every ledger entry and lineup it appears in while
	 * clearing the profile, so a squad from two seasons ago genuinely contains
	 * people the app can no longer name.
	 */
	it.each([undefined, null])('names a profile that is not there (%p)', profile => {
		expect(displayNameOf(profile)).toBe(UNKNOWN_PLAYER);
	});

	// A profile mid-write has a document but no name on it yet.
	it('names a profile that exists but has no name yet', () => {
		expect(displayNameOf({} as AppUser)).toBe(UNKNOWN_PLAYER);
	});
});

describe('nameByUid', () => {
	it('looks the name up', () => {
		expect(nameByUid(usersByUid, 'marco')).toBe('Marco Rossi');
	});

	it('falls to the stand-in for a uid nobody has a profile for', () => {
		expect(nameByUid(usersByUid, 'ghost')).toBe(UNKNOWN_PLAYER);
	});
});

describe('personRow', () => {
	it('carries the uid, the name and the picture', () => {
		expect(personRow(usersByUid, 'anna')).toEqual({
			uid: 'anna',
			displayName: 'Anna Bergström',
			photoURL: 'https://example.test/anna.png',
		});
	});

	// `Avatar` takes `string | null` and draws initials when there is no picture,
	// which is the same answer for "no photo" and "no profile at all".
	it('uses null rather than undefined for a missing picture', () => {
		expect(personRow(usersByUid, 'marco').photoURL).toBeNull();
	});

	it('still builds a row for a uid with no profile behind it', () => {
		expect(personRow(usersByUid, 'ghost')).toEqual({
			uid: 'ghost',
			displayName: UNKNOWN_PLAYER,
			photoURL: null,
		});
	});
});
