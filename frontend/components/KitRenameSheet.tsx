'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import * as stylex from '@stylexjs/stylex';
import type { KitItem } from '@shared/types';
import Button from './Button';
import { TextInput } from './Field';
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
	blurb: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: '20px' },
	field: { marginTop: 16 },
	actions: { marginTop: 16, display: 'flex', gap: 12 },
});

/**
 * Changing what a piece of kit is called.
 *
 * The name and nothing else, which is not the same restraint the transfer sheet
 * shows: an admin may re-kind an item as far as the rules are concerned, but a
 * kind is what decides whether a game is warned about a missing ball, and
 * quietly offering that on a screen somebody opened to fix a typo is how the
 * vests become `other`. Who has it is a handover with its own sheet.
 *
 * Seeded on open rather than cleared on close, so the field doesn't visibly
 * reset underneath the closing animation, the same reason `KitTransferSheet`
 * clears its search there.
 */
const KitRenameSheet = ({
	item,
	open,
	onClose,
	onRename,
}: {
	item: KitItem | null;
	open: boolean;
	onClose: () => void;
	onRename: (name: string) => Promise<void>;
}) => {
	const [name, setName] = useState('');

	useEffect(() => {
		if (open && item) setName(item.name);
	}, [open, item]);

	const trimmed = name.trim();
	// Nothing to write, and a Save that fires anyway would stamp `updatedBy` on
	// somebody who changed nothing.
	const savable = trimmed.length > 0 && trimmed !== item?.name;

	const save = async () => {
		if (!savable) return;

		await onRename(trimmed);
		onClose();
	};

	return (
		<Dialog open={open && !!item} onClose={onClose} {...stylex.props(styles.dialog)}>
			<div {...stylex.props(styles.scrim)} aria-hidden='true' />

			<div {...stylex.props(styles.positioner)}>
				<DialogPanel
					{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
				>
					<DialogTitle {...stylex.props(styles.title)}>Rename {item?.name}</DialogTitle>

					<p {...stylex.props(styles.blurb)}>
						Only what it&apos;s called. What kind of kit it is, and who has it, stay as they are.
					</p>

					{/* A form so the phone keyboard's Go key saves, this is a
					    one-field sheet and reaching for a button is the long way
					    round. Save submits it rather than carrying its own
					    handler, so a tap and the Go key go down one path. */}
					<form
						onSubmit={event => {
							event.preventDefault();
							void save();
						}}
					>
						<TextInput
							value={name}
							onChange={e => setName(e.target.value)}
							aria-label='Name'
							placeholder='Match ball'
							maxLength={60}
							autoFocus
							sx={styles.field}
						/>

						<div {...stylex.props(styles.actions)}>
							<Button variant='primary' type='submit' fullWidth disabled={!savable}>
								Save
							</Button>
							<Button variant='ghost' fullWidth onClick={onClose}>
								Cancel
							</Button>
						</div>
					</form>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default KitRenameSheet;
