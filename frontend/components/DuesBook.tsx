'use client';

import { useState } from 'react';
import {
	ArrowUturnLeftIcon,
	BellAlertIcon,
	CheckIcon,
	ChevronDownIcon,
	NoSymbolIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import type { AppUser, Due, DueStatus } from '@shared/types';
import type { PlayerLedger } from '@shared/finances';
import { formatRelative, formatSek } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';
import { displayNameOf } from '../lib/people';
import Avatar from './Avatar';
import Button from './Button';
import StatusPill from './StatusPill';
import { ListCard, ListEmpty } from './Section';

const TONE: Record<DueStatus, 'in' | 'out' | 'neutral'> = {
	paid: 'in',
	owing: 'out',
	waived: 'neutral',
};

const STATUS_LABEL: Record<DueStatus, string> = {
	paid: 'Paid',
	owing: 'Owing',
	waived: 'Written off',
};

/**
 * Who owes what, and the controls to report a payment.
 *
 * A row per person rather than a row per charge, because a full season is a
 * couple of hundred charges and about fifteen people, and "has Sam paid" is the
 * question. The charges are underneath, one tap down, where the admin who needs
 * to tick off one particular Tuesday can find it.
 *
 * `in` and `out` for paid and owing. `globals.css` says the availability colours
 * carry meaning and must not be reused decoratively, and this is not decorative:
 * it is the same settled-versus-not distinction, on a screen where no headcount
 * competes for the reading.
 *
 * `onRemind` is optional and no handler means no bell, the same convention
 * `WatchToggle` uses. The screen draws this list twice, and only the admin's
 * copy of the whole book passes one.
 */
const DuesBook = ({
	book,
	usersByUid,
	labelFor,
	canSettle,
	chasedAt,
	onSettle,
	onDelete,
	onRemind,
}: {
	book: PlayerLedger[];
	usersByUid: Map<string, AppUser>;
	labelFor: (due: Due) => string;
	canSettle: boolean;
	/** When each person was last chased, by uid. Absent means never. */
	chasedAt?: Map<string, string>;
	onSettle: (due: Due, status: DueStatus) => void;
	onDelete: (due: Due) => void;
	onRemind?: (player: PlayerLedger) => void | Promise<void>;
}) => {
	const [expanded, setExpanded] = useState<string | null>(null);

	if (book.length === 0) {
		return (
			<ListCard>
				<ListEmpty>Nothing charged yet.</ListEmpty>
			</ListCard>
		);
	}

	return (
		<ListCard>
			{book.map(player => {
				const person = usersByUid.get(player.uid);
				const name = displayNameOf(person);
				const open = expanded === player.uid;
				const chased = chasedAt?.get(player.uid);
				const canChase = onRemind && player.outstanding > 0;

				return (
					<div key={player.uid} className='py-1'>
						{/* The bell is a sibling of the expander rather than inside
						    it, because a button cannot contain a button. The row
						    still bleeds into the card's padding on both sides;
						    where there is a bell, it takes the right-hand bleed. */}
						<div className='-mx-2 flex items-center'>
							<button
								type='button'
								onClick={() => setExpanded(open ? null : player.uid)}
								aria-expanded={open}
								className='flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5 active:bg-white/10'
							>
								<Avatar displayName={name} photoURL={person?.photoURL ?? null} />

								<div className='min-w-0 flex-1'>
									<p className='text-ink truncate text-sm font-medium'>{name}</p>
									<p className='text-faint truncate text-xs tabular-nums'>
										{formatSek(player.charged)} charged
										{chased && ` · chased ${formatRelative(chased)}`}
									</p>
								</div>

								{player.outstanding > 0 ? (
									<StatusPill tone='out'>{formatSek(player.outstanding)} owing</StatusPill>
								) : (
									<StatusPill tone='in'>Settled</StatusPill>
								)}

								<ChevronDownIcon
									className={classNames(
										'text-faint size-4 shrink-0 transition-transform',
										open && 'rotate-180'
									)}
									aria-hidden='true'
								/>
							</button>

							{canChase && (
								<div className='pr-2 pl-1'>
									<Button
										size='sm'
										variant='ghost'
										aria-label={`Remind ${name} about ${formatSek(player.outstanding)}`}
										onClick={() => onRemind(player)}
									>
										<BellAlertIcon className='size-4' aria-hidden='true' />
									</Button>
								</div>
							)}
						</div>

						{open && (
							<ul className='space-y-2 pt-1 pb-2 pl-11'>
								{player.dues.map(due => (
									// Wraps rather than shrinking: a phone puts the
									// controls on their own line under the charge, a
									// desktop keeps them on one.
									<li key={due.id} className='flex flex-wrap items-center gap-2'>
										<div className='min-w-0 flex-1 basis-32'>
											<p className='text-muted truncate text-xs'>{labelFor(due)}</p>
											{due.note && <p className='text-faint truncate text-xs'>{due.note}</p>}
										</div>

										<span className='text-ink text-xs tabular-nums'>{formatSek(due.amount)}</span>

										<StatusPill tone={TONE[due.status]}>{STATUS_LABEL[due.status]}</StatusPill>

										{canSettle && (
											<div className='flex gap-1'>
												{due.status === 'owing' ? (
													<>
														<Button
															size='sm'
															variant='secondary'
															aria-label={`Mark ${name}'s ${labelFor(due)} paid`}
															onClick={() => onSettle(due, 'paid')}
														>
															<CheckIcon className='size-4' aria-hidden='true' />
														</Button>
														<Button
															size='sm'
															variant='ghost'
															aria-label={`Write off ${name}'s ${labelFor(due)}`}
															onClick={() => onSettle(due, 'waived')}
														>
															<NoSymbolIcon className='size-4' aria-hidden='true' />
														</Button>
													</>
												) : (
													<Button
														size='sm'
														variant='ghost'
														aria-label={`Put ${name}'s ${labelFor(due)} back to owing`}
														onClick={() => onSettle(due, 'owing')}
													>
														<ArrowUturnLeftIcon className='size-4' aria-hidden='true' />
													</Button>
												)}

												<Button
													size='sm'
													variant='ghost'
													aria-label={`Remove ${name}'s ${labelFor(due)} charge`}
													onClick={() => onDelete(due)}
												>
													<TrashIcon className='size-4' aria-hidden='true' />
												</Button>
											</div>
										)}
									</li>
								))}
							</ul>
						)}
					</div>
				);
			})}
		</ListCard>
	);
};

export default DuesBook;
