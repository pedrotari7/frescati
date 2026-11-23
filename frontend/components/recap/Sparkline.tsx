import * as stylex from '@stylexjs/stylex';
import { toDisplayRating } from '@shared/rating';
import { colors, tint } from '../../app/tokens.stylex';
import { motion } from './motion';

const HEIGHT = 40;

const styles = stylex.create({
	frame: { position: 'relative', width: '100%', height: 120, marginTop: 24 },
	svg: { width: '100%', height: '100%', overflow: 'visible' },
	line: {
		fill: 'none',
		stroke: colors.brand,
		strokeWidth: 3,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
	},
	/*
	 * The end of the line is an HTML dot over the SVG rather than a circle in
	 * it: the drawing stretches to fill the slide, and a circle in it would
	 * stretch into an oval with it.
	 */
	end: {
		position: 'absolute',
		width: 14,
		height: 14,
		marginTop: -7,
		marginLeft: -7,
		borderRadius: 9999,
		backgroundColor: colors.brand,
		boxShadow: `0 0 0 6px ${tint.brand30}`,
	},
	at: (x: number, y: number) => ({ left: `${x}%`, top: `${y}%` }),
});

/**
 * The rating journey on the 0 to 100 scale every other screen shows. The line
 * draws itself from the first game to the last, and the dot pops in where it
 * ended once it gets there.
 */
const Sparkline = ({ elos }: { elos: number[] }) => {
	const values = elos.map(toDisplayRating);
	const [low, high] = [Math.min(...values), Math.max(...values)];
	const span = Math.max(1, high - low);
	const step = 100 / Math.max(1, values.length - 1);
	const height = (value: number) => HEIGHT - ((value - low) / span) * HEIGHT;
	const points = values.map((value, index) => `${index * step},${height(value)}`).join(' ');
	const lastValue = values[values.length - 1];

	return (
		<div aria-hidden='true' {...stylex.props(styles.frame)}>
			<svg
				viewBox={`0 0 100 ${HEIGHT}`}
				preserveAspectRatio='none'
				{...stylex.props(styles.svg, motion.draw, motion.after(400))}
			>
				<polyline points={points} vectorEffect='non-scaling-stroke' {...stylex.props(styles.line)} />
			</svg>
			<span
				data-end
				{...stylex.props(
					styles.end,
					styles.at((values.length - 1) * step, (height(lastValue) / HEIGHT) * 100),
					motion.pop,
					motion.after(1700)
				)}
			/>
		</div>
	);
};

export default Sparkline;
