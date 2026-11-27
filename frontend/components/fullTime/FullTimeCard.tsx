import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { FullTimeCard as Card } from '@shared/fullTime';
import { formatGameDateLong, placeLabel } from '@shared/format';
import { toDisplayRating } from '@shared/rating';
import { colors, tint } from '../../app/tokens.stylex';
import { animations, surfaces } from '../../lib/styles';
import Button from '../Button';
import RatingMovement from '../RatingMovement';
import Confetti from '../recap/Confetti';
import CountUp from '../recap/CountUp';
import { teamName, teamStyle } from '../TeamBadge';
import { describeHighlight } from './describeHighlight';

const land = stylex.keyframes({
	from: { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
	to: { opacity: 1, transform: 'none' },
});

const styles = stylex.create({
	card: {
		position: 'relative',
		overflow: 'hidden',
		borderRadius: 28,
		padding: 24,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: 16,
		textAlign: 'center',
		maxWidth: 420,
		marginInline: 'auto',
		width: '100%',
	},
	beat: (delayMs: number) => ({
		animationName: land,
		animationDuration: '0.5s',
		animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
		animationFillMode: 'both',
		animationDelay: `${delayMs}ms`,
	}),
	kicker: {
		color: colors.brand,
		fontSize: 13,
		fontWeight: 700,
		letterSpacing: '0.12em',
		textTransform: 'uppercase',
		margin: 0,
	},
	date: { color: colors.muted, fontSize: 14, margin: 0 },
	team: { fontSize: 28, fontWeight: 800, margin: 0 },
	finish: { color: colors.ink, fontSize: 18, fontWeight: 600, margin: 0 },
	record: { color: colors.muted, fontSize: 15, fontVariantNumeric: 'tabular-nums', margin: 0 },
	rating: {
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'center',
		gap: 12,
		paddingBlock: 16,
		paddingInline: 24,
		borderRadius: 20,
		backgroundColor: tint.white5,
	},
	ratingLabel: { color: colors.muted, fontSize: 13 },
	ratingNumber: { color: colors.ink, fontSize: 44, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
	movement: { fontSize: 18 },
	highlights: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
	highlight: { color: colors.pending, fontSize: 16, fontWeight: 600 },
	actions: { display: 'flex', gap: 12, width: '100%', marginTop: 8 },
	action: { flexGrow: 1, flexBasis: 0 },
});

const finishLabel = (card: Card): string => {
	if (card.shared) return card.position === 0 ? 'Level first' : `Level ${placeLabel(card.position)}`;

	return `${placeLabel(card.position)} of ${card.teamCount}`;
};

/**
 * One player's night on one card: where their team finished, its record, their
 * rating moving, and a highlight or two. A win throws the recap's confetti.
 *
 * `children` is for whatever the screen needs alongside the card without it
 * showing, which is the palette the share image is painted in.
 */
const FullTimeCard = ({
	card,
	timezone,
	onShare,
	onDone,
	children,
}: {
	card: Card;
	timezone: string;
	onShare: () => void;
	onDone: () => void;
	children?: ReactNode;
}) => (
	<article {...stylex.props(surfaces.glass, animations.rise, styles.card)}>
		{card.position === 0 && <Confetti />}
		{children}

		<p {...stylex.props(styles.kicker, styles.beat(0))}>Full time</p>
		<p {...stylex.props(styles.date, styles.beat(0))}>{formatGameDateLong(card.kickoff, timezone)}</p>

		<p {...stylex.props(styles.team, teamStyle(card.team).text, styles.beat(150))}>Team {teamName(card.team)}</p>
		<p {...stylex.props(styles.finish, styles.beat(150))}>{finishLabel(card)}</p>
		<p {...stylex.props(styles.record, styles.beat(150))}>
			W {card.record.won} · D {card.record.drawn} · L {card.record.lost}
		</p>

		<div {...stylex.props(styles.rating, styles.beat(300))}>
			<span {...stylex.props(styles.ratingLabel)}>Rating</span>
			<span aria-label='Rating' {...stylex.props(styles.ratingNumber)}>
				<CountUp from={toDisplayRating(card.before)} value={toDisplayRating(card.after)} />
			</span>
			<RatingMovement delta={card.delta} sx={styles.movement} />
		</div>

		{card.highlights.length > 0 && (
			<ul {...stylex.props(styles.highlights, styles.beat(500))}>
				{card.highlights.map(highlight => (
					<li key={highlight.kind} {...stylex.props(styles.highlight)}>
						{describeHighlight(highlight)}
					</li>
				))}
			</ul>
		)}

		<div {...stylex.props(styles.actions, styles.beat(600))}>
			<Button variant='secondary' sx={styles.action} onClick={onShare}>
				Share
			</Button>
			<Button variant='primary' sx={styles.action} onClick={onDone}>
				Done
			</Button>
		</div>
	</article>
);

export default FullTimeCard;
