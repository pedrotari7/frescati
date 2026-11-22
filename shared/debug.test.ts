import { buildSignupSample, isSignupNotification } from './debug';

describe('isSignupNotification', () => {
	it('recognises the three sign-up kinds and nothing else', () => {
		expect(isSignupNotification('signupOpen')).toBe(true);
		expect(isSignupNotification('signupReminder')).toBe(true);
		expect(isSignupNotification('seasonConfirmed')).toBe(true);
		expect(isSignupNotification('dueRaised')).toBe(false);
		expect(isSignupNotification('reminder')).toBe(false);
	});
});

describe('buildSignupSample', () => {
	it('invents a share for the confirmation, whatever the season charges', () => {
		expect(buildSignupSample('seasonConfirmed', 'autumn', 'Autumn 2026').title).toBe(
			'Your share of Autumn 2026 is 1 736 kr'
		);
	});

	it('gives the reminders a close date to show', () => {
		expect(buildSignupSample('signupReminder', 'autumn', 'Autumn 2026').body).toContain('1 Dec');
	});
});
