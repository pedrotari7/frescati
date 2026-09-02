import * as stylex from '@stylexjs/stylex';
import { bp, colors, shadows, tint } from '../app/tokens.stylex';

/**
 * The styles more than one component needs.
 *
 * Under Tailwind these were `@layer components` rules in `globals.css` and
 * `@theme` animations, reached by name from a `className`. StyleX has no global
 * class to reach for, so the same shapes are exported as style objects and
 * imported by the components that use them, which is the one real difference:
 * a style nothing imports is a style that ships in no stylesheet, where a dead
 * `.glass` rule sat in the CSS forever waiting for someone to notice.
 *
 * Anything used by exactly one component stays in that component.
 */

const fadeIn = stylex.keyframes({
	from: { opacity: 0 },
	to: { opacity: 1 },
});

const rise = stylex.keyframes({
	from: { opacity: 0, transform: 'translateY(10px)' },
	to: { opacity: 1, transform: 'translateY(0)' },
});

const pop = stylex.keyframes({
	'0%': { transform: 'scale(0.85)', opacity: 0 },
	'60%': { transform: 'scale(1.06)', opacity: 1 },
	'100%': { transform: 'scale(1)', opacity: 1 },
});

const shimmer = stylex.keyframes({
	'100%': { transform: 'translateX(100%)' },
});

const spin = stylex.keyframes({
	from: { transform: 'rotate(0deg)' },
	to: { transform: 'rotate(360deg)' },
});

export const animations = stylex.create({
	fadeIn: {
		animationName: fadeIn,
		animationDuration: '0.3s',
		animationTimingFunction: 'ease-out',
		animationFillMode: 'both',
	},
	rise: {
		animationName: rise,
		animationDuration: '0.35s',
		animationTimingFunction: 'ease-out',
		animationFillMode: 'both',
	},
	pop: {
		animationName: pop,
		animationDuration: '0.35s',
		animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
		animationFillMode: 'both',
	},
	shimmer: {
		animationName: shimmer,
		animationDuration: '1.6s',
		animationIterationCount: 'infinite',
	},
	spin: {
		animationName: spin,
		animationDuration: '1s',
		animationTimingFunction: 'linear',
		animationIterationCount: 'infinite',
	},
});

export const surfaces = stylex.create({
	/** The frosted panel almost every card and list in the app sits on. */
	glass: {
		backgroundColor: 'rgb(255 255 255 / 0.045)',
		backdropFilter: 'blur(16px)',
		WebkitBackdropFilter: 'blur(16px)',
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.white8,
	},

	/**
	 * The same panel where it is something you can press.
	 *
	 * The hover pair is nested under `@media (hover: hover)` rather than written
	 * as a bare `:hover`, which is what the Tailwind version did too: on iOS a
	 * bare hover sticks to the last thing tapped until something else is.
	 */
	glassCard: {
		backgroundColor: {
			default: 'rgb(255 255 255 / 0.035)',
			[bp.hover]: { default: null, ':hover': tint.white6 },
		},
		backdropFilter: 'blur(12px)',
		WebkitBackdropFilter: 'blur(12px)',
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: {
			default: 'rgb(255 255 255 / 0.07)',
			[bp.hover]: { default: null, ':hover': 'rgb(255 255 255 / 0.14)' },
		},
		transitionProperty: 'background-color, border-color, transform',
		transitionDuration: '0.2s',
		transitionTimingFunction: 'ease',
		transform: { default: null, ':active': 'scale(0.99)' },
	},

	/**
	 * Same frosted look, opaque enough to read over. The bottom nav sits on top
	 * of scrolling page content rather than a fixed backdrop, so the 4.5% tint
	 * above let card text bleed through and collide with the tab labels.
	 */
	glassNav: {
		backgroundColor: 'rgb(15 17 21 / 0.92)',
		backdropFilter: 'blur(16px)',
		WebkitBackdropFilter: 'blur(16px)',
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.white8,
	},
});

