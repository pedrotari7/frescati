'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, tint } from '../../app/tokens.stylex';
import { motion } from './motion';

/** How far a finger has to travel sideways before it is a swipe and not a tap. */
const SWIPE_PX = 40;

const styles = stylex.create({
	stage: {
		position: 'relative',
		display: 'flex',
		flexDirection: 'column',
		width: '100%',
		maxWidth: 420,
		marginInline: 'auto',
		minHeight: 'min(680px, calc(100dvh - 180px))',
		borderRadius: 28,
		overflow: 'hidden',
		backgroundColor: colors.surface,
		touchAction: 'pan-y',
		userSelect: 'none',
	},
	progress: { display: 'flex', gap: 4, padding: 12, position: 'relative', zIndex: 2 },
	segment: { flexGrow: 1, height: 3, borderRadius: 9999, overflow: 'hidden', backgroundColor: tint.white15 },
	segmentFill: { display: 'block', height: '100%', backgroundColor: colors.ink },
	slide: {
		position: 'relative',
		zIndex: 1,
		flexGrow: 1,
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
		paddingInline: 24,
		paddingBottom: 40,
		pointerEvents: 'none',
	},
	/* Clicks fall through the slide to these, except on a link inside it. */
	zones: { position: 'absolute', inset: 0, display: 'flex', zIndex: 0 },
	zone: {
		appearance: 'none',
		borderWidth: 0,
		backgroundColor: 'transparent',
		flexGrow: 1,
		cursor: { default: 'pointer', ':disabled': 'default' },
		outline: { default: 'none', ':focus-visible': `2px solid ${colors.brand}` },
		outlineOffset: -4,
	},
	back: { flexGrow: 1 },
	forward: { flexGrow: 2 },
});

/**
 * A run of full-height slides with a progress bar, the shape a phone already
 * knows from every other story it shows.
 *
 * The left third goes back and the rest goes forward, because forward is what
 * almost every tap means. Arrow keys and a sideways swipe do the same, for a
 * desktop window and for a thumb. `onLast` fires the first time the last slide
 * is reached and never again, so going back and forward over it can't write
 * anything twice. A slide comes in from the side the story is heading towards,
 * and the segment it belongs to fills as it does. Reduced motion needs nothing
 * here: `globals.css` already cuts every animation short for it.
 */
const Story = ({ slides, onLast }: { slides: ReactNode[]; onLast: () => void }) => {
	const [index, setIndex] = useState(0);
	const [forward, setForward] = useState(true);
	const reachedEnd = useRef(false);
	const swipeFrom = useRef<number | null>(null);
	const last = slides.length - 1;

	const go = useCallback(
		(step: number) => {
			setForward(step > 0);
			setIndex(current => Math.max(0, Math.min(last, current + step)));
		},
		[last]
	);

	useEffect(() => {
		if (index !== last || reachedEnd.current) return;

		reachedEnd.current = true;
		onLast();
	}, [index, last, onLast]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'ArrowRight') go(1);
			if (event.key === 'ArrowLeft') go(-1);
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [go]);

	const endSwipe = (x: number) => {
		const from = swipeFrom.current;
		swipeFrom.current = null;

		if (from === null || Math.abs(x - from) < SWIPE_PX) return;
		go(x < from ? 1 : -1);
	};

	return (
		<div
			data-testid='story'
			{...stylex.props(styles.stage)}
			onPointerDown={event => (swipeFrom.current = event.clientX)}
			onPointerUp={event => endSwipe(event.clientX)}
		>
			<div
				role='progressbar'
				aria-label='Recap progress'
				aria-valuemin={1}
				aria-valuemax={slides.length}
				aria-valuenow={index + 1}
				{...stylex.props(styles.progress)}
			>
				{slides.map((_, position) => (
					<span key={position} {...stylex.props(styles.segment)}>
						{position <= index && (
							<span
								key={position === index ? `at-${index}` : 'done'}
								{...stylex.props(styles.segmentFill, position === index && motion.fill)}
							/>
						)}
					</span>
				))}
			</div>

			<div {...stylex.props(styles.zones)}>
				<button
					type='button'
					aria-label='Previous'
					disabled={index === 0}
					onClick={() => go(-1)}
					{...stylex.props(styles.zone, styles.back)}
				/>
				<button
					type='button'
					aria-label='Next'
					disabled={index === last}
					onClick={() => go(1)}
					{...stylex.props(styles.zone, styles.forward)}
				/>
			</div>

			<div key={index} {...stylex.props(styles.slide, forward ? motion.fromRight : motion.fromLeft)}>
				{slides[index]}
			</div>
		</div>
	);
};

export default Story;
