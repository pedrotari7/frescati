import type { GameNotificationContext } from './notifications';
import {
	GAME_NOTIFICATIONS,
	NOTIFICATIONS,
	NOTIFICATION_PREF,
	buildEmail,
	buildGamePush,
	buildNewPlayerPush,
	canEmail,
	getPushReach,
	normaliseNotificationPrefs,
	relevantPrefs,
} from './notifications';
import { DEFAULT_NOTIFICATION_PREFS } from './types';

const CONTEXT: GameNotificationContext = {
	when: 'Tue 1 Sep · 19:00',
	url: '/s/spring/g/game-1',
	gameId: 'game-1',
};

describe('buildGamePush', () => {
	it('names the reason a game was called off', () => {
		expect(buildGamePush('cancelled', { ...CONTEXT, cancelledReason: 'frozen pitch' })).toMatchObject({
			title: 'Game called off',
			body: 'Tue 1 Sep · 19:00 is off: frozen pitch',
		});
	});

	it('still says a game is off when no reason was given', () => {
		expect(buildGamePush('cancelled', CONTEXT).body).toBe('Tue 1 Sep · 19:00 is off.');
	});

	it('asks again when a game comes back', () => {
		expect(buildGamePush('restored', CONTEXT)).toMatchObject({
			title: 'Game back on',
			body: 'Tue 1 Sep · 19:00 is on again. Are you in?',
		});
	});

	it('says how many more players a game needs', () => {
		expect(buildGamePush('atRisk', { ...CONTEXT, shortBy: 3 }).body).toBe(
			'Tue 1 Sep · 19:00 needs 3 more. Can you make it?'
		);
	});

	// A game can only be short by a positive number of people, and "needs -2
	// more" is the kind of thing that reaches a lock screen before anyone notices.
	it('never asks for a negative number of players', () => {
		expect(buildGamePush('atRisk', { ...CONTEXT, shortBy: -2 }).body).toContain('needs 0 more');
	});

	it('points at the new time when a kick-off moves', () => {
		expect(buildGamePush('kickoffMoved', CONTEXT)).toMatchObject({
			title: 'Kick-off moved',
			body: 'The game has moved to Tue 1 Sep · 19:00.',
		});
	});

	it('reports the headcount in a reminder', () => {
		expect(buildGamePush('reminder', { ...CONTEXT, playing: 7 })).toMatchObject({
			title: 'Are you playing?',
			body: 'Tue 1 Sep · 19:00. 7 in so far.',
		});
	});

	it('treats an unknown headcount as nobody rather than printing undefined', () => {
		expect(buildGamePush('reminder', CONTEXT).body).toBe('Tue 1 Sep · 19:00. 0 in so far.');
	});

	it('names who moved, and says which way, on an availability change', () => {
		expect(buildGamePush('availability', { ...CONTEXT, who: 'Anna Berg', availability: 'in', playing: 9 })).toEqual(
			expect.objectContaining({
				title: 'Anna Berg is in',
				body: 'Tue 1 Sep · 19:00. 9 in so far.',
			})
		);

		expect(buildGamePush('availability', { ...CONTEXT, who: 'Anna Berg', availability: 'out' }).title).toBe(
			'Anna Berg is out'
		);
	});

	// Taking an answer back is the response document going away, which is a real
	// state. "Anna is out" would be a different and wrong thing to say.
	it('says a withdrawal happened rather than stating an answer there no longer is', () => {
		expect(buildGamePush('availability', { ...CONTEXT, who: 'Anna', availability: 'withdrawn' }).title).toBe(
			'Anna took their answer back'
		);
	});

	// The debug screen renders a title from an empty context, and a profile can
	// legitimately be mid-write with no name on it.
	it('still reads as a sentence when nobody was named', () => {
		expect(buildGamePush('availability', { ...CONTEXT, who: '  ', availability: 'in' }).title).toBe(
			'Somebody is in'
		);
		expect(buildGamePush('availability', CONTEXT).title).toBe('Somebody is in');
	});

	// The tag is what makes three notifications about one Tuesday replace each
	// other instead of stacking, so every kind has to agree on it.
	it('tags every kind by game, and carries the deep link through', () => {
		for (const kind of GAME_NOTIFICATIONS) {
			expect(buildGamePush(kind, CONTEXT)).toMatchObject({
				url: '/s/spring/g/game-1',
				tag: 'game-game-1',
			});
		}
	});

	it('writes a non-empty title and body for every kind', () => {
		for (const kind of GAME_NOTIFICATIONS) {
			const payload = buildGamePush(kind, CONTEXT);

			expect(payload.title.length).toBeGreaterThan(0);
			expect(payload.body).not.toContain('undefined');
		}
	});
});

