import { describeFinish, describeHighlight } from './describeHighlight';

describe('describeHighlight', () => {
	it('tells a run started', () => {
		expect(describeHighlight({ kind: 'runStarted' })).toBe('Two wins in a row');
	});

	it('tells a run extended', () => {
		expect(describeHighlight({ kind: 'runExtended', count: 4 })).toBe('4 wins in a row');
	});

	it('tells a run ended', () => {
		expect(describeHighlight({ kind: 'runEnded', count: 5 })).toBe('That ends a run of 5');
	});

	it('tells a climb in ordinary places', () => {
		expect(describeHighlight({ kind: 'tableMove', from: 4, to: 2 })).toBe('Up to 3rd in the season table');
	});

	it('tells a climb to the top', () => {
		expect(describeHighlight({ kind: 'tableMove', from: 1, to: 0 })).toBe('Top of the season table');
	});

	it('tells a career best', () => {
		expect(describeHighlight({ kind: 'careerBest', rating: 71 })).toBe('Your best rating yet: 71');
	});

	it('tells a first win', () => {
		expect(describeHighlight({ kind: 'firstWin' })).toBe('Your first win');
	});
});

describe('describeFinish', () => {
	it('says the place out of how many', () => {
		expect(describeFinish({ position: 1, shared: false, teamCount: 3 })).toBe('2nd of 3');
	});

	it('says level first for a shared top', () => {
		expect(describeFinish({ position: 0, shared: true, teamCount: 2 })).toBe('Level first');
	});

	it('says level on a shared place lower down', () => {
		expect(describeFinish({ position: 1, shared: true, teamCount: 4 })).toBe('Level 2nd');
	});
});
