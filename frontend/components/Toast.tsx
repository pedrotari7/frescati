'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import BottomStackHost, { BottomSlot } from './BottomStack';
import { classNames } from '../lib/utils/reactHelper';

type Tone = 'error' | 'success';

interface Toast {
	id: number;
	text: string;
	tone: Tone;
}

interface ToastValue {
	/** Confirm something worked. Use sparingly — silence is fine when the screen already shows the result. */
	notify: (text: string) => void;
	/** Say that something didn't. Always worth showing. */
	warn: (text: string) => void;
}

const ToastContext = createContext<ToastValue>({ notify: () => {}, warn: () => {} });

/** Long enough to read a sentence, short enough not to sit over the tab bar. */
const DISMISS_MS = 4500;

/** Beyond this the stack is covering the screen it's reporting on. */
const MAX_VISIBLE = 3;

/**
 * App-wide transient messages.
 *
 * Exists because most writes in this app are fire-and-forget: a row action taps
 * straight into Firestore and has nowhere to put an error, so a rejected write
 * looked exactly like nothing happening. Inline state works on the forms, but
 * not on a "Delete" button in a list row, which is where it matters most.
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const nextId = useRef(0);

	const push = useCallback((text: string, tone: Tone) => {
		const id = nextId.current++;

		setToasts(current => [...current, { id, text, tone }].slice(-MAX_VISIBLE));
		setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), DISMISS_MS);
	}, []);

	const value = useMemo<ToastValue>(
		() => ({ notify: text => push(text, 'success'), warn: text => push(text, 'error') }),
		[push]
	);

	const dismiss = (id: number) => setToasts(current => current.filter(toast => toast.id !== id));

	return (
		<ToastContext.Provider value={value}>
			{children}

			{/* The slot itself, mounted here because every screen in the app is
			    inside this provider and a toast is the thing most likely to want
			    it. The two banners portal into the same one. */}
			<BottomStackHost />

			{/* Nearest the thumb of the three, being the transient one. */}
			<BottomSlot order={3}>
				<div className='flex flex-col items-center gap-2' role='status' aria-live='polite'>
					{toasts.map(toast => (
						<button
							key={toast.id}
							type='button'
							onClick={() => dismiss(toast.id)}
							className={classNames(
								'glass animate-rise shadow-lift flex w-full max-w-sm items-start gap-2.5',
								'rounded-2xl px-4 py-3 text-left text-sm',
								toast.tone === 'error' ? 'text-out' : 'text-in'
							)}
						>
							{toast.tone === 'error' ? (
								<ExclamationTriangleIcon className='mt-px size-4 shrink-0' aria-hidden='true' />
							) : (
								<CheckCircleIcon className='mt-px size-4 shrink-0' aria-hidden='true' />
							)}
							<span className='text-ink flex-1'>{toast.text}</span>
						</button>
					))}
				</div>
			</BottomSlot>
		</ToastContext.Provider>
	);
};

export const useToast = () => useContext(ToastContext);

export default ToastProvider;