describe('buildNewPlayerPush', () => {
	it('names the person who just joined', () => {
		expect(buildNewPlayerPush({ uid: 'zoe', displayName: 'Zoe Lindqvist', seasonId: null })).toMatchObject({
			title: 'New player',
			body: 'Zoe Lindqvist just signed into Frescati for the first time.',
			url: '/admin',
		});
	});

	// The whole point: an admin can add the newcomer without a hunt through
	// /admin first.
	it("deep-links to that season's manage-squad screen when one is active", () => {
		expect(buildNewPlayerPush({ uid: 'zoe', displayName: 'Zoe', seasonId: 'season-current' }).url).toBe(
			'/s/season-current/admin/members'
		);
	});

	// Nothing to add them to yet, so back to the screen that lists everybody
	// who has ever signed in.
	it('falls back to /admin when no season is active', () => {
		expect(buildNewPlayerPush({ uid: 'zoe', displayName: 'Zoe', seasonId: null }).url).toBe('/admin');
	});

	// A profile can be created mid-repair with nothing but a uid on it, and
	// "undefined just signed into Frescati" would reach a lock screen.
	it('still reads as a sentence when the profile has no name yet', () => {
		expect(buildNewPlayerPush({ uid: 'zoe', displayName: '   ', seasonId: null }).body).toBe(
			'Somebody just signed into Frescati for the first time.'
		);
	});

	// Two people joining the same evening are two things to know about, unlike
	// three notifications about the same Tuesday.
	it('tags per person so arrivals do not replace each other', () => {
		expect(buildNewPlayerPush({ uid: 'zoe', displayName: 'Zoe', seasonId: null }).tag).not.toBe(
			buildNewPlayerPush({ uid: 'erik', displayName: 'Erik', seasonId: null }).tag
		);
	});

	// There is no game behind it, so the worker's "I'm in" shortcut would open
	// the app and do nothing.
	it('carries no respond shortcut', () => {
		expect(buildNewPlayerPush({ uid: 'zoe', displayName: 'Zoe', seasonId: null }).respondable).toBe(false);
		expect(buildGamePush('reminder', CONTEXT).respondable).toBe(true);
	});
});

describe('the man-of-the-match vote', () => {
	// The only game notification sent after the football rather than before it,
	// so "I'm in" has nothing left to answer.
	it('carries no respond shortcut either', () => {
		expect(buildGamePush('motm', CONTEXT).respondable).toBe(false);
	});

	it('says which game it is asking about', () => {
		expect(buildGamePush('motm', CONTEXT).body).toContain(CONTEXT.when);
	});

	// A player opening it two days later needs the vote, not the headcount.
	it('opens wherever the caller pointed it', () => {
		expect(buildGamePush('motm', { ...CONTEXT, url: '/s/s1/g/g1/tournament' }).url).toBe('/s/s1/g/g1/tournament');
	});

	// Late enough after the game that any availability notice about it is stale,
	// so replacing that on the lock screen is the right thing to do.
	it('shares the one tag per game', () => {
		expect(buildGamePush('motm', CONTEXT).tag).toBe(buildGamePush('reminder', CONTEXT).tag);
	});
});

