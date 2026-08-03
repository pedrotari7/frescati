import type { GameNotificationContext } from './notifications';
import { GAME_NOTIFICATIONS, NOTIFICATION_PREF, buildGamePush } from './notifications';

const CONTEXT: GameNotificationContext = {
	when: 'Tue 1 Sep · 19:00',
	url: '/s/spring/g/game-1',
	gameId: 'game-1',
};

describe('buildGamePush', () => {
	it('names the reason a game was called off', () => {
		expect(buildGamePush('cancelled', { ...CONTEXT, cancelledReason: 'frozen pitch' })).toMatchObject({
			title: 'Game called off',
			body: 'Tue 1 Sep · 19:00 is off — frozen pitch',
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
			body: 'Tue 1 Sep · 19:00 — 7 in so far.',
		});
	});

	it('treats an unknown headcount as nobody rather than printing undefined', () => {
		expect(buildGamePush('reminder', CONTEXT).body).toBe('Tue 1 Sep · 19:00 — 0 in so far.');
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

describe('NOTIFICATION_PREF', () => {
	it('gates every kind behind a preference', () => {
		for (const kind of GAME_NOTIFICATIONS) {
			expect(['reminders', 'gameChanges']).toContain(NOTIFICATION_PREF[kind]);
		}
	});

	it('counts only the pre-game nudge as a reminder', () => {
		expect(NOTIFICATION_PREF.reminder).toBe('reminders');
		expect(NOTIFICATION_PREF.cancelled).toBe('gameChanges');
		expect(NOTIFICATION_PREF.atRisk).toBe('gameChanges');
	});
});
