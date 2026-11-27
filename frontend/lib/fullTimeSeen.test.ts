import { claimFullTimeSession, markFullTimeSeen, readFullTimeSeen } from './fullTimeSeen';

afterEach(() => {
	vi.restoreAllMocks();
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe('the full-time seen mark', () => {
	it('reads back what was marked', () => {
		markFullTimeSeen('2026-11-20T21:00:00.000Z');

		expect(readFullTimeSeen()).toBe('2026-11-20T21:00:00.000Z');
	});

	it('keeps the later of two marks', () => {
		markFullTimeSeen('2026-11-20T21:00:00.000Z');
		markFullTimeSeen('2026-11-13T21:00:00.000Z');

		expect(readFullTimeSeen()).toBe('2026-11-20T21:00:00.000Z');
	});

	it('reads nothing when storage throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});

		expect(readFullTimeSeen()).toBeNull();
	});

	it('does not throw when storage refuses a mark', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});

		expect(() => markFullTimeSeen('2026-11-20T21:00:00.000Z')).not.toThrow();
	});

	it('claims a game once a session', () => {
		expect(claimFullTimeSession('g1')).toBe(true);
		expect(claimFullTimeSession('g1')).toBe(false);
	});
});
