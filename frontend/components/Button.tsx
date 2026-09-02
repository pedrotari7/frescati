'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { bp, colors, tint } from '../app/tokens.stylex';
import { focus, surfaces } from '../lib/styles';
import { hapticLight } from '../lib/utils/haptics';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants = stylex.create({
	primary: {
		/*
		 * Hover and press land on the same colour, so the two conditions cannot
		 * disagree whichever way StyleX orders them. Where a variant below wants
		 * them to differ, only the hover one is guarded by `bp.hover`: a press is
		 * a real event on a phone, a hover is not.
		 */
		backgroundColor: {
			default: colors.brand,
			':active': colors.brandStrong,
			[bp.hover]: { default: null, ':hover': colors.brandStrong },
		},
		color: colors.canvas,
		fontWeight: 600,
	},
	secondary: { color: colors.ink },
	ghost: {
		color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } },
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
	},
	danger: {
		backgroundColor: {
			default: tint.out15,
			[bp.hover]: { default: null, ':hover': tint.out25 },
		},
		color: colors.out,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.out30,
	},
});

const sizes = stylex.create({
	sm: { height: 36, paddingInline: 12, fontSize: 14, lineHeight: '20px', borderRadius: 8 },
	md: { height: 44, paddingInline: 16, fontSize: 14, lineHeight: '20px', borderRadius: 12 },
	// Comfortably above the 44px minimum touch target.
	lg: { height: 56, paddingInline: 20, fontSize: 16, lineHeight: '24px', borderRadius: 16 },
});

const styles = stylex.create({
	base: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		transitionProperty: 'all',
		transitionDuration: '0.15s',
		pointerEvents: { default: null, ':disabled': 'none' },
		opacity: { default: null, ':disabled': 0.5 },
	},
	/*
	 * Applied after the variant rather than with the rest of the base, because
	 * `secondary` is built on `surfaces.glassCard`, which presses to 0.99 for a
	 * card-sized target. A button is smaller and wants the firmer 0.98, and in
	 * StyleX the later style in a `stylex.props` call is the one that wins.
	 */
	press: { transform: { default: null, ':active': 'scale(0.98)' } },
	full: { width: '100%' },
	spinner: { width: 16, height: 16 },
});

const Button = ({
	children,
	variant = 'secondary',
	size = 'md',
	loading = false,
	fullWidth = false,
	sx,
	onClick,
	disabled,
	...rest
}: {
	children: ReactNode;
	variant?: Variant;
	size?: Size;
	loading?: boolean;
	fullWidth?: boolean;
	sx?: StyleXStyles;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'>) => {
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
			{...stylex.props(
				styles.base,
				focus.ring,
				variant === 'secondary' && surfaces.glassCard,
				variants[variant],
				sizes[size],
				styles.press,
				fullWidth && styles.full,
				sx
			)}
			{...rest}
		>
			{isBusy && <Spinner sx={styles.spinner} />}
			{children}
		</button>
	);
};

export default Button;
