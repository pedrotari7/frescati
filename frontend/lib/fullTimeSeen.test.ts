import { claimFullTimeSession, markFullTimeSeen, readFullTimeSeen } from './fullTimeSeen';

afterEach(() => {
	vi.restoreAllMocks();
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe('the full-time seen mark', () => {
	it('reads back what was marked for a season', () => {
		markFullTimeSeen('sunday', '2026-11-20T21:00:00.000Z');

		expect(readFullTimeSeen('sunday')).toBe('2026-11-20T21:00:00.000Z');
	});

	it('keeps the later of two marks', () => {
		markFullTimeSeen('sunday', '2026-11-20T21:00:00.000Z');
		markFullTimeSeen('sunday', '2026-11-13T21:00:00.000Z');

		expect(readFullTimeSeen('sunday')).toBe('2026-11-20T21:00:00.000Z');
	});

	it('keeps each season its own mark, so a later card in one hides nothing in another', () => {
		markFullTimeSeen('tuesday', '2026-11-25T21:00:00.000Z');

		expect(readFullTimeSeen('sunday')).toBeNull();
	});

	it('reads nothing when storage throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});

		expect(readFullTimeSeen('sunday')).toBeNull();
	});

	it('does not throw when storage refuses a mark', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});

		expect(() => markFullTimeSeen('sunday', '2026-11-20T21:00:00.000Z')).not.toThrow();
	});

	it('claims a game once a session', () => {
		expect(claimFullTimeSession('g1')).toBe(true);
		expect(claimFullTimeSession('g1')).toBe(false);
	});
});
