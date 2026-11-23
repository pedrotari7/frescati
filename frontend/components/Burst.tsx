'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';
import { prefersMotion } from './recap/motion';

const SPARKS = 12;

/*
 * Each spark flies out along its own line, which the keyframe reads off two
 * custom properties the spark carries. One keyframe for all twelve rather than
 * twelve keyframes.
 */
const fly = stylex.keyframes({
	from: { opacity: 1, transform: 'translate(0, 0) scale(1)' },
	to: { opacity: 0, transform: 'translate(var(--burst-x), var(--burst-y)) scale(0.3)' },
});

const styles = stylex.create({
	field: { position: 'absolute', inset: 0, pointerEvents: 'none' },
	spark: {
		position: 'absolute',
		insetInlineStart: '50%',
		insetBlockStart: '50%',
		width: 6,
		height: 6,
		marginInlineStart: -3,
		marginBlockStart: -3,
		borderRadius: 9999,
		animationName: fly,
		animationDuration: '0.45s',
		animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
		animationFillMode: 'both',
	},
	in: { backgroundColor: colors.in },
	gold: { backgroundColor: colors.gold },
	ink: { backgroundColor: colors.ink },
	towards: (x: number, y: number) => ({ '--burst-x': `${x}px`, '--burst-y': `${y}px` }),
});

const PAINT = [styles.in, styles.gold, styles.ink];

/*
 * Evenly round the circle, flattened to the button's shape. A wide, short
 * control wants its sparks thrown sideways more than up and down. Alternate
 * sparks go a little further, so the ring reads as a burst rather than a dial.
 */
const towards = (index: number) => {
	const angle = (index / SPARKS) * Math.PI * 2;
	const reach = index % 2 === 0 ? 1 : 0.7;

	return { x: Math.round(Math.cos(angle) * 90 * reach), y: Math.round(Math.sin(angle) * 44 * reach) };
};

/**
 * Sparks thrown off a control at the moment it takes a yes. Sits inside the
 * control, which has to be positioned, and plays once on mount. The caller
 * mounts it for exactly as long as the answer is landing.
 *
 * Decoration, so hidden from assistive tech, and left out for a reader who has
 * asked for less motion rather than drawn as a frozen ring of dots.
 */
const Burst = () => {
	const [moving] = useState(prefersMotion);

	if (!moving) return null;

	return (
		<span aria-hidden='true' {...stylex.props(styles.field)}>
			{Array.from({ length: SPARKS }, (_, index) => {
				const { x, y } = towards(index);

				return (
					<span
						key={index}
						{...stylex.props(styles.spark, PAINT[index % PAINT.length], styles.towards(x, y))}
					/>
				);
			})}
		</span>
	);
};

export default Burst;
