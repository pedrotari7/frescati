import { placeLabel } from '@shared/format';
import type { FullTimeCard, FullTimeHighlight } from '@shared/fullTime';

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

/** Where the team finished, the way the card and the image both say it. */
export const describeFinish = (card: Pick<FullTimeCard, 'position' | 'shared' | 'teamCount'>): string => {
	if (card.shared) return card.position === 0 ? 'Level first' : `Level ${placeLabel(card.position)}`;

	return `${placeLabel(card.position)} of ${card.teamCount}`;
};
