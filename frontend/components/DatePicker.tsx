'use client';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { DayPicker } from 'react-day-picker';
import type { ClassNames } from 'react-day-picker';
import { parseCivilDate } from '@shared/datetime';
import { formatCivilDate } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';
import { CONTROL } from './Field';

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

/**
 * Styled with Tailwind via `classNames` rather than the package's own
 * stylesheet, this app has one visual language (`globals.css`'s tokens) and
 * a second, imported one would fight it.
 */
const CALENDAR_CLASS_NAMES: Partial<ClassNames> = {
	root: 'relative p-3',
	month: 'relative',
	month_caption: 'text-ink flex h-9 items-center pr-20 pl-1 text-sm font-semibold',
	nav: 'absolute top-1 right-1 flex items-center gap-1',
	button_previous:
		'text-muted hover:bg-white/10 hover:text-ink flex size-8 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-30',
	button_next:
		'text-muted hover:bg-white/10 hover:text-ink flex size-8 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-30',
	chevron: 'size-4',
	month_grid: 'w-full border-collapse',
	weekday: 'text-faint pb-2 text-xs font-semibold uppercase',
	week_number_header: 'text-faint pb-2 pr-2 text-[10px] font-semibold uppercase',
	week_number: 'text-faint pr-2 text-xs tabular-nums',
	day: 'p-0.5 text-center',
	day_button:
		'text-ink hover:bg-white/10 focus-visible:ring-brand/60 flex size-9 items-center justify-center rounded-full text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
	today: 'text-brand',
	selected: '[&>button]:bg-brand [&>button]:text-canvas [&>button]:font-semibold [&>button]:hover:bg-brand-strong',
	outside: 'opacity-40',
	disabled: 'pointer-events-none opacity-30',
	hidden: 'invisible',
};

const Chevron = ({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) => {
	const Icon = orientation === 'right' ? ChevronRightIcon : ChevronLeftIcon;
	return <Icon className='size-4' />;
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
		<Popover className='relative'>
			{({ close }) => (
				<>
					<PopoverButton
						type='button'
						className={classNames(CONTROL, 'flex items-center justify-between gap-2 text-left')}
					>
						<span className={value ? '' : 'text-faint'}>
							{value ? formatCivilDate(value) : placeholder}
						</span>
						<CalendarDaysIcon className='text-faint size-5 shrink-0' />
					</PopoverButton>

					<PopoverPanel
						anchor={{ to: 'bottom start', gap: 8 }}
						className='glass shadow-lift animate-rise z-50 rounded-2xl'
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
							components={{ Chevron }}
						/>
					</PopoverPanel>
				</>
			)}
		</Popover>
	);
};

export default DatePicker;