describe('the man-of-the-match result', () => {
	const RESULT: GameNotificationContext = { ...CONTEXT, winners: ['Anders'], votes: 4 };

	// The name is the whole notification, and the body is the half a lock screen
	// truncates, so the one thing somebody has to be able to read at a glance
	// goes in the title, the same way `availability` puts one there.
	it('leads with who the group picked', () => {
		expect(buildGamePush('motmResult', RESULT)).toMatchObject({
			title: 'Anders is man of the match',
			body: 'Tue 1 Sep · 19:00. 4 votes.',
		});
	});

	// "1 votes" on the one notification most likely to be read by the person who
	// cast that vote.
	it('counts a single vote in the singular', () => {
		expect(buildGamePush('motmResult', { ...RESULT, votes: 1 }).body).toBe('Tue 1 Sep · 19:00. 1 vote.');
	});

	// A real outcome rather than an edge case: `tallyMotmVotes` publishes every
	// winner level on the most votes, and a small turnout ties often.
	it('shares it between everybody who tied', () => {
		expect(buildGamePush('motmResult', { ...RESULT, winners: ['Anders', 'Björn'], votes: 2 })).toMatchObject({
			title: 'Anders and Björn share man of the match',
			body: 'Tue 1 Sep · 19:00. 2 votes each.',
		});
	});

	it('lists three the way anybody would say it', () => {
		expect(buildGamePush('motmResult', { ...RESULT, winners: ['Anders', 'Björn', 'Chris'] }).title).toBe(
			'Anders, Björn and Chris share man of the match'
		);
	});

	// A profile caught mid-write, or one that has never had a name on it. Dropped
	// instead, a tie would become a title claiming a single winner, which is the
	// one thing here that reads as wrong rather than as missing.
	it('keeps a nameless winner in the list rather than losing them', () => {
		expect(buildGamePush('motmResult', { ...RESULT, winners: ['Anders', '  '] }).title).toBe(
			'Anders and Somebody share man of the match'
		);
	});

	// Nothing to answer and nobody to bring a ball: the worker's "I'm in"
	// shortcut would open the app and silently do nothing.
	it('carries no respond shortcut', () => {
		expect(buildGamePush('motmResult', RESULT).respondable).toBe(false);
	});

	// One exchange, one switch. Somebody who wanted to be asked wants to hear how
	// it went, and somebody who muted being asked has already said they don't.
	it('goes out on the same preference as the question', () => {
		expect(NOTIFICATION_PREF.motmResult).toBe(NOTIFICATION_PREF.motm);
	});

	// It lands days after the ask, on a lock screen that may still be showing it.
	it('replaces the ask rather than stacking on it', () => {
		expect(buildGamePush('motmResult', RESULT).tag).toBe(buildGamePush('motm', CONTEXT).tag);
	});
});

describe('NOTIFICATION_PREF', () => {
	it('gates every kind behind a preference, or explicitly behind none', () => {
		for (const kind of NOTIFICATIONS) {
			expect(['reminders', 'gameChanges', 'newPlayers', 'motm', null]).toContain(NOTIFICATION_PREF[kind]);
		}
	});

	// The one kind whose opt-in is somewhere else entirely: you followed one
	// game, off by default, and unfollowing is the switch. A profile preference
	// for it would be a second one nobody could reach without the first.
	it('leaves the per-game subscription to gate itself', () => {
		expect(NOTIFICATION_PREF.availability).toBeNull();
	});

	// `availability` is the only one that may be `null`. Everything else goes
	// out to a standing audience nobody signed up for, so the profile has to be
	// able to say no to it.
	it('keeps every standing-audience kind on a preference', () => {
		for (const kind of NOTIFICATIONS.filter(candidate => candidate !== 'availability')) {
			expect(NOTIFICATION_PREF[kind]).not.toBeNull();
		}
	});

	it('counts only the pre-game nudge as a reminder', () => {
		expect(NOTIFICATION_PREF.reminder).toBe('reminders');
		expect(NOTIFICATION_PREF.cancelled).toBe('gameChanges');
		expect(NOTIFICATION_PREF.atRisk).toBe('gameChanges');
	});

	// Muting the chase for an answer says nothing about wanting to be asked who
	// played well, so the vote carries its own switch rather than borrowing one.
	it('keeps the vote off the pre-game nudge', () => {
		expect(NOTIFICATION_PREF.motm).toBe('motm');
	});

	// Otherwise an admin switching game changes off would stop hearing about
	// people joining, which is not what that switch says.
	it('keeps the admin notice on its own preference', () => {
		expect(NOTIFICATION_PREF.newPlayer).toBe('newPlayers');
	});
});

