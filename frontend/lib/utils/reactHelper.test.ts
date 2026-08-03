import { classNames, nowIso } from './reactHelper';

describe('classNames', () => {
	it('joins truthy classes with a space', () => {
		expect(classNames('a', 'b', 'c')).toBe('a b c');
	});

	it('drops false, null and undefined entries', () => {
		expect(classNames('a', false, null, undefined, 'b')).toBe('a b');
	});

	it('returns an empty string when nothing survives', () => {
		expect(classNames(false, null, undefined)).toBe('');
	});

	it('supports conditional classes written inline', () => {
		const active = true;
		const disabled = false;

		expect(classNames('base', active && 'active', disabled && 'disabled')).toBe('base active');
	});
});

describe('nowIso', () => {
	it('returns the current time as an ISO 8601 string', () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-01T17:00:00.000Z'));

		expect(nowIso()).toBe('2026-09-01T17:00:00.000Z');

		jest.useRealTimers();
	});
});
