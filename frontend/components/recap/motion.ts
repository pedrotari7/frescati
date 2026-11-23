import * as stylex from '@stylexjs/stylex';
import { colors, tint } from '../../app/tokens.stylex';

/**
 * The recap's motion, which is more than anything else in the app gets.
 *
 * Every other screen moves only to say "here I am" or "that just changed". The
 * recap is a send-off, watched once, so it is allowed to put on a show: slides
 * that come in from the side you are heading towards, a light that drifts
 * behind each one, steps that grow, a line that draws itself, confetti at either
 * end. Reduced motion needs nothing here, for the same reason as `Story`:
 * `globals.css` cuts every duration and delay short, and the drifting light is
 * left where its first keyframe puts it.
 */

const fromRight = stylex.keyframes({
	from: { opacity: 0, transform: 'translateX(48px) scale(0.96)' },
	to: { opacity: 1, transform: 'none' },
});

const fromLeft = stylex.keyframes({
	from: { opacity: 0, transform: 'translateX(-48px) scale(0.96)' },
	to: { opacity: 1, transform: 'none' },
});

const rise = stylex.keyframes({
	from: { opacity: 0, transform: 'translateY(16px)' },
	to: { opacity: 1, transform: 'none' },
});

const pop = stylex.keyframes({
	'0%': { opacity: 0, transform: 'scale(0.6)' },
	'60%': { opacity: 1, transform: 'scale(1.08)' },
	'100%': { opacity: 1, transform: 'none' },
});

const slideIn = stylex.keyframes({
	from: { opacity: 0, transform: 'translateX(-24px)' },
	to: { opacity: 1, transform: 'none' },
});

const grow = stylex.keyframes({
	from: { transform: 'scaleY(0)' },
	to: { transform: 'none' },
});

const fill = stylex.keyframes({
	from: { transform: 'scaleX(0)' },
	to: { transform: 'none' },
});

const draw = stylex.keyframes({
	from: { clipPath: 'inset(-20% 100% -20% 0)' },
	to: { clipPath: 'inset(-20% 0 -20% 0)' },
});

const drift = stylex.keyframes({
	'0%': { transform: 'translate(0, 0) scale(1)' },
	'50%': { transform: 'translate(36px, 24px) scale(1.2)' },
	'100%': { transform: 'translate(-24px, 12px) scale(0.9)' },
});

const turn = stylex.keyframes({
	from: { transform: 'rotate(0deg)' },
	to: { transform: 'rotate(360deg)' },
});

const shine = stylex.keyframes({
	from: { backgroundPosition: '200% 0' },
	to: { backgroundPosition: '0% 0' },
});

const fall = stylex.keyframes({
	'0%': { opacity: 1, transform: 'translateY(-24px) rotate(0deg)' },
	'80%': { opacity: 1 },
	'100%': { opacity: 0, transform: 'translateY(560px) rotate(720deg)' },
});

const springy = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const settle = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const motion = stylex.create({
	fromRight: { animationName: fromRight, animationDuration: '0.45s', animationTimingFunction: settle },
	fromLeft: { animationName: fromLeft, animationDuration: '0.45s', animationTimingFunction: settle },
	rise: {
		animationName: rise,
		animationDuration: '0.5s',
		animationTimingFunction: settle,
		animationFillMode: 'both',
	},
	pop: {
		animationName: pop,
		animationDuration: '0.55s',
		animationTimingFunction: springy,
		animationFillMode: 'both',
	},
	slideIn: {
		animationName: slideIn,
		animationDuration: '0.45s',
		animationTimingFunction: settle,
		animationFillMode: 'both',
	},
	grow: {
		transformOrigin: 'bottom',
		animationName: grow,
		animationDuration: '0.7s',
		animationTimingFunction: springy,
		animationFillMode: 'both',
	},
	fill: {
		transformOrigin: 'left',
		animationName: fill,
		animationDuration: '0.5s',
		animationTimingFunction: settle,
	},
	/*
	 * Uncovers a drawing from left to right. A clip rather than a dash offset,
	 * because the sparkline's stroke does not scale with it and a dash measured
	 * along a path that does is a thing browsers disagree about.
	 */
	draw: {
		animationName: draw,
		animationDuration: '1.4s',
		animationTimingFunction: 'ease-in-out',
		animationFillMode: 'both',
	},
	drift: {
		animationName: drift,
		animationDuration: '9s',
		animationTimingFunction: 'ease-in-out',
		animationIterationCount: 'infinite',
		animationDirection: 'alternate',
	},
	turn: {
		animationName: turn,
		animationDuration: '6s',
		animationTimingFunction: 'linear',
		animationIterationCount: 'infinite',
	},
	shine: {
		backgroundImage: `linear-gradient(100deg, ${colors.ink} 35%, ${colors.gold} 50%, ${colors.ink} 65%)`,
		backgroundSize: '200% 100%',
		backgroundClip: 'text',
		WebkitBackgroundClip: 'text',
		color: 'transparent',
		animationName: shine,
		animationDuration: '2.4s',
		animationTimingFunction: 'ease-in-out',
		animationDelay: '0.4s',
		animationFillMode: 'both',
	},
	fall: {
		animationName: fall,
		animationTimingFunction: 'cubic-bezier(0.25, 0.6, 0.5, 1)',
		animationFillMode: 'both',
	},
	/* Where a piece of a stagger sits in it. */
	after: (ms: number) => ({ animationDelay: `${ms}ms` }),
});

/** The light behind a slide, which says which part of the story it belongs to. */
export type Tone = 'brand' | 'gold' | 'flare' | 'sky';

export const glow = stylex.create({
	brand: { backgroundImage: `radial-gradient(circle, ${tint.brand30}, transparent 70%)` },
	gold: { backgroundImage: `radial-gradient(circle, ${tint.gold30}, transparent 70%)` },
	flare: { backgroundImage: `radial-gradient(circle, ${tint.flare30}, transparent 70%)` },
	sky: { backgroundImage: `radial-gradient(circle, ${tint.sky30}, transparent 70%)` },
});

/** Whether the reader is happy to see things move. */
export const prefersMotion = (): boolean =>
	typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches;
