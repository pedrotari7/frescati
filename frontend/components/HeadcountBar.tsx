import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { Game, Season } from '@shared/types';
import { getAwaitingSpotCount, getFormat, getHeadcountState, getMinPlayers, getNoResponseCount } from '@shared/game';
import { colors, tint } from '../app/tokens.stylex';
import StatusPill from './StatusPill';

const styles = stylex.create({
	head: { marginBottom: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
	count: { display: 'flex', alignItems: 'baseline', gap: 6 },
	number: { fontSize: 24, lineHeight: '32px', fontWeight: 700 },
	ok: { color: colors.in },
	short: { color: colors.pending },
	unit: { color: colors.faint, fontSize: 14, lineHeight: '20px' },

	track: { height: 6, overflow: 'hidden', borderRadius: 9999, backgroundColor: tint.white8 },
	fillBase: {
		height: '100%',
		borderRadius: 9999,
		transitionProperty: 'all',
		transitionDuration: '0.5s',
		transitionTimingFunction: 'ease-out',
	},
	fillOk: { backgroundColor: colors.in },
	fillShort: { backgroundColor: colors.pending },

	strip: {
		color: colors.faint,
		marginTop: 8,
		display: 'flex',
		flexWrap: 'wrap',
		columnGap: 12,
		rowGap: 4,
		fontSize: 12,
		lineHeight: '16px',
	},
	awaiting: { color: colors.pending },
});

/*
 * The one genuinely per-render value on the screen, so the one dynamic style in
 * this file. It was a bare `style={{ width }}`, which cannot stay: `stylex.props`
 * returns a `style` of its own for exactly this kind of value, and a second one
 * spread beside it would silently win or lose depending on the order.
 */
const fill = stylex.create({
	width: (percent: number) => ({ width: `${percent}%` }),
});

/**
 * Progress towards the season minimum. There is no cap. The bar fills to the
 * minimum and then simply reads "ready", because more players is never a
 * problem, only fewer is.
 */
const HeadcountBar = ({ game, season, sx }: { game: Game; season: Season; sx?: StyleXStyles }) => {
	const minimum = getMinPlayers(game, season);
	const { playing } = game.counts;
	const atRisk = getHeadcountState(game, season) === 'at-risk';
	const format = getFormat(playing);
	const awaiting = getNoResponseCount(game.counts, season.memberUids.length);
	const awaitingSpot = getAwaitingSpotCount(game.counts);

	const progress = minimum > 0 ? Math.min(100, (playing / minimum) * 100) : 100;

	return (
		<div {...stylex.props(sx)}>
			<div {...stylex.props(styles.head)}>
				<div {...stylex.props(styles.count)}>
					{/* The number an end-to-end test watches for the response
					    trigger's answer coming back down the listener. It is a
					    bare numeral with no accessible name of its own, and
					    matching on its text alone would find the scoreline and
					    the squad count too. */}
					<span
						data-testid='headcount-playing'
						{...stylex.props(styles.number, atRisk ? styles.short : styles.ok)}
					>
						{playing}
					</span>
					<span {...stylex.props(styles.unit)}>{atRisk ? `of ${minimum} needed` : 'playing'}</span>
				</div>

				{format && !atRisk && <StatusPill tone='brand'>{format}</StatusPill>}
				{atRisk && <StatusPill tone='pending'>Need {minimum - playing} more</StatusPill>}
			</div>

			<div {...stylex.props(styles.track)}>
				<div
					{...stylex.props(styles.fillBase, atRisk ? styles.fillShort : styles.fillOk, fill.width(progress))}
				/>
			</div>

			<div {...stylex.props(styles.strip)}>
				<span>{game.counts.membersIn} squad</span>
				{game.counts.extrasConfirmed > 0 && <span>{game.counts.extrasConfirmed} extra</span>}
				{/* The one item on this strip that is a request rather than a
				    report, and coloured for it: these are the people the number
				    above deliberately did not move for, and an admin is the only
				    one who can. Without it, an extra tapping In changes nothing
				    anybody can see. */}
				{awaitingSpot > 0 && <span {...stylex.props(styles.awaiting)}>{awaitingSpot} awaiting a spot</span>}
				{game.counts.membersOut > 0 && <span>{game.counts.membersOut} out</span>}
				{awaiting > 0 && <span>{awaiting} yet to answer</span>}
			</div>
		</div>
	);
};

export default HeadcountBar;
