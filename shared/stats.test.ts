import { median, percentile } from './stats';

describe('median', () => {
	it('takes the middle of an odd count', () => {
		expect(median([5, 1, 3])).toBe(3);
	});

	it('averages the two middles of an even count', () => {
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	// Every caller reuses the array it passed, and a sort in place would reorder
	// it underneath them.
	it('leaves the array it was given alone', () => {
		const values = [3, 1, 2];

		median(values);

		expect(values).toEqual([3, 1, 2]);
	});

	// A dash in the middle of a column of numbers is harder to read than a zero
	// beside a count that already says there was nothing to measure.
	it('answers zero for nothing at all', () => {
		expect(median([])).toBe(0);
	});
});

describe('percentile', () => {
	it('answers with a value that is actually in the set', () => {
		const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

		expect(percentile(values, 0.9)).toBe(10);
		expect(percentile(values, 0.5)).toBe(6);
		expect(percentile(values, 0)).toBe(1);
	});

	it('stays inside the set at the top', () => {
		expect(percentile([1, 2, 3], 1)).toBe(3);
	});

	it('answers zero for nothing at all', () => {
		expect(percentile([], 0.9)).toBe(0);
	});
});
