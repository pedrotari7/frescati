import * as stylex from '@stylexjs/stylex';
import type { SeasonRow } from '@shared/leaderboard';
import { counted, placeLabel } from '@shared/format';
import { colors, tint } from '../../app/tokens.stylex';
import { motion } from './motion';

const styles = stylex.create({
	stand: {
		display: 'flex',
		alignItems: 'flex-end',
		justifyContent: 'center',
		gap: 8,
		marginTop: 32,
		padding: 0,
		listStyle: 'none',
	},
	step: { flexBasis: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 },
	names: {
		color: colors.ink,
		fontSize: 15,
		fontWeight: 700,
		lineHeight: 1.25,
		textAlign: 'center',
		overflowWrap: 'anywhere',
	},
	wins: { color: colors.muted, fontSize: 12, marginTop: 2, marginBottom: 8 },
	block: {
		width: '100%',
		display: 'flex',
		justifyContent: 'center',
		paddingTop: 12,
		borderTopLeftRadius: 14,
		borderTopRightRadius: 14,
		fontSize: 22,
		fontWeight: 800,
		color: colors.canvas,
	},
	first: { height: 150, backgroundImage: `linear-gradient(${colors.gold}, ${tint.gold30})` },
	second: { height: 110, backgroundImage: `linear-gradient(${colors.silver}, ${tint.silver30})` },
	third: { height: 80, backgroundImage: `linear-gradient(${colors.bronze}, ${tint.bronze30})` },
});

const BLOCKS = [styles.first, styles.second, styles.third];

/* Third goes up first and the winner last, so the biggest step lands last. */
const GROW_AFTER_MS = [1050, 700, 350];

/** The order a podium stands in: second, first, third. */
const STAND_ORDER = [1, 0, 2];

/**
 * The top of the table as a podium, with the steps growing out of the floor
 * and the names landing on top of them. Players level on points share a step,
 * so a podium can have fewer than three of them, and the gap where a step
 * would be is simply not drawn.
 */
const Podium = ({ rows, nameOf }: { rows: SeasonRow[]; nameOf: (uid: string) => string }) => {
	const steps = STAND_ORDER.map(position => rows.filter(row => row.position === position)).filter(
		level => level.length > 0
	);

	return (
		<ol {...stylex.props(styles.stand)}>
			{steps.map(level => {
				const { position, wins } = level[0];
				const after = GROW_AFTER_MS[position];

				return (
					<li key={position} {...stylex.props(styles.step)}>
						<p {...stylex.props(styles.names, motion.pop, motion.after(after + 450))}>
							{level.map(row => nameOf(row.uid)).join(', ')}
						</p>
						<p {...stylex.props(styles.wins, motion.rise, motion.after(after + 550))}>
							{counted(wins, 'win')}
						</p>
						<div {...stylex.props(styles.block, BLOCKS[position], motion.grow, motion.after(after))}>
							{placeLabel(position, level.length > 1)}
						</div>
					</li>
				);
			})}
		</ol>
	);
};

export default Podium;
