import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { classNames } from '../lib/utils/reactHelper';

const CONTROL =
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

export const Select = ({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
	<select className={classNames(CONTROL, 'appearance-none pr-8', className)} {...rest}>
		{children}
	</select>
);
