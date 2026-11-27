import { describeStoryline } from './describeStoryline';

describe('describeStoryline', () => {
	it('tells a winning run', () => {
		expect(describeStoryline({ kind: 'winRun', uid: 'a', count: 4 }, 'Ana')).toBe('Ana has won 4 in a row');
	});

	it('tells a losing run as something to end', () => {
		expect(describeStoryline({ kind: 'lossRun', uid: 'j', count: 4 }, 'João')).toBe(
			'João is looking to end a run of 4'
		);
	});

	it('tells a milestone', () => {
		expect(describeStoryline({ kind: 'milestone', uid: 'a', target: 70 }, 'Ana')).toBe('Ana is a point off 70');
	});

	it('tells a debut', () => {
		expect(describeStoryline({ kind: 'debut', uid: 'r' }, 'Rui')).toBe('First game for Rui');
	});

	it('tells a return', () => {
		expect(describeStoryline({ kind: 'return', uid: 'r', days: 30 }, 'Rui')).toBe('Rui is back after 30 days');
	});

	it('tells a man of the match run', () => {
		expect(describeStoryline({ kind: 'motmRun', uid: 'a', count: 2 }, 'Ana')).toBe(
			'Ana was man of the match in each of the last 2'
		);
	});
});
