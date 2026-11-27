import { describeHighlight } from './describeHighlight';

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