describe('getPushReach', () => {
	const ALL_ON = { ...DEFAULT_NOTIFICATION_PREFS };

	it('reaches somebody with a device and everything switched on', () => {
		expect(getPushReach({ prefs: ALL_ON, devices: 1, isAppAdmin: false })).toBe('reachable');
	});

	// Preferences are academic until there is something to send to, and telling
	// somebody to check their settings when they never turned notifications on
	// sends them looking in the wrong place.
	it('blames the missing device before the preferences', () => {
		expect(getPushReach({ prefs: { ...ALL_ON, reminders: false }, devices: 0, isAppAdmin: false })).toBe(
			'noDevice'
		);
	});

	it('separates a partial opt-out from silence', () => {
		expect(getPushReach({ prefs: { ...ALL_ON, reminders: false }, devices: 2, isAppAdmin: false })).toBe('partly');
		expect(
			getPushReach({
				prefs: { ...ALL_ON, reminders: false, gameChanges: false, motm: false },
				devices: 2,
				isAppAdmin: false,
			})
		).toBe('muted');
	});

	// `newPlayers` is only ever sent to app admins. Counting it for everybody
	// else would report a player as partially muted for switching off something
	// they were never going to be sent.
	it('only counts the admin notice for an admin', () => {
		const prefs = { ...ALL_ON, newPlayers: false };

		expect(getPushReach({ prefs, devices: 1, isAppAdmin: false })).toBe('reachable');
		expect(getPushReach({ prefs, devices: 1, isAppAdmin: true })).toBe('partly');
	});

	// Matches `tokensFor` on the backend: a profile written before a preference
	// existed is opted in, not silently switched off.
	it('treats missing preferences as opted in', () => {
		expect(getPushReach({ devices: 1, isAppAdmin: true })).toBe('reachable');
	});
});

describe('relevantPrefs', () => {
	it('hides the admin notice from everybody else', () => {
		expect(relevantPrefs(false)).toEqual(['reminders', 'gameChanges', 'motm']);
		expect(relevantPrefs(true)).toEqual(['reminders', 'gameChanges', 'motm', 'newPlayers']);
	});

	// It picks a channel, not a kind. Counted here, somebody who wants push and
	// nothing else would show up on the admin screen as partly muted.
	it('leaves the email fallback out, because it is not a kind', () => {
		expect(relevantPrefs(true)).not.toContain('emailFallback');
	});
});

describe('canEmail', () => {
	it('needs both an address and the switch left on', () => {
		expect(canEmail({ prefs: DEFAULT_NOTIFICATION_PREFS, hasEmail: true })).toBe(true);
		expect(canEmail({ prefs: DEFAULT_NOTIFICATION_PREFS, hasEmail: false })).toBe(false);
		expect(canEmail({ prefs: { ...DEFAULT_NOTIFICATION_PREFS, emailFallback: false }, hasEmail: true })).toBe(
			false
		);
	});

	// Same as every other preference here: a profile written before this existed
	// is opted in, not silently switched off.
	it('treats a missing preference as opted in', () => {
		expect(canEmail({ hasEmail: true })).toBe(true);
	});
});

