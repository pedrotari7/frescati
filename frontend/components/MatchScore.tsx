'use client';

import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { Fixture } from '@shared/tournament';
import type { TournamentMatch } from '@shared/types';
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

	row: { borderRadius: 16, padding: 12 },
	head: { marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
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
	body: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
});

/**
 * The wash across a fixture, in the two teams' colours.
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
	/** The scoring team's colour, so the number itself says whose it is. */
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

	return (
		// Each half of the row is washed in the colour of the side that owns it,
		// so which stepper belongs to whom survives a glance rather than needing
		// the letter read. `glassCard` sets a background *colour*; this is an
		// image over it, so the frosting stays.
		<li {...stylex.props(surfaces.glassCard, styles.row, wash.gradient(styleA.colour, styleB.colour))}>
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
					tone={styleA.text}
					label={`Team ${teamName(fixture.teamA)}`}
					onChange={next => onScore(next, scoreB ?? 0)}
				/>

				<span {...stylex.props(styles.meta)}>v</span>

				<Stepper
					value={scoreB}
					disabled={!canScore}
					tone={styleB.text}
					label={`Team ${teamName(fixture.teamB)}`}
					onChange={next => onScore(scoreA ?? 0, next)}
				/>

				<TeamBadge index={fixture.teamB} />
			</div>
		</li>
	);
};

export default MatchScore;
