import type { ReactNode } from 'react';
import { classNames } from '../lib/utils/reactHelper';

export type PillTone = 'in' | 'out' | 'pending' | 'extra' | 'neutral' | 'brand';

const TONES: Record<PillTone, string> = {
	in: 'bg-in/15 text-in ring-in/25',
	out: 'bg-out/15 text-out ring-out/25',
	pending: 'bg-pending/15 text-pending ring-pending/25',
	extra: 'bg-extra/15 text-extra ring-extra/25',
	neutral: 'bg-white/8 text-muted ring-white/10',
	brand: 'bg-brand/15 text-brand ring-brand/25',
};

const StatusPill = ({
	tone = 'neutral',
	children,
	className = '',
}: {
	tone?: PillTone;
	children: ReactNode;
	className?: string;
}) => (
	<span
		className={classNames(
			'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset',
			TONES[tone],
			className
		)}
	>
		{children}
	</span>
);

export default StatusPill;
