'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import type { StyleXStyles } from '@stylexjs/stylex';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	dialog: { position: 'relative', zIndex: 50 },
	scrim: {
		backgroundColor: tint.canvas80,
		position: 'fixed',
		inset: 0,
		backdropFilter: 'blur(4px)',
		WebkitBackdropFilter: 'blur(4px)',
	},
	/* Bottom of the screen on a phone, where a thumb is. Centred once there is
	   room for it, which is the shape every sheet in the app takes. */
	positioner: {
		position: 'fixed',
		inset: 0,
		display: 'flex',
		alignItems: { default: 'flex-end', [bp.sm]: 'center' },
		justifyContent: 'center',
		padding: 16,
	},
	panel: { width: '100%', maxWidth: 384, borderRadius: 24, padding: 20 },
	/* The same panel, for a sheet whose middle scrolls: a squad of twenty-six on
	   a small phone. A separate style rather than a flag on the one above,
	   because the two differ by five properties rather than one. */
	column: {
		display: 'flex',
		maxHeight: '80vh',
		width: '100%',
		maxWidth: 384,
		flexDirection: 'column',
		borderRadius: 24,
		padding: 20,
	},
	title: { color: colors.ink, fontSize: 18, lineHeight: '28px', fontWeight: 600 },
});

/**
 * The dialog every sheet in the app is built out of.
 *
 * Seven components wrote this markup separately and identically, down to the
 * order of the five styles on the panel: a scrim, a positioner that puts the
 * panel under a thumb on a phone and in the middle on a desktop, and a titled
 * glass panel. The copies agreed until they didn't, which is what this exists
 * to stop.
 *
 * `scroll` picks the panel that holds its height and lets its middle scroll,
 * for the sheets that list a squad. `sx` is for the one panel that wants to be
 * wider than the rest.
 *
 * Everything under the title stays with the caller, including the blurb: it is
 * the one piece of a sheet that genuinely differs between them, 4 or 8 above
 * and 12 or 14 across, and pulling it in here would mean three variants of a
 * two-line style.
 */
const Sheet = ({
	open,
	onClose,
	title,
	scroll,
	sx,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	scroll?: boolean;
	sx?: StyleXStyles;
	children: ReactNode;
}) => (
	<Dialog open={open} onClose={onClose} {...stylex.props(styles.dialog)}>
		<div {...stylex.props(styles.scrim)} aria-hidden='true' />

		<div {...stylex.props(styles.positioner)}>
			<DialogPanel
				{...stylex.props(
					surfaces.glass,
					elevation.lift,
					animations.rise,
					utils.mbSafe,
					scroll ? styles.column : styles.panel,
					sx
				)}
			>
				<DialogTitle {...stylex.props(styles.title)}>{title}</DialogTitle>

				{children}
			</DialogPanel>
		</div>
	</Dialog>
);

export default Sheet;
