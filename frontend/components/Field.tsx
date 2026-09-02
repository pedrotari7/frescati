import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	/*
	 * Exported as `CONTROL` so other controls that don't fit `<input>`/`<select>`,
	 * DatePicker's trigger button, still look like they belong on this form.
	 *
	 * The ring is an inset shadow, as everywhere else in the app, and the focus
	 * state swaps its colour rather than adding a second ring, which is what
	 * `focus:ring-brand/50` on top of `ring-white/10` actually did.
	 */
	control: {
		width: '100%',
		borderRadius: 12,
		backgroundColor: tint.white5,
		paddingInline: 12,
		height: 48,
		color: colors.ink,
		boxShadow: { default: `inset 0 0 0 1px ${tint.white10}`, ':focus': `inset 0 0 0 1px ${tint.brand50}` },
		outline: { default: null, ':focus': 'none' },
		transitionProperty: 'box-shadow',
		transitionDuration: '0.15s',
		'::placeholder': { color: colors.faint },
	},

	label: { display: 'block' },
	labelText: {
		color: colors.muted,
		marginBottom: 6,
		display: 'block',
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		letterSpacing: '0.025em',
		textTransform: 'uppercase',
	},
	hint: { color: colors.faint, marginTop: 6, display: 'block', fontSize: 12, lineHeight: '16px' },

	selectWrap: { position: 'relative' },
	select: { appearance: 'none', paddingRight: 40 },
	chevron: {
		color: colors.faint,
		pointerEvents: 'none',
		position: 'absolute',
		top: '50%',
		right: 12,
		width: 20,
		height: 20,
		transform: 'translateY(-50%)',
	},

	searchWrap: { position: 'relative' },
	search: { paddingLeft: 40 },
	glass: {
		color: colors.faint,
		pointerEvents: 'none',
		position: 'absolute',
		top: '50%',
		left: 12,
		width: 20,
		height: 20,
		transform: 'translateY(-50%)',
	},

	rangeRow: { display: 'flex', alignItems: 'center', gap: 12 },
	range: { accentColor: colors.brand, height: 44, minWidth: 0, flexGrow: 1, cursor: 'pointer' },
	rangeValue: {
		color: colors.muted,
		width: 40,
		flexShrink: 0,
		textAlign: 'right',
		fontSize: 14,
		lineHeight: '20px',
		fontVariantNumeric: 'tabular-nums',
	},
});

/** The shared look of every control on a form. See `styles.control`. */
export const CONTROL = styles.control;

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
	<label {...stylex.props(styles.label)}>
		<span {...stylex.props(styles.labelText)}>{label}</span>
		{children}
		{hint && <span {...stylex.props(styles.hint)}>{hint}</span>}
	</label>
);

export const TextInput = ({
	sx,
	...rest
}: { sx?: StyleXStyles } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'>) => (
	<input {...stylex.props(styles.control, sx)} {...rest} />
);

/**
 * A dropdown that looks like one.
 *
 * `appearance: none` is what lets a `select` take the same control styling as
 * every text input on the form, and it strips the platform's own arrow with
 * it, so the chevron has to be put back. Without it these were eight controls
 * pixel-identical to a `TextInput`, with a stripe of reserved padding on the
 * right where the only thing saying "this opens a list" used to be.
 *
 * `pointerEvents: none` so the icon is scenery: a tap that lands on it still
 * opens the select underneath.
 */
export const Select = ({
	sx,
	children,
	...rest
}: { sx?: StyleXStyles } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'style'>) => (
	<div {...stylex.props(styles.selectWrap)}>
		<select {...stylex.props(styles.control, styles.select, sx)} {...rest}>
			{children}
		</select>

		<ChevronDownIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
	</div>
);

/**
 * A search box, with the magnifier inside it.
 *
 * Inside rather than beside, so the field keeps the full width of a phone; the
 * input's own left padding is what clears it, and `pointerEvents: none` makes
 * the icon scenery, so a tap that lands on it still focuses the field. Same
 * arrangement as `Select`'s chevron, mirrored.
 *
 * One component rather than the eleven lines repeated, which is what the four
 * screens with a search box each carried. Every one of them wants the same
 * thing: `type='search'`, so the phone keyboard offers a search key and the
 * browser draws its own clear button, and a label, because a placeholder is not
 * one.
 */
export const SearchInput = ({
	label,
	sx,
	...rest
}: { label: string; sx?: StyleXStyles } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'>) => (
	<div {...stylex.props(styles.searchWrap)}>
		<MagnifyingGlassIcon {...stylex.props(styles.glass)} aria-hidden='true' />
		<input type='search' aria-label={label} {...stylex.props(styles.control, styles.search, sx)} {...rest} />
	</div>
);

/**
 * A slider for the settings that are a feel rather than a figure.
 *
 * Shows its own value, because a range control with no readout is guesswork,
 * and these are the ones an admin nudges and re-reads a week later to work out
 * what they did.
 */
export const RangeInput = ({
	value,
	valueLabel,
	sx,
	...rest
}: { valueLabel?: string; sx?: StyleXStyles } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'>) => (
	<div {...stylex.props(styles.rangeRow)}>
		<input type='range' value={value} {...stylex.props(styles.range, sx)} {...rest} />
		<span {...stylex.props(styles.rangeValue)}>{valueLabel ?? value}</span>
	</div>
);
