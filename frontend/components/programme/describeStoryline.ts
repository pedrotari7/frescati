import type { Storyline } from '@shared/matchday';

/** One storyline as a sentence. Factual on purpose: a losing run is something to end, never something to laugh at. */
export const describeStoryline = (storyline: Storyline, name: string): string => {
	switch (storyline.kind) {
		case 'winRun':
			return `${name} has won ${storyline.count} in a row`;
		case 'lossRun':
			return `${name} is looking to end a run of ${storyline.count}`;
		case 'milestone':
			return `${name} is a point off ${storyline.target}`;
		case 'debut':
			return `First game for ${name}`;
		case 'return':
			return `${name} is back after ${storyline.days} days`;
		case 'motmRun':
			return `${name} was man of the match in each of the last ${storyline.count}`;
	}
};
