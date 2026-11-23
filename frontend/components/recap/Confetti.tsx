'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../../app/tokens.stylex';
import { motion, prefersMotion } from './motion';

const PIECES = 28;

const styles = stylex.create({
	field: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' },
	piece: { position: 'absolute', top: 0, width: 8, height: 12, borderRadius: 2 },
	round: { width: 9, height: 9, borderRadius: 9999 },
	brand: { backgroundColor: colors.brand },
	gold: { backgroundColor: colors.gold },
	flare: { backgroundColor: colors.flare },
	sky: { backgroundColor: colors.sky },
	ink: { backgroundColor: colors.ink },
	at: (left: number, duration: number) => ({ left: `${left}%`, animationDuration: `${duration}ms` }),
});

const PAINT = [styles.brand, styles.gold, styles.flare, styles.sky, styles.ink];

/*
 * Scattered, but the same scatter every time: a piece's place, speed and start
 * come from its index through a couple of primes, so a render and a re-render
 * agree and a test has nothing random to pin down.
 */
const scatter = (index: number) => ({
	left: (index * 37) % 100,
	duration: 1600 + ((index * 53) % 1200),
	delay: (index * 71) % 600,
});

/**
 * A burst of confetti over the slide it sits in, once, for the opening and the
 * goodbye. Nobody has to read it, so it is hidden from assistive tech, and it
 * is left out entirely for a reader who has asked for less motion rather than
 * shown frozen in mid-air.
 */
const Confetti = () => {
	const [moving] = useState(prefersMotion);

	if (!moving) return null;

	return (
		<div aria-hidden='true' {...stylex.props(styles.field)}>
			{Array.from({ length: PIECES }, (_, index) => {
				const { left, duration, delay } = scatter(index);

				return (
					<span
						key={index}
						{...stylex.props(
							styles.piece,
							index % 3 === 0 && styles.round,
							PAINT[index % PAINT.length],
							motion.fall,
							styles.at(left, duration),
							motion.after(delay)
						)}
					/>
				);
			})}
		</div>
	);
};

export default Confetti;
