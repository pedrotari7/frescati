'use client';

import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { getMatchOutcome } from '@shared/standings';
import type { Fixture } from '@shared/tournament';
import type { MatchOutcome, TournamentMatch } from '@shared/types';
import TeamBadge, { teamName, teamStyle } from './TeamBadge';
import { bp, colors, tint } from '../app/tokens.stylex';
import { surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	stepper: { display: 'flex', alignItems: 'center', gap: 4 },
	step: {
		color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } },
		display: 'flex',
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 8,
		backgroundColor: tint.white5,
		transitionProperty: 'color',
		transitionDuration: '0.15s',
		pointerEvents: { default: null, ':disabled': 'none' },
		opacity: { default: null, ':disabled': 0.3 },
	},
	stepIcon: { width: 16, height: 16 },
	score: {
		width: 28,
		textAlign: 'center',
		fontSize: 20,
		lineHeight: '28px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	unplayed: { color: colors.faint },
	/* A score on top of its own side's fill. The team's colour on 55% of that
	   same colour is about 2:1, so the number goes white and the fill under it
	   says whose it is. */
	onFill: { color: colors.ink },

	row: { position: 'relative', borderRadius: 16, padding: 12 },
	/* Both sit above the bands, which are absolutely positioned and would
	   otherwise paint over this text rather than behind it. */
	head: {
		position: 'relative',
		marginBottom: 8,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 8,
	},
	meta: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	clear: {
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.out } },
		margin: -6,
		borderRadius: 8,
		padding: 6,
		fontSize: 12,
		lineHeight: '16px',
		transitionProperty: 'color',
		transitionDuration: '0.15s',
		backgroundColor: { default: null, ':active': tint.white5 },
	},
	body: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
});

/**
 * The wash across a fixture nobody has scored yet, in the two teams' colours.
 *
 * Only until there is a result. Two 12% halves and one filled half are the same
 * idea drawn twice, and the weaker one wins, because a row washed end to end
 * reads as painted whatever happened on it. That is what shipped first: a 1-0
 * and a 0-0 sitting one above the other were indistinguishable, and the fill was
 * doing nothing the wash was not already doing worse.
 *
 * Nothing is lost on a played row. Which stepper belongs to whom was never only
 * this: the bib is a solid 28px block of the team's colour at each end, and the
 * score between them is in the same colour.
 *
 * A dynamic style, which is the one thing StyleX compiles to a CSS variable set
 * on the element rather than to a static class. It has to be: the pair of
 * colours is a runtime fact, and sixteen static classes for four teams facing
 * each other is not a table anybody should maintain. `colour` is the raw token
 * rather than a style for exactly this, `from-team-a/12` and `to-team-b/12` were
 * two Tailwind classes that composed only because both set a gradient stop, and
 * two StyleX style objects cannot compose into one value.
 */
const wash = stylex.create({
	gradient: (from: string, to: string) => ({
		backgroundImage: `linear-gradient(to right, color-mix(in srgb, ${from} 12%, transparent), transparent, color-mix(in srgb, ${to} 12%, transparent))`,
	}),
});

/**
 * How far a side's band reaches across the row, as a share of its width.
 *
 * A win runs past the middle. A draw stops a third of the way across, so the two
 * bands leave a gap between them, and that gap is the tell. The difference is a
 * length rather than a second band because counting two bands against one means
 * finding both of them first, and the scoreboard is read across a pitch in the
 * dark.
 *
 * The draw figure is the shorter of the two but not arbitrarily short. It has to
 * clear the score it belongs to, which on a phone sits about a quarter of the way
 * in. Any shorter and the colour stops before the number it is about.
 */
const WIN_REACH = '58%';
const DRAW_REACH = '34%';

