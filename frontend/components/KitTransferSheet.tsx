'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { AppUser, KitItem } from '@shared/types';
import { classNames } from '../lib/utils/reactHelper';
import Avatar from './Avatar';
import Button from './Button';
import StatusPill from './StatusPill';
import { CONTROL } from './Field';

/**
 * Handing a piece of kit to somebody else.
 *
 * The squad and only the squad. The security rules refuse a holder who isn't
 * on `memberUids`, so offering an extra here would be offering a tap that
 * fails. Search is here rather than a plain list because a season can run to
 * twenty-odd people and this is a two-tap job at the side of a pitch.
 *
 * The current holder stays in the list, marked, rather than being filtered out.
 * Seeing who has it while choosing is the context for the choice, and a name
 * silently missing from a roster reads as a bug.
 */
const KitTransferSheet = ({
	item,
	squad,
	open,
	onClose,
	onTransfer,
}: {
	item: KitItem | null;
	/** Season members, already sorted by name. */
	squad: Pick<AppUser, 'uid' | 'displayName' | 'photoURL'>[];
	open: boolean;
	onClose: () => void;
	onTransfer: (holderUid: string) => Promise<void>;
}) => {
	const [search, setSearch] = useState('');

	// Cleared on open rather than on close, so the list doesn't visibly reflow
	// underneath the closing animation.
	useEffect(() => {
		if (open) setSearch('');
	}, [open]);

	const matches = useMemo(() => {
		const term = search.trim().toLowerCase();

		return term ? squad.filter(member => member.displayName.toLowerCase().includes(term)) : squad;
	}, [squad, search]);

	return (
		<Dialog open={open && !!item} onClose={onClose} className='relative z-50'>
			<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

			<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
				<DialogPanel className='glass shadow-lift animate-rise mb-safe flex max-h-[80vh] w-full max-w-sm flex-col rounded-3xl p-5'>
					<DialogTitle className='text-ink text-lg font-semibold'>Who has {item?.name}?</DialogTitle>

					<p className='text-muted mt-1 text-sm'>
						Pick whoever is taking it home. Anyone in the squad can change this later.
					</p>

					<div className='relative mt-4'>
						<MagnifyingGlassIcon
							className='text-faint pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2'
							aria-hidden='true'
						/>
						<input
							value={search}
							onChange={e => setSearch(e.target.value)}
							placeholder='Search the squad'
							type='search'
							aria-label='Search the squad'
							className={`${CONTROL} pl-10`}
						/>
					</div>

					{/* Scrolls inside the sheet rather than growing it past the
					    viewport, a squad of twenty-six on a small phone. */}
					<ul className='-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1'>
						{matches.length === 0 && (
							<li className='text-faint py-4 text-sm'>Nobody matches that search.</li>
						)}

						{matches.map(member => {
							const isHolder = member.uid === item?.holderUid;

							return (
								<li key={member.uid}>
									<button
										type='button'
										disabled={isHolder}
										onClick={async () => {
											await onTransfer(member.uid);
											onClose();
										}}
										className={classNames(
											'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
											isHolder ? 'opacity-60' : 'hover:bg-white/5 active:bg-white/10'
										)}
									>
										<Avatar displayName={member.displayName} photoURL={member.photoURL} size='sm' />
										<span className='text-ink min-w-0 flex-1 truncate text-sm'>
											{member.displayName}
										</span>
										{isHolder && (
											<StatusPill tone='brand'>
												<CheckIcon className='size-3' aria-hidden='true' />
												Has it
											</StatusPill>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					<Button variant='ghost' fullWidth onClick={onClose} className='mt-4 shrink-0'>
						Cancel
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default KitTransferSheet;