export const utils = stylex.create({
	/**
	 * A 44px tap target around something deliberately drawn smaller.
	 *
	 * The scoreboard is the case this exists for: two steppers and two bibs have
	 * to fit across a phone, so the buttons are 36px and cannot simply grow, but
	 * they are filled in at the side of a pitch, by somebody with cold hands, and
	 * 36px is under every guideline there is.
	 *
	 * Paints nothing and occupies no space. The pseudo-element collapses to the
	 * element's centre and is then expanded by its own minimums, so it works
	 * whatever size the thing it is on happens to be, and nothing around it moves.
	 * `WatchToggle` solves the same problem with a negative margin, which only
	 * works where the row has slack to give.
	 */
	tap44: {
		position: 'relative',
		'::after': {
			content: '""',
			position: 'absolute',
			insetInlineStart: '50%',
			insetBlockStart: '50%',
			minWidth: 44,
			minHeight: 44,
			transform: 'translate(-50%, -50%)',
		},
	},

	/**
	 * One line, cut with an ellipsis. Tailwind's `truncate`, which was on 60-odd
	 * elements: every name in a roster, every label in the books.
	 *
	 * Three properties that only work together, which is the argument for it
	 * being one export rather than three lines repeated. It still needs whatever
	 * flex parent it sits in to allow shrinking, `minWidth: 0` on the item; that
	 * part is local and stays at the call site.
	 */
	truncate: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

	/** A scroller with no visible bar, for the horizontal strips. */
	noScrollbar: {
		scrollbarWidth: 'none',
		'::-webkit-scrollbar': { display: 'none' },
	},

	/*
	 * The notch and the home indicator, for anything painting under them.
	 *
	 * These used to be `@utility` rules, and combined badly with any other
	 * padding on the same element: two classes setting one property left the
	 * winner to source order. StyleX settles that properly, the later style in
	 * a `stylex.props` call wins, so these can be composed without care. Where a
	 * fixed offset has to clear the home indicator *as well*, say so in one
	 * value with a `calc()` rather than stacking two of these.
	 */
	pbSafe: { paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
	ptSafe: { paddingTop: 'env(safe-area-inset-top, 0px)' },
	mbSafe: { marginBottom: 'env(safe-area-inset-bottom, 0px)' },
});

/**
 * The wash a pressable row takes under a finger or a pointer.
 *
 * Both states have to be one property, and the press has to be repeated inside
 * the hover query, because StyleX settles a collision by priority rather than by
 * source order. Measured on `backgroundColor`: the resting value scores 3000, a
 * bare `:active` 3170, a `:hover` inside `@media (hover: hover)` 6130 and an
 * `:active` inside it 6170. So a bare press loses to a hover it has nothing to
 * do with, and only the copy inside the query outranks it. Written the obvious
 * way, a click on a desktop shows the lighter hover wash and the press never
 * lands. Tailwind got the same pair for free by writing `active:` after `hover:`
 * in the sheet.
 *
 * One property, and the resting state is spelled out rather than left null,
 * because a later style replaces a property outright: composed after a base
 * that says `backgroundColor: transparent`, a null default would drop that and
 * hand a `<button>` back to whatever the browser paints one. For the same
 * reason a row that wants a resting colour of its own cannot get it by setting
 * one after this; it has to carry the whole pair itself, the way the table's
 * own row does.
 *
 * Colours only. Every row that uses this already declares its own transition,
 * and folding one in here would silently retime whichever of them composed it
 * last.
 */
export const press = stylex.create({
	wash: {
		backgroundColor: {
			default: 'transparent',
			':active': tint.white10,
			[bp.hover]: { default: null, ':hover': tint.white5, ':active': tint.white10 },
		},
	},
});

/**
 * A chevron that leans towards wherever its row goes, while the row is hovered.
 *
 * Tailwind wrote this as `group-hover:translate-x-0.5` on the chevron, which is
 * a child reacting to its parent's state. StyleX has no parent selector and no
 * `group`, so the parent sets a custom property on its own hover and the child
 * reads it, which is what the `group` class was doing underneath anyway. Put
 * `nudge.row` on the link and `nudge.chevron` on the icon inside it.
 */
export const nudge = stylex.create({
	row: { '--nudge': { default: '0px', [bp.hover]: { default: null, ':hover': '2px' } } },
	chevron: {
		transform: 'translateX(var(--nudge, 0px))',
		transitionProperty: 'transform',
		transitionDuration: '0.2s',
	},
});

/**
 * The focus ring every control in the app wears.
 *
 * Tailwind spelled this `focus-visible:ring-2 focus-visible:ring-brand/60`
 * three ways in four files. It is one thing, so it is one export.
 */
export const focus = stylex.create({
	ring: {
		outline: { default: 'none', ':focus-visible': `2px solid ${tint.brand60}` },
		outlineOffset: 1,
	},
});

/** The type scale, which was `text-xs`/`text-sm` and a colour, everywhere. */
export const text = stylex.create({
	ink: { color: colors.ink },
	muted: { color: colors.muted },
	faint: { color: colors.faint },
	/** A small-caps section label. */
	sectionHeading: {
		color: colors.faint,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},
});

export const elevation = stylex.create({
	glass: { boxShadow: shadows.glass },
	card: { boxShadow: shadows.card },
	lift: { boxShadow: shadows.lift },
});
