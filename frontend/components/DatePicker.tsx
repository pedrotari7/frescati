'use client';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { DayPicker } from 'react-day-picker';
import type { ClassNames, DayButtonProps } from 'react-day-picker';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { parseCivilDate } from '@shared/datetime';
import { formatCivilDate } from '@shared/format';
import { CONTROL } from './Field';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, surfaces } from '../lib/styles';

const pad = (value: number): string => String(value).padStart(2, '0');

/** `YYYY-MM-DD` -> the local midnight `Date` react-day-picker works in. */
const toDate = (civilDate: string): Date | undefined => {
	if (!civilDate) return undefined;
	const { year, month, day } = parseCivilDate(civilDate);
	return new Date(year, month - 1, day);
};

/**
 * The `Date` react-day-picker hands back -> our `YYYY-MM-DD` string.
 *
 * Built from the local getters, never `toISOString`, that formats in UTC and
 * would land on the wrong day for anyone west of it.
 */
const toCivilDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const styles = stylex.create({
	popover: { position: 'relative' },
	trigger: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left' },
	placeholder: { color: colors.faint },
	triggerIcon: { color: colors.faint, width: 20, height: 20, flexShrink: 0 },
	panel: { zIndex: 50, borderRadius: 16 },
});

const calendar = stylex.create({
	root: { position: 'relative', padding: 12 },
	month: { position: 'relative' },
	/* The right padding is the gap the absolutely positioned arrows sit in. */
	caption: {
		color: colors.ink,
		display: 'flex',
		height: 36,
		alignItems: 'center',
		paddingRight: 80,
		paddingLeft: 4,
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
	},
	nav: { position: 'absolute', top: 4, right: 4, display: 'flex', alignItems: 'center', gap: 4 },
	navButton: {
		color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } },
		display: 'flex',
		width: 32,
		height: 32,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 9999,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white10 } },
		transitionProperty: 'background-color, color',
		transitionDuration: '0.2s',
		pointerEvents: { default: null, ':disabled': 'none' },
		opacity: { default: null, ':disabled': 0.3 },
	},
	grid: { width: '100%', borderCollapse: 'collapse' },
	weekday: {
		color: colors.faint,
		paddingBottom: 8,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		textTransform: 'uppercase',
	},
	weekNumberHeader: {
		color: colors.faint,
		paddingBottom: 8,
		paddingRight: 8,
		fontSize: 10,
		fontWeight: 600,
		textTransform: 'uppercase',
	},
	weekNumber: {
		color: colors.faint,
		paddingRight: 8,
		fontSize: 12,
		lineHeight: '16px',
		fontVariantNumeric: 'tabular-nums',
	},
	chevron: { width: 16, height: 16 },
	day: { padding: 2, textAlign: 'center' },
	outside: { opacity: 0.4 },
	disabled: { pointerEvents: 'none', opacity: 0.3 },
	hidden: { visibility: 'hidden' },
});

const dayButton = stylex.create({
	base: {
		color: colors.ink,
		display: 'flex',
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 9999,
		borderWidth: 0,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white10 } },
		fontSize: 14,
		lineHeight: '20px',
		transitionProperty: 'background-color, color',
		transitionDuration: '0.2s',
		outline: { default: null, ':focus-visible': 'none' },
		boxShadow: { default: null, ':focus-visible': `0 0 0 2px ${tint.brand60}` },
	},
	today: { color: colors.brand },
	selected: {
		backgroundColor: {
			default: colors.brand,
			[bp.hover]: { default: colors.brand, ':hover': colors.brandStrong },
		},
		color: colors.canvas,
		fontWeight: 600,
	},
});

/** react-day-picker takes class names, so hand it the ones StyleX generated. */
const cn = (...sx: StyleXStyles[]): string => stylex.props(...sx).className ?? '';

/**
 * Styled from this app's tokens rather than the package's own stylesheet, the
 * app has one visual language and a second, imported one would fight it.
 *
 * Every key here lands on the day *cell*. The button inside it is styled by
 * `CalendarDayButton` below, because two of the states, selected and today,
 * have to beat the button's own colour and a parent cannot reach into a child
 * in StyleX.
 */
const CALENDAR_CLASS_NAMES: Partial<ClassNames> = {
	root: cn(calendar.root),
	month: cn(calendar.month),
	month_caption: cn(calendar.caption),
	nav: cn(calendar.nav),
	button_previous: cn(calendar.navButton),
	button_next: cn(calendar.navButton),
	chevron: cn(calendar.chevron),
	month_grid: cn(calendar.grid),
	weekday: cn(calendar.weekday),
	week_number_header: cn(calendar.weekNumberHeader),
	week_number: cn(calendar.weekNumber),
	day: cn(calendar.day),
	outside: cn(calendar.outside),
	disabled: cn(calendar.disabled),
	hidden: cn(calendar.hidden),
};

/**
 * The day itself, which is where selected and today have to be painted.
 *
 * Under Tailwind this was `[&>button]:bg-brand` on the cell, a parent reaching
 * down into its child. StyleX has no child selector, and react-day-picker hands
 * the modifiers straight to this component, so the state is read here instead of
 * being inferred from a class on the element above.
 *
 * Today is genuinely new: the cell carried `text-brand` and the button carried
 * `text-ink`, so the button always won and today never looked like anything.
 */
/* `day` and `modifiers` are pulled out to keep them off the DOM node: `rest` is
   spread onto a real `<button>`, and react-day-picker's own props are objects. */
const CalendarDayButton = ({ day: _day, modifiers, ...rest }: DayButtonProps) => (
	<button
		type='button'
		{...rest}
		{...stylex.props(dayButton.base, modifiers.today && dayButton.today, modifiers.selected && dayButton.selected)}
	/>
);

const Chevron = ({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) => {
	const Icon = orientation === 'right' ? ChevronRightIcon : ChevronLeftIcon;
	return <Icon {...stylex.props(calendar.chevron)} />;
};

/**
 * A drop-in for `<TextInput type='date'>` that opens a calendar with week
 * numbers instead of the browser's native picker, no browser exposes those
 * through the native control, so getting them at all means not using it.
 *
 * Weeks run Monday-first with ISO week numbering throughout: the group plays
 * in Sweden, where that's the only convention anyone reads a week number in.
 */
const DatePicker = ({
	value,
	onChange,
	placeholder = 'Select a date',
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) => {
	const selected = toDate(value);

	return (
		<Popover {...stylex.props(styles.popover)}>
			{({ close }) => (
				<>
					<PopoverButton type='button' {...stylex.props(CONTROL, styles.trigger)}>
						<span {...stylex.props(!value && styles.placeholder)}>
							{value ? formatCivilDate(value) : placeholder}
						</span>
						<CalendarDaysIcon {...stylex.props(styles.triggerIcon)} />
					</PopoverButton>

					<PopoverPanel
						anchor={{ to: 'bottom start', gap: 8 }}
						{...stylex.props(surfaces.glass, elevation.lift, animations.rise, styles.panel)}
					>
						<DayPicker
							mode='single'
							animate={false}
							ISOWeek
							showWeekNumber
							selected={selected}
							defaultMonth={selected ?? new Date()}
							onSelect={date => {
								if (!date) return;
								onChange(toCivilDate(date));
								close();
							}}
							formatters={{ formatWeekNumberHeader: () => 'Wk' }}
							classNames={CALENDAR_CLASS_NAMES}
							components={{ Chevron, DayButton: CalendarDayButton }}
						/>
					</PopoverPanel>
				</>
			)}
		</Popover>
	);
};

export default DatePicker;
