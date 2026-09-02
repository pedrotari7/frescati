'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import BottomStackHost, { BottomSlot } from './BottomStack';
import { colors } from '../app/tokens.stylex';
import { animations, elevation, surfaces } from '../lib/styles';

type Tone = 'error' | 'success';

interface Toast {
	id: number;
	text: string;
	tone: Tone;
}

interface ToastValue {
	/** Confirm something worked. Use sparingly, silence is fine when the screen already shows the result. */
	notify: (text: string) => void;
	/** Say that something didn't. Always worth showing. */
	warn: (text: string) => void;
}

const ToastContext = createContext<ToastValue>({ notify: () => {}, warn: () => {} });

/** Long enough to read a sentence, short enough not to sit over the tab bar. */
const DISMISS_MS = 4500;

/** Beyond this the stack is covering the screen it's reporting on. */
const MAX_VISIBLE = 3;

const styles = stylex.create({
	stack: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
	toast: {
		display: 'flex',
		width: '100%',
		maxWidth: 384,
		alignItems: 'flex-start',
		gap: 10,
		borderRadius: 16,
		paddingInline: 16,
		paddingBlock: 12,
		textAlign: 'left',
		fontSize: 14,
		lineHeight: '20px',
	},
	error: { color: colors.out },
	success: { color: colors.in },

	icon: { marginTop: 1, width: 16, height: 16, flexShrink: 0 },
	text: { color: colors.ink, flexGrow: 1 },
});

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

	// Kept so they can be cancelled: on unmount, and when somebody taps a toast
	// away before its own timer has run. Neither was happening, the tap removed
	// the toast and left the timeout to fire into an empty list afterwards.
	const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

	const forget = useCallback((id: number) => {
		clearTimeout(timers.current.get(id));
		timers.current.delete(id);
		setToasts(current => current.filter(toast => toast.id !== id));
	}, []);

	const push = useCallback(
		(text: string, tone: Tone) => {
			const id = nextId.current++;

			setToasts(current => [...current, { id, text, tone }].slice(-MAX_VISIBLE));
			timers.current.set(
				id,
				setTimeout(() => forget(id), DISMISS_MS)
			);
		},
		[forget]
	);

	useEffect(() => {
		const pending = timers.current;

		return () => pending.forEach(clearTimeout);
	}, []);

	const value = useMemo<ToastValue>(
		() => ({ notify: text => push(text, 'success'), warn: text => push(text, 'error') }),
		[push]
	);

	return (
		<ToastContext.Provider value={value}>
			{children}

			{/* The slot itself, mounted here because every screen in the app is
			    inside this provider and a toast is the thing most likely to want
			    it. The two banners portal into the same one. */}
			<BottomStackHost />

			{/* Nearest the thumb of the three, being the transient one. */}
			<BottomSlot order={3}>
				<div {...stylex.props(styles.stack)} role='status' aria-live='polite'>
					{toasts.map(toast => (
						<button
							key={toast.id}
							type='button'
							onClick={() => forget(toast.id)}
							{...stylex.props(
								surfaces.glass,
								elevation.lift,
								animations.rise,
								styles.toast,
								toast.tone === 'error' ? styles.error : styles.success
							)}
						>
							{toast.tone === 'error' ? (
								<ExclamationTriangleIcon {...stylex.props(styles.icon)} aria-hidden='true' />
							) : (
								<CheckCircleIcon {...stylex.props(styles.icon)} aria-hidden='true' />
							)}
							<span {...stylex.props(styles.text)}>{toast.text}</span>
						</button>
					))}
				</div>
			</BottomSlot>
		</ToastContext.Provider>
	);
};

export const useToast = () => useContext(ToastContext);

export default ToastProvider;
