import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import type { AvailabilityMark } from '@shared/availability';
import { colors, tint } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import AvailabilityDots, { AvailabilityLegend } from './AvailabilityDots';

/* The three answers as three colours, plus the dimmed dot that means "not yet". */
const expected = stylex.create({
	in: { backgroundColor: colors.in },
	out: { backgroundColor: colors.out },
	unanswered: { backgroundColor: tint.white15 },
	pending: { backgroundColor: tint.white5 },
	strip: { display: 'flex', flexWrap: 'wrap' },
});

const caller = stylex.create({ spaced: { marginTop: 8 } });

const TZ = 'Europe/Stockholm';

const marks: AvailabilityMark[] = [
	{ gameId: 'g1', kickoff: '2026-09-01T17:00:00.000Z', availability: 'in' },
	{ gameId: 'g2', kickoff: '2026-09-08T17:00:00.000Z', availability: 'out' },
	{ gameId: 'g3', kickoff: '2026-09-15T17:00:00.000Z', availability: 'unanswered' },
];

/** The dots themselves, in the order the strip drew them. */
const dotsOf = (strip: HTMLElement) => Array.from(strip.children) as HTMLElement[];

describe('AvailabilityDots', () => {
	it('gives each answer its own colour, in the order it was handed', () => {
		render(<AvailabilityDots marks={marks} timezone={TZ} />);

		const tones = dotsOf(screen.getByRole('img')).map(stylesOf);

		expect(tones[0]).toEqual(expect.arrayContaining(stylesFor(expected.in)));
		expect(tones[1]).toEqual(expect.arrayContaining(stylesFor(expected.out)));
		expect(tones[2]).toEqual(expect.arrayContaining(stylesFor(expected.unanswered)));
	});

	it('sums the season into one label rather than labelling every dot', () => {
		render(<AvailabilityDots marks={marks} timezone={TZ} />);

		expect(screen.getByRole('img')).toHaveAccessibleName('In for 1 game, out for 1, no answer for 1');
		expect(screen.queryAllByRole('img')).toHaveLength(1);
	});

	it('names the game and the answer on each dot', () => {
		render(<AvailabilityDots marks={marks} timezone={TZ} />);

		expect(dotsOf(screen.getByRole('img')).map(dot => dot.getAttribute('title'))).toEqual([
			'Tue 1 Sep · In',
			'Tue 8 Sep · Out',
			'Tue 15 Sep · No answer',
		]);
	});

	// The whole point of drawing anything before the read lands: the row is its
	// finished height from the start, and nobody is told they never answered.
	it('holds every dot while the answers are still out, saying nothing about them', () => {
		render(<AvailabilityDots marks={marks} timezone={TZ} pending />);

		const strip = screen.getByRole('img');

		expect(strip).toHaveAccessibleName('Availability, still loading');
		expect(dotsOf(strip)).toHaveLength(3);

		for (const dot of dotsOf(strip)) {
			expect(stylesOf(dot)).toEqual(expect.arrayContaining(stylesFor(expected.pending)));
			expect(dot).not.toHaveAttribute('title');
		}
	});

	it('accepts a caller style alongside its own', () => {
		render(<AvailabilityDots marks={marks} timezone={TZ} sx={caller.spaced} />);

		expect(stylesOf(screen.getByRole('img'))).toEqual(
			expect.arrayContaining(stylesFor(expected.strip, caller.spaced))
		);
	});
});

describe('AvailabilityLegend', () => {
	it('reads the colours off the same table as the strip', () => {
		const { container } = render(<AvailabilityLegend />);

		render(<AvailabilityDots marks={marks} timezone={TZ} />);

		// The key's swatches, which are the only aria-hidden spans in it.
		const swatches = Array.from(container.querySelectorAll('[aria-hidden="true"]')).map(stylesOf);

		expect(swatches).toEqual(dotsOf(screen.getByRole('img')).map(stylesOf));
	});

	it('names all three answers and says what a dot is', () => {
		render(<AvailabilityLegend />);

		expect(screen.getByText('One dot a game, oldest first')).toBeInTheDocument();
		expect(screen.getByText('In')).toBeInTheDocument();
		expect(screen.getByText('Out')).toBeInTheDocument();
		expect(screen.getByText('No answer')).toBeInTheDocument();
	});
});
