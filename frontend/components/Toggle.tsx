'use client';

import type { ReactNode } from 'react';
import { Switch } from '@headlessui/react';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';

/**
 * A labelled on/off switch. Built on the Headless UI primitive so it announces
 * itself properly and works from the keyboard; the styling is ours.
 */
const Toggle = ({
	label,
	description,
	checked,
	disabled = false,
	onChange,
}: {
	label: string;
	description?: ReactNode;
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
}) => (
	<Switch.Group>
		<div className='flex items-start gap-3 py-2'>
			<div className='min-w-0 flex-1'>
				<Switch.Label className='text-ink block text-sm font-medium'>{label}</Switch.Label>
				{description && <p className='text-faint mt-0.5 text-xs leading-relaxed'>{description}</p>}
			</div>

			<Switch
				checked={checked}
				disabled={disabled}
				onChange={next => {
					hapticLight();
					onChange(next);
				}}
				className={classNames(
					'relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
					'disabled:opacity-40',
					checked ? 'bg-brand' : 'bg-white/15'
				)}
			>
				<span
					className={classNames(
						'bg-canvas pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full transition-transform',
						checked ? 'translate-x-5' : 'translate-x-0'
					)}
					aria-hidden='true'
				/>
			</Switch>
		</div>
	</Switch.Group>
);

export default Toggle;
