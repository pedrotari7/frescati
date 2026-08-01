import type { ReactNode } from 'react';

const EmptyState = ({
	icon,
	title,
	message,
	action,
}: {
	icon?: ReactNode;
	title: string;
	message?: string;
	action?: ReactNode;
}) => (
	<div className='animate-fade-in flex flex-col items-center justify-center px-6 py-16 text-center'>
		{icon && <div className='text-faint mb-4 [&>svg]:size-12'>{icon}</div>}
		<p className='text-ink text-base font-semibold'>{title}</p>
		{message && <p className='text-muted mt-2 max-w-xs text-sm leading-relaxed'>{message}</p>}
		{action && <div className='mt-6'>{action}</div>}
	</div>
);

export default EmptyState;
