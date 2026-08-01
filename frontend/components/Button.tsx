'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
	primary: 'bg-brand text-canvas hover:bg-brand-strong active:bg-brand-strong font-semibold',
	secondary: 'glass-card text-ink hover:text-ink',
	ghost: 'text-muted hover:text-ink hover:bg-white/5',
	danger: 'bg-out/15 text-out hover:bg-out/25 border border-out/30',
};

const SIZES: Record<Size, string> = {
	sm: 'h-9 px-3 text-sm rounded-lg',
	md: 'h-11 px-4 text-sm rounded-xl',
	// Comfortably above the 44px minimum touch target.
	lg: 'h-14 px-5 text-base rounded-2xl',
};

const Button = ({
	children,
	variant = 'secondary',
	size = 'md',
	loading = false,
	fullWidth = false,
	className = '',
	onClick,
	disabled,
	...rest
}: {
	children: ReactNode;
	variant?: Variant;
	size?: Size;
	loading?: boolean;
	fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) => {
	const [busy, setBusy] = useState(false);

	// Owning the pending state here means callers can just pass an async handler
	// and never wire up their own spinner.
	const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
		if (!onClick) return;

		hapticLight();
		setBusy(true);
		try {
			await onClick(event);
		} finally {
			setBusy(false);
		}
	};

	const isBusy = loading || busy;

	return (
		<button
			type='button'
			onClick={handleClick}
			disabled={disabled || isBusy}
			className={classNames(
				'inline-flex items-center justify-center gap-2 transition-all duration-150',
				'disabled:pointer-events-none disabled:opacity-50',
				'focus-visible:ring-brand/60 focus-visible:ring-2 focus-visible:outline-none',
				'active:scale-[0.98]',
				VARIANTS[variant],
				SIZES[size],
				fullWidth && 'w-full',
				className
			)}
			{...rest}
		>
			{isBusy && <Spinner className='size-4' />}
			{children}
		</button>
	);
};

export default Button;
