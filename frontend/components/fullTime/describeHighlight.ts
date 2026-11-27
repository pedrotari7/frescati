import type { FullTimeHighlight } from '@shared/fullTime';

/** 1st, 2nd, 3rd, 11th. A season table runs past the four places `placeLabel` covers. */
const ordinal = (place: number): string => {
	const teen = place % 100 >= 11 && place % 100 <= 13;
	const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th');

	return `${place}${suffix}`;
};

/** One highlight as a line on the card, addressed to the person reading it. */
export const describeHighlight = (highlight: FullTimeHighlight): string => {
	switch (highlight.kind) {
		case 'runStarted':
			return 'Two wins in a row';
		case 'runExtended':
			return `${highlight.count} wins in a row`;
		case 'runEnded':
			return `That ends a run of ${highlight.count}`;
		case 'tableMove':
			return highlight.to === 0
				? 'Top of the season table'
				: `Up to ${ordinal(highlight.to + 1)} in the season table`;
		case 'careerBest':
			return `Your best rating yet: ${highlight.rating}`;
		case 'firstWin':
			return 'Your first win';
	}
};