/**
 * The band of colour under the side that took the fixture.
 *
 * Its own element rather than another stop on the wash above, and it has to be,
 * because `background-image` is not an animatable property. A gradient rewritten
 * on every tap would snap, and a score is tapped in one at a time: 1–0, 1–1,
 * 2–1 is a win, then a draw, then a win again, three hard cuts in about four
 * seconds.
 *
 * So the two properties that move are both animatable. `width` slides the band
 * out from the edge it belongs to, and shortens it in place when a draw takes a
 * win's length away. `opacity` is what lets a band leave, since a width going to
 * zero on its own thins to a stripe before it vanishes. The global
 * `prefers-reduced-motion` rule in `globals.css` takes both out.
 *
 * Nothing clips it, so it rounds its own two corners to match the card's 16.
 * `overflow: hidden` on the row would have done it in one line and cost the 2px
 * that Clear's `tap44` hit area spills above the card. It sits behind both
 * content rows, which is what their `position: relative` is for.
 */
const band = stylex.create({
	base: {
		position: 'absolute',
		insetBlockStart: 0,
		insetBlockEnd: 0,
		width: 0,
		opacity: 0,
		pointerEvents: 'none',
		transitionProperty: 'width, opacity',
		transitionDuration: '0.35s',
		transitionTimingFunction: 'ease-out',
	},

	/*
	 * The colour is a runtime fact, so this is a dynamic style for the same
	 * reason the wash above is. `towards` rides along with it because a band
	 * pinned to the right of the row has to fade to the left, and StyleX
	 * collapses every argument of one dynamic style into the single custom
	 * property it sets, so carrying it here costs nothing over two hard-coded
	 * directions.
	 *
	 * Three stops, not two, and the middle one is what makes this a fill rather
	 * than a gradient. A straight ramp from the edge is already halfway to
	 * nothing by the time it reaches the score it is about, which is the part
	 * anybody is actually looking at. Holding near full strength to the 42% mark
	 * covers the bib and the number, and the tail from there is the fade.
	 *
	 * 55% is as strong as it can go. The score sits on top of it, and the number
	 * has to leave its team's colour for `colors.ink` at anything like this
	 * strength, because cyan on 55% cyan is about 2:1.
	 */
	fill: (colour: string, towards: 'left' | 'right') => ({
		backgroundImage: `linear-gradient(to ${towards}, color-mix(in srgb, ${colour} 55%, transparent) 0%, color-mix(in srgb, ${colour} 38%, transparent) 42%, transparent 100%)`,
	}),

	start: { insetInlineStart: 0, borderStartStartRadius: 16, borderEndStartRadius: 16 },
	end: { insetInlineEnd: 0, borderStartEndRadius: 16, borderEndEndRadius: 16 },

	won: { width: WIN_REACH, opacity: 1 },
	drew: { width: DRAW_REACH, opacity: 1 },
});

/**
 * What one side's band is, given how the fixture ended.
 *
 * `null` for the side that lost and for a fixture nobody has scored, which
 * leaves the band at the zero width and zero opacity it rests at. An unplayed
 * row therefore looks exactly as it did before any of this, which is the state
 * a scoreboard spends most of its life in. A beaten side keeps its wash and its
 * bib, which is what said whose stepper was whose before there was a result to
 * show.
 */
const reachFor = (side: 'a' | 'b', outcome: MatchOutcome | null): StyleXStyles | null => {
	if (outcome === 'draw') return band.drew;

	return outcome === side ? band.won : null;
};

/** Big enough to hit with a cold thumb, in a coat, in the dark. */
const Stepper = ({
	value,
	onChange,
	disabled,
	label,
	tone,
}: {
	value: number | null;
	onChange: (next: number) => void;
	disabled: boolean;
	label: string;
	/**
	 * What colour the number is. The scoring team's, so it says whose it is, or
	 * `colors.ink` where the number sits on that team's own fill and would not
	 * have the contrast for it.
	 */
	tone: StyleXStyles;
}) => (
	<div {...stylex.props(styles.stepper)}>
		<button
			type='button'
			aria-label={`${label} one fewer`}
			disabled={disabled || (value ?? 0) === 0}
			onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
			{...stylex.props(styles.step, utils.tap44)}
		>
			<MinusIcon {...stylex.props(styles.stepIcon)} aria-hidden='true' />
		</button>

		{/* Named for the same reason the headcount is: it is a number an
		    end-to-end test has to read back to know a tap became a write, and
		    the alternative is finding it by its position between two buttons. */}
		<span data-testid={`score-${label}`} {...stylex.props(styles.score, value === null ? styles.unplayed : tone)}>
			{value ?? '–'}
		</span>

		<button
			type='button'
			aria-label={`${label} one more`}
			disabled={disabled}
			onClick={() => onChange((value ?? 0) + 1)}
			{...stylex.props(styles.step, utils.tap44)}
		>
			<PlusIcon {...stylex.props(styles.stepIcon)} aria-hidden='true' />
		</button>
	</div>
);

