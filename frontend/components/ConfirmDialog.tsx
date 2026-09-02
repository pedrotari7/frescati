'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import * as stylex from '@stylexjs/stylex';
import Button from './Button';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, surfaces, utils } from '../lib/styles';

export interface ConfirmOptions {
	title: string;
	/** What will actually happen. Say the irreversible part out loud. */
	message?: string;
	confirmLabel?: string;
	tone?: 'danger' | 'primary';
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const styles = stylex.create({
	dialog: { position: 'relative', zIndex: 50 },
	scrim: {
		backgroundColor: tint.canvas80,
		position: 'fixed',
		inset: 0,
		backdropFilter: 'blur(4px)',
		WebkitBackdropFilter: 'blur(4px)',
	},
	/* Sheet from the bottom on a phone, centred once there's room. */
	positioner: {
		position: 'fixed',
		inset: 0,
		display: 'flex',
		alignItems: { default: 'flex-end', [bp.sm]: 'center' },
		justifyContent: 'center',
		padding: 16,
	},
	panel: { width: '100%', maxWidth: 384, borderRadius: 24, padding: 20 },
	title: { color: colors.ink, fontSize: 18, lineHeight: '28px', fontWeight: 600 },
	message: { color: colors.muted, marginTop: 8, fontSize: 14, lineHeight: 1.625 },
	actions: { marginTop: 20, display: 'flex', gap: 12 },
});

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

			<Dialog open={options !== null} onClose={() => close(false)} {...stylex.props(styles.dialog)}>
				<div {...stylex.props(styles.scrim)} aria-hidden='true' />

				<div {...stylex.props(styles.positioner)}>
					<DialogPanel
						{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
					>
						<DialogTitle {...stylex.props(styles.title)}>{options?.title}</DialogTitle>

						{options?.message && <p {...stylex.props(styles.message)}>{options.message}</p>}

						<div {...stylex.props(styles.actions)}>
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
