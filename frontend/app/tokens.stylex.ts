import * as stylex from '@stylexjs/stylex';

/**
 * Design tokens. The app is permanently dark, so there is one palette and no
 * light variant anywhere, components reference these names, never hex.
 *
 * This file replaces the `@theme` block Tailwind used to read. It has to be
 * named `*.stylex.ts`: StyleX derives each variable's hashed name from the path
 * of the file that defines it, and only files with that suffix may define any,
 * which is what stops one token being declared twice under two names. For the
 * same reason nothing but `defineVars` and `defineConsts` may be exported here,
 * so the shared styles built out of these live in `lib/styles.ts` instead.
 */

/** Surfaces, darkest to lightest, then text, then the meanings. */
export const colors = stylex.defineVars({
	canvas: '#07080a',
	surface: '#0f1115',
	raised: '#171a20',
	line: '#262b34',

	ink: '#f3f5f8',
	muted: '#98a1b1',
	faint: '#626b7a',

	/* Brand: floodlit pitch green. */
	brand: '#3ddc84',
	brandStrong: '#1db954',
	brandDeep: '#0b3d22',

	/* Availability states. These carry meaning; don't reuse them decoratively. */
	in: '#34d399',
	out: '#fb7185',
	pending: '#fbbf24',
	extra: '#60a5fa',

	/*
	 * Bibs. A team's identity on the pitch, deliberately none of the four above,
	 * a squad tinted the same green as "in" reads as a status, not a side.
	 * Four is the ceiling, so there are four.
	 */
	teamA: '#22d3ee',
	teamB: '#a78bfa',
	teamC: '#fb923c',
	teamD: '#e879f9',
});

/**
 * The palette at less than full strength.
 *
 * Tailwind wrote these inline as `bg-brand/15`, and the slash did the arithmetic
 * at build time. StyleX has no equivalent, and it cannot: a token is a CSS
 * variable, so its value is not known until the browser resolves it, and a
 * plugin that runs before then has nothing to take 15% of. The browser can,
 * with `color-mix`, which is what every entry below compiles to.
 *
 * `defineConsts` rather than `defineVars` on purpose. These inline where they
 * are used and declare no custom property of their own, so the stylesheet
 * carries one variable per colour rather than one per colour per opacity.
 *
 * The names are the Tailwind ones with the slash closed up, `bg-brand/15`
 * becoming `tint.brand15`, so the port can be read against what it replaced.
 * Adding an opacity means adding a line here rather than inventing a value at
 * the call site, which is the same rule the palette above has always had.
 */
