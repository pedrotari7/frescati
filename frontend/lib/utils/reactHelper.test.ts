import { nowIso } from './reactHelper';

describe('nowIso', () => {
	it('returns the current time as an ISO 8601 string', () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-01T17:00:00.000Z'));

		expect(nowIso()).toBe('2026-09-01T17:00:00.000Z');

		jest.useRealTimers();
	});
});
