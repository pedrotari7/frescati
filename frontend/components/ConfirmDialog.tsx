'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import Button from './Button';

export interface ConfirmOptions {
	title: string;
	/** What will actually happen. Say the irreversible part out loud. */
	message?: string;
	confirmLabel?: string;
	tone?: 'danger' | 'primary';
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

// Defaults to "yes" so a component rendered outside the provider, only ever a
// test, doesn't hang forever waiting on a dialog nobody is showing.
const ConfirmContext = createContext<Ask>(async () => true);

/**
 * One confirmation dialog for the whole app, asked for as a promise:
 *
 *   if (!(await confirm({ title: 'Delete this game?' }))) return;
 *
 * Built on the Headless UI dialog already in the dependency tree, so it gets
 * focus trapping, escape-to-close and the right ARIA roles without any of that
 * being written here. `window.confirm` would have been one line, but it renders
 * as a system sheet in an installed PWA, which reads as the browser interrupting
 * rather than the app asking.
 */
export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
	const [options, setOptions] = useState<ConfirmOptions | null>(null);
	const settle = useRef<(value: boolean) => void>(() => {});

	const ask = useCallback<Ask>(
		next =>
			new Promise<boolean>(resolve => {
				settle.current = resolve;
				setOptions(next);
			}),
		[]
	);

	const close = (value: boolean) => {
		settle.current(value);
		setOptions(null);
	};

	return (
		<ConfirmContext.Provider value={ask}>
			{children}

			<Dialog open={options !== null} onClose={() => close(false)} className='relative z-50'>
				<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

				{/* Sheet from the bottom on a phone, centred once there's room. */}
				<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
					<DialogPanel className='glass shadow-lift animate-rise mb-safe w-full max-w-sm rounded-3xl p-5'>
						<DialogTitle className='text-ink text-lg font-semibold'>{options?.title}</DialogTitle>

						{options?.message && (
							<p className='text-muted mt-2 text-sm leading-relaxed'>{options.message}</p>
						)}

						<div className='mt-5 flex gap-3'>
							<Button variant='ghost' fullWidth onClick={() => close(false)}>
								Cancel
							</Button>
							<Button
								variant={options?.tone === 'danger' ? 'danger' : 'primary'}
								fullWidth
								onClick={() => close(true)}
							>
								{options?.confirmLabel ?? 'Confirm'}
							</Button>
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</ConfirmContext.Provider>
	);
};

export const useConfirm = () => useContext(ConfirmContext);

export default ConfirmProvider;