export const tint = stylex.defineConsts({
	/* Neutral lifts, used for every raised surface and hairline in the app. */
	white5: 'rgb(255 255 255 / 0.05)',
	white6: 'rgb(255 255 255 / 0.06)',
	white8: 'rgb(255 255 255 / 0.08)',
	white10: 'rgb(255 255 255 / 0.10)',
	white12: 'rgb(255 255 255 / 0.12)',
	white15: 'rgb(255 255 255 / 0.15)',
	white20: 'rgb(255 255 255 / 0.20)',

	brand5: `color-mix(in srgb, ${colors.brand} 5%, transparent)`,
	brand10: `color-mix(in srgb, ${colors.brand} 10%, transparent)`,
	brand15: `color-mix(in srgb, ${colors.brand} 15%, transparent)`,
	brand20: `color-mix(in srgb, ${colors.brand} 20%, transparent)`,
	brand25: `color-mix(in srgb, ${colors.brand} 25%, transparent)`,
	brand30: `color-mix(in srgb, ${colors.brand} 30%, transparent)`,
	brand40: `color-mix(in srgb, ${colors.brand} 40%, transparent)`,
	brand50: `color-mix(in srgb, ${colors.brand} 50%, transparent)`,
	brand60: `color-mix(in srgb, ${colors.brand} 60%, transparent)`,

	in8: `color-mix(in srgb, ${colors.in} 8%, transparent)`,
	in10: `color-mix(in srgb, ${colors.in} 10%, transparent)`,
	in15: `color-mix(in srgb, ${colors.in} 15%, transparent)`,
	in20: `color-mix(in srgb, ${colors.in} 20%, transparent)`,
	in25: `color-mix(in srgb, ${colors.in} 25%, transparent)`,

	out8: `color-mix(in srgb, ${colors.out} 8%, transparent)`,
	out10: `color-mix(in srgb, ${colors.out} 10%, transparent)`,
	out12: `color-mix(in srgb, ${colors.out} 12%, transparent)`,
	out15: `color-mix(in srgb, ${colors.out} 15%, transparent)`,
	out20: `color-mix(in srgb, ${colors.out} 20%, transparent)`,
	out25: `color-mix(in srgb, ${colors.out} 25%, transparent)`,
	out30: `color-mix(in srgb, ${colors.out} 30%, transparent)`,

	pending8: `color-mix(in srgb, ${colors.pending} 8%, transparent)`,
	pending10: `color-mix(in srgb, ${colors.pending} 10%, transparent)`,
	pending12: `color-mix(in srgb, ${colors.pending} 12%, transparent)`,
	pending15: `color-mix(in srgb, ${colors.pending} 15%, transparent)`,
	pending25: `color-mix(in srgb, ${colors.pending} 25%, transparent)`,
	pending30: `color-mix(in srgb, ${colors.pending} 30%, transparent)`,

	extra15: `color-mix(in srgb, ${colors.extra} 15%, transparent)`,
	extra25: `color-mix(in srgb, ${colors.extra} 25%, transparent)`,

	/* Scrims. A bar that page content scrolls under, rather than a tint. */
	canvas80: `color-mix(in srgb, ${colors.canvas} 80%, transparent)`,
	raised95: `color-mix(in srgb, ${colors.raised} 95%, transparent)`,
	line60: `color-mix(in srgb, ${colors.line} 60%, transparent)`,

	teamA12: `color-mix(in srgb, ${colors.teamA} 12%, transparent)`,
	teamB12: `color-mix(in srgb, ${colors.teamB} 12%, transparent)`,
	teamC12: `color-mix(in srgb, ${colors.teamC} 12%, transparent)`,
	teamD12: `color-mix(in srgb, ${colors.teamD} 12%, transparent)`,
	teamA15: `color-mix(in srgb, ${colors.teamA} 15%, transparent)`,
	teamB15: `color-mix(in srgb, ${colors.teamB} 15%, transparent)`,
	teamC15: `color-mix(in srgb, ${colors.teamC} 15%, transparent)`,
	teamD15: `color-mix(in srgb, ${colors.teamD} 15%, transparent)`,
	teamA40: `color-mix(in srgb, ${colors.teamA} 40%, transparent)`,
	teamB40: `color-mix(in srgb, ${colors.teamB} 40%, transparent)`,
	teamC40: `color-mix(in srgb, ${colors.teamC} 40%, transparent)`,
	teamD40: `color-mix(in srgb, ${colors.teamD} 40%, transparent)`,
});

export const fonts = stylex.defineVars({
	sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
	/*
	 * For the handful of things that are strings rather than words: a calendar
	 * URL to copy, a Swish number to type in, a script name. Named here rather
	 * than repeated at four call sites, and named at all rather than left to the
	 * browser's `<code>` default, which is 13px next to 14px prose.
	 */
	mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
});

export const shadows = stylex.defineVars({
	glass: '0 8px 32px rgb(0 0 0 / 0.35)',
	card: '0 4px 24px rgb(0 0 0 / 0.28)',
	lift: '0 12px 32px rgb(0 0 0 / 0.45)',
});

/**
 * Media queries, as constants rather than variables.
 *
 * `defineConsts` is the only thing that works here: a media query's condition is
 * parsed by the browser before any variable is resolved, so
 * `@media (min-width: var(--sm))` is not a rule that can ever match. These
 * inline instead.
 *
 * The three widths are Tailwind's, kept to the pixel, because they are what
 * every breakpoint in the app was already written against.
 */
export const bp = stylex.defineConsts({
	sm: '@media (min-width: 640px)',
	md: '@media (min-width: 768px)',
	lg: '@media (min-width: 1024px)',

	/**
	 * A device whose main pointer can hover, which is a desktop and not a phone.
	 * Every hover style in the app is nested inside this, so that a tap does not
	 * leave a row looking hovered until something else is touched, which is what
	 * an unguarded `:hover` does on iOS.
	 */
	hover: '@media (hover: hover)',
	/** The inverse, for the one control that only makes sense on a phone. */
	coarse: '@media (pointer: coarse)',
	/**
	 * A pointer you can drag with. Narrower than `hover` on purpose: this is for
	 * the one line that advertises dropping a file, and a phone that cannot drag
	 * should not be told to.
	 */
	fine: '@media (pointer: fine)',
	reducedMotion: '@media (prefers-reduced-motion: reduce)',
});
