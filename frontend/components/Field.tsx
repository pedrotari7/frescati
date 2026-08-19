import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { classNames } from '../lib/utils/reactHelper';

// Exported so other controls that don't fit `<input>`/`<select>` — DatePicker's
// trigger button, for instance — still look like they belong on this form.
export const CONTROL =
	'w-full rounded-xl bg-white/5 px-3 h-12 text-ink ring-1 ring-inset ring-white/10 ' +
	'placeholder:text-faint focus:ring-brand/50 focus:outline-none transition-shadow';

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
	<label className='block'>
		<span className='text-muted mb-1.5 block text-xs font-semibold tracking-wide uppercase'>{label}</span>
		{children}
		{hint && <span className='text-faint mt-1.5 block text-xs'>{hint}</span>}
	</label>
);

export const TextInput = ({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
	<input className={classNames(CONTROL, className)} {...rest} />
);

/**
 * A dropdown that looks like one.
 *
 * `appearance-none` is what lets a `select` take the same `CONTROL` styling as
 * every text input on the form — and it strips the platform's own arrow with
 * it, so the chevron has to be put back. Without it these were eight controls
 * pixel-identical to a `TextInput`, with a stripe of reserved padding on the
 * right where the only thing saying "this opens a list" used to be.
 *
 * `pointer-events-none` so the icon is scenery: a tap that lands on it still
 * opens the select underneath.
 */
export const Select = ({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
	<div className='relative'>
		<select className={classNames(CONTROL, 'appearance-none pr-10', className)} {...rest}>
			{children}
		</select>

		<ChevronDownIcon
			className='text-faint pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2'
			aria-hidden='true'
		/>
	</div>
);

/**
 * A slider for the settings that are a feel rather than a figure.
 *
 * Shows its own value, because a range control with no readout is guesswork —
 * and these are the ones an admin nudges and re-reads a week later to work out
 * what they did.
 */
export const RangeInput = ({
	value,
	valueLabel,
	className = '',
	...rest
}: { valueLabel?: string } & InputHTMLAttributes<HTMLInputElement>) => (
	<div className='flex items-center gap-3'>
		<input
			type='range'
			value={value}
			className={classNames('accent-brand h-11 min-w-0 flex-1 cursor-pointer', className)}
			{...rest}
		/>
		<span className='text-muted w-10 shrink-0 text-right text-sm tabular-nums'>{valueLabel ?? value}</span>
	</div>
);