/**
 * One fixture on the scoreboard.
 *
 * A match with no document has never been played, so both sides read `–`
 * rather than `0`. Tapping either stepper is what brings it into existence,
 * which is why the first tap on the away side still has to send a `0` for the
 * home side, not leave it null.
 *
 * Once it has been played, the half that won it is filled in that side's
 * colour. Two 20px numbers either side of a `v` are the slowest way to read a
 * result, and the scoreboard is read far more often than it is filled in. The
 * table below says who finished where; this says who took this one.
 */
const MatchScore = ({
	fixture,
	match,
	sideSize,
	canScore,
	onScore,
	onClear,
}: {
	fixture: Fixture;
	match: TournamentMatch | undefined;
	sideSize: number;
	canScore: boolean;
	onScore: (scoreA: number, scoreB: number) => Promise<void> | void;
	onClear: () => Promise<void> | void;
}) => {
	const [scoreA, scoreB] = [match?.scoreA ?? null, match?.scoreB ?? null];
	const [styleA, styleB] = [teamStyle(fixture.teamA), teamStyle(fixture.teamB)];
	const outcome = match ? getMatchOutcome(match.scoreA, match.scoreB) : null;

	// Whether a side's score sits on a fill is the same question as whether that
	// side has a band, so it is asked once and the tone follows the band. Two
	// separate readings of the outcome is how a white number ends up on an
	// unfilled half.
	const [bandA, bandB] = [reachFor('a', outcome), reachFor('b', outcome)];

	return (
		// Until there is a result, each half of the row is washed in the colour of
		// the side that owns it. After it, the wash comes off and the fill below
		// says who took it, because both at once is a row painted end to end and
		// no outcome legible in it. `glassCard` sets a background *colour*; both
		// of these are images over it, so the frosting stays either way.
		<li {...stylex.props(surfaces.glassCard, styles.row, !match && wash.gradient(styleA.colour, styleB.colour))}>
			{/* Decoration and nothing else. The result is already in the two
			    numbers and in the table, so there is nothing here a screen
			    reader should be told twice. */}
			<span
				aria-hidden='true'
				{...stylex.props(band.base, band.start, band.fill(styleA.colour, 'right'), bandA)}
			/>
			<span aria-hidden='true' {...stylex.props(band.base, band.end, band.fill(styleB.colour, 'left'), bandB)} />

			<div {...stylex.props(styles.head)}>
				<span {...stylex.props(styles.meta)}>
					Match {fixture.order + 1} · {sideSize} a side
				</span>

				{/* Named rather than left as "Clear", because a scoreboard draws
				    one of these per fixture and a screen reader handed four
				    identical buttons cannot say which match any of them is
				    about. `tap44` because the label alone is about sixteen
				    pixels tall and this deletes a scoreline. */}
				{match && canScore && (
					<button
						type='button'
						onClick={() => onClear()}
						aria-label={`Clear the score for match ${fixture.order + 1}`}
						{...stylex.props(styles.clear, utils.tap44)}
					>
						Clear
					</button>
				)}
			</div>

			<div {...stylex.props(styles.body)}>
				<TeamBadge index={fixture.teamA} />

				<Stepper
					value={scoreA}
					disabled={!canScore}
					tone={bandA ? styles.onFill : styleA.text}
					label={`Team ${teamName(fixture.teamA)}`}
					onChange={next => onScore(next, scoreB ?? 0)}
				/>

				<span {...stylex.props(styles.meta)}>v</span>

				<Stepper
					value={scoreB}
					disabled={!canScore}
					tone={bandB ? styles.onFill : styleB.text}
					label={`Team ${teamName(fixture.teamB)}`}
					onChange={next => onScore(scoreA ?? 0, next)}
				/>

				<TeamBadge index={fixture.teamB} />
			</div>
		</li>
	);
};

export default MatchScore;
