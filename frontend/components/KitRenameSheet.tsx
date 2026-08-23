'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { KitItem } from '@shared/types';
import Button from './Button';
import { TextInput } from './Field';

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
		<Dialog open={open && !!item} onClose={onClose} className='relative z-50'>
			<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

			<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
				<DialogPanel className='glass shadow-lift animate-rise mb-safe w-full max-w-sm rounded-3xl p-5'>
					<DialogTitle className='text-ink text-lg font-semibold'>Rename {item?.name}</DialogTitle>

					<p className='text-muted mt-1 text-sm'>
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
							className='mt-4'
						/>

						<div className='mt-4 flex gap-3'>
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