describe('normaliseNotificationPrefs', () => {
	it('keeps every switch the caller set', () => {
		expect(
			normaliseNotificationPrefs({
				reminders: false,
				gameChanges: true,
				newPlayers: false,
				motm: true,
				emailFallback: true,
			})
		).toEqual({ reminders: false, gameChanges: true, newPlayers: false, motm: true, emailFallback: true });
	});

	// The whole point: security rules bound this map to exactly these keys, and
	// a writer that spread a stored one forward could carry anything else with it.
	it('drops anything that is not one of the switches', () => {
		const prefs = normaliseNotificationPrefs({
			reminders: false,
			junk: 'x'.repeat(1000),
			nested: { anything: [1, 2, 3] },
		} as never);

		expect(Object.keys(prefs).sort()).toEqual(['emailFallback', 'gameChanges', 'motm', 'newPlayers', 'reminders']);
		expect(prefs.reminders).toBe(false);
	});

	// Matches how every reader treats an absent key. A preference nobody has
	// expressed is not an opt-out, so a partial map fills in as on.
	it('reads a missing switch as opted in', () => {
		expect(normaliseNotificationPrefs({ reminders: false })).toEqual({
			reminders: false,
			gameChanges: true,
			newPlayers: true,
			motm: true,
			emailFallback: true,
		});
	});

	it('gives a profile with no preferences at all the defaults', () => {
		expect(normaliseNotificationPrefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
	});

	// Anything that is not exactly `false` is on, which is the same test every
	// reader applies, so a corrupted value settles on the safe side.
	it('treats a non-boolean as opted in rather than passing it through', () => {
		expect(normaliseNotificationPrefs({ reminders: 'nope' } as never).reminders).toBe(true);
	});
});

describe('buildEmail', () => {
	const APP_URL = 'https://frescati.example';

	it('carries the push copy through unchanged', () => {
		const push = buildGamePush('cancelled', { ...CONTEXT, cancelledReason: 'frozen pitch' });
		const email = buildEmail(push, { appUrl: APP_URL });

		expect(email.subject).toBe('Game called off');
		expect(email.text).toContain('Tue 1 Sep · 19:00 is off: frozen pitch');
		expect(email.html).toContain('Tue 1 Sep · 19:00 is off: frozen pitch');
	});

	// A mail client has no origin to resolve `/s/…` against.
	it('makes the deep link absolute', () => {
		const email = buildEmail(buildGamePush('reminder', CONTEXT), { appUrl: APP_URL });

		expect(email.text).toContain('https://frescati.example/s/spring/g/game-1');
		expect(email.html).toContain('https://frescati.example/s/spring/g/game-1');
	});

	// `//s/…` reads as protocol-relative in some clients and goes nowhere.
	it('does not double the slash when the base URL has a trailing one', () => {
		const email = buildEmail(buildGamePush('reminder', CONTEXT), { appUrl: 'https://frescati.example/' });

		expect(email.html).toContain('https://frescati.example/s/spring/g/game-1');
		expect(email.html).not.toContain('example//s/');
	});

	// The cancellation reason is free text an admin types, interpolated straight
	// into markup.
	it('escapes the copy rather than pasting it into the markup', () => {
		const push = buildGamePush('cancelled', { ...CONTEXT, cancelledReason: '<script>alert(1)</script>' });
		const email = buildEmail(push, { appUrl: APP_URL });

		expect(email.html).not.toContain('<script>');
		expect(email.html).toContain('&lt;script&gt;');
	});

	it('offers a way in on every kind, and a way to switch these off', () => {
		for (const kind of GAME_NOTIFICATIONS) {
			const email = buildEmail(buildGamePush(kind, CONTEXT), { appUrl: APP_URL });

			expect(email.subject.length).toBeGreaterThan(0);
			expect(email.text).not.toContain('undefined');
			expect(email.html).toContain('https://frescati.example/me');
		}
	});

	// Nothing behind the admin notice can be answered, so inviting somebody to
	// say whether they're in would open the app and do nothing. Same reasoning
	// that keeps `respondable` off it.
	it('asks for an answer only where there is one to give', () => {
		expect(buildEmail(buildGamePush('reminder', CONTEXT), { appUrl: APP_URL }).text).toContain("Say if you're in");
		expect(
			buildEmail(buildNewPlayerPush({ uid: 'zoe', displayName: 'Zoe', seasonId: null }), { appUrl: APP_URL }).text
		).toContain('Open Frescati');
	});

	// A mail with no plain-text alternative scores as spam.
	it('always writes a plain-text alternative', () => {
		const email = buildEmail(buildGamePush('atRisk', { ...CONTEXT, shortBy: 2 }), { appUrl: APP_URL });

		expect(email.text).toContain('needs 2 more');
		expect(email.text).not.toContain('<');
	});
});
