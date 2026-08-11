'use client';

import { useState } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import type { ResponseStatus } from '@shared/types';
import { classNames } from '../lib/utils/reactHelper';
import { useToast } from './Toast';
import { hapticLight, hapticSuccess } from '../lib/utils/haptics';
import { captureError } from '../lib/sentry';

/**
 * The In/Out pair. This is the one control the whole app exists for, so on
 * mobile it is deliberately oversized and sits within thumb reach.
 *
 * No optimistic state is tracked here: Firestore's local cache reflects a write
 * in the `onSnapshot` listener before it reaches the server, and rolls it back
 * itself if the write is rejected.
 */
const RespondControl = ({
	status,
	onRespond,
	onClear,
	disabled = false,
	size = 'lg',
}: {
	status: ResponseStatus | undefined;
	onRespond: (status: ResponseStatus) => Promise<void>;
	/** Tapping the current answer again withdraws it, back to no response. */
	onClear?: () => Promise<void>;
	disabled?: boolean;
	size?: 'sm' | 'lg';
}) => {
	const [pending, setPending] = useState<ResponseStatus | null>(null);
	const { warn } = useToast();

	const handle = async (next: ResponseStatus) => {
		if (disabled || pending) return;

		setPending(next);
		try {
			if (status === next && onClear) {
				hapticLight();
				await onClear();
			} else {
				hapticSuccess();
				await onRespond(next);
			}
		} catch (error) {
			// This is the one control the app exists for. A rejected write used
			// to leave the button snapping back to its old state with the reason
			// only in the console — indistinguishable from a missed tap, and
			// unreported: `onRespond`/`onClear` are raw writes, not routed through
			// `useWrite`, so this catch is the only place that can tell us.
			console.error('Could not save your response', error);
			warn("Couldn't save your answer. Try again in a moment.");
			void captureError(error, { stage: 'respondControl' });
		} finally {
			setPending(null);
		}
	};

	const base = classNames(
		'flex flex-1 items-center justify-center gap-2 font-semibold transition-all duration-150',
		'disabled:opacity-40 active:scale-[0.98]',
		size === 'lg' ? 'h-14 rounded-2xl text-base' : 'h-10 rounded-xl px-3 text-sm'
	);

	return (
		<div className={classNames('flex w-full', size === 'lg' ? 'gap-3' : 'gap-2')}>
			<button
				type='button'
				disabled={disabled}
				aria-pressed={status === 'in'}
				onClick={() => handle('in')}
				className={classNames(
					base,
					status === 'in'
						? 'bg-in text-canvas shadow-lift'
						: 'bg-in/10 text-in ring-in/25 hover:bg-in/20 ring-1 ring-inset'
				)}
			>
				<CheckIcon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden='true' />
				{pending === 'in' ? 'Saving…' : "I'm in"}
			</button>

			<button
				type='button'
				disabled={disabled}
				aria-pressed={status === 'out'}
				onClick={() => handle('out')}
				className={classNames(
					base,
					status === 'out'
						? 'bg-out text-canvas shadow-lift'
						: 'bg-out/10 text-out ring-out/25 hover:bg-out/20 ring-1 ring-inset'
				)}
			>
				<XMarkIcon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden='true' />
				{pending === 'out' ? 'Saving…' : "Can't make it"}
			</button>
		</div>
	);
};

export default RespondControl;
