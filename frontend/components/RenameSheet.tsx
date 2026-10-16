'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import Sheet from './Sheet';
import Button from './Button';
import { TextInput } from './Field';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	/* Sheet from the bottom on a phone, centred once there's room. */
	blurb: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: '20px' },
	field: { marginTop: 16 },
	actions: { marginTop: 16, display: 'flex', gap: 12 },
});

/**
 * Changing what something is called, and nothing else about it.
 *
 * Shared by the kit register and the season's receipts. Each says in `blurb`
 * what a rename leaves alone, because that is the part somebody opening this to
 * fix a typo needs to be told. A piece of kit keeps its kind and its holder, and a
 * receipt keeps its file.
 *
 * `name` is null while nothing is being renamed. Seeded on open rather than
 * cleared on close, so the field doesn't visibly reset underneath the closing
 * animation, the same reason `KitTransferSheet` clears its search there.
 */
const RenameSheet = ({
	name: current,
	open,
	blurb,
	placeholder,
	maxLength,
	onClose,
	onRename,
}: {
	name: string | null;
	open: boolean;
	blurb: ReactNode;
	placeholder: string;
	maxLength: number;
	onClose: () => void;
	onRename: (name: string) => Promise<void>;
}) => {
	const [name, setName] = useState('');

	useEffect(() => {
		if (open && current !== null) setName(current);
	}, [open, current]);

	const trimmed = name.trim();
	// Nothing to write, and a Save that fires anyway would sign a change on
	// somebody who changed nothing.
	const savable = trimmed.length > 0 && trimmed !== current;

	const save = async () => {
		if (!savable) return;

		await onRename(trimmed);
		onClose();
	};

	return (
		<Sheet open={open && current !== null} onClose={onClose} title={<>Rename {current}</>}>
			<p {...stylex.props(styles.blurb)}>{blurb}</p>

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
					placeholder={placeholder}
					maxLength={maxLength}
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
		</Sheet>
	);
};

export default RenameSheet;
