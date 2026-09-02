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
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Due, DueStatus } from '@shared/types';
import type { PlayerLedger } from '@shared/finances';
import { formatRelative, formatSek } from '@shared/format';
import { displayNameOf } from '../lib/people';
import Avatar from './Avatar';
import Button from './Button';
import StatusPill from './StatusPill';
import { ListCard, ListEmpty, listRow } from './Section';
import { colors } from '../app/tokens.stylex';
import { press, utils } from '../lib/styles';

const styles = stylex.create({
	person: { paddingBlock: 4 },
	/* Bleeds into the card's padding on both sides, so the pressable area of a
	   row reaches the card's edge rather than stopping at its text. */
	personRow: { marginInline: -8, display: 'flex', alignItems: 'center' },
	expander: {
		display: 'flex',
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		alignItems: 'center',
		gap: 12,
		borderRadius: 12,
		borderWidth: 0,
		paddingInline: 8,
		paddingBlock: 8,
		textAlign: 'left',
	},
	who: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 500 },
	charged: { color: colors.faint, fontSize: 12, lineHeight: '16px', fontVariantNumeric: 'tabular-nums' },
	chevron: {
		color: colors.faint,
		width: 16,
		height: 16,
		flexShrink: 0,
		transitionProperty: 'transform',
		transitionDuration: '0.2s',
	},
	chevronOpen: { transform: 'rotate(180deg)' },
	bell: { paddingRight: 8, paddingLeft: 4 },

	/* Indented to clear the avatar above, so a charge reads as belonging to the
	   person rather than as another person. */
	dues: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, paddingBottom: 8, paddingLeft: 44 },
	due: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	dueBody: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 128 },
	dueLabel: { color: colors.muted, fontSize: 12, lineHeight: '16px' },
	dueNote: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	dueAmount: { color: colors.ink, fontSize: 12, lineHeight: '16px', fontVariantNumeric: 'tabular-nums' },
	dueActions: { display: 'flex', gap: 4 },
	icon: { width: 16, height: 16 },
});

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
					<div key={player.uid} {...stylex.props(listRow, styles.person)}>
						{/* The bell is a sibling of the expander rather than inside
						    it, because a button cannot contain a button. The row
						    still bleeds into the card's padding on both sides;
						    where there is a bell, it takes the right-hand bleed. */}
						<div {...stylex.props(styles.personRow)}>
							<button
								type='button'
								onClick={() => setExpanded(open ? null : player.uid)}
								aria-expanded={open}
								{...stylex.props(styles.expander, press.wash)}
							>
								<Avatar displayName={name} photoURL={person?.photoURL ?? null} />

								<div {...stylex.props(styles.who)}>
									<p {...stylex.props(styles.name, utils.truncate)}>{name}</p>
									<p {...stylex.props(styles.charged, utils.truncate)}>
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
									{...stylex.props(styles.chevron, open && styles.chevronOpen)}
									aria-hidden='true'
								/>
							</button>

							{canChase && (
								<div {...stylex.props(styles.bell)}>
									<Button
										size='sm'
										variant='ghost'
										aria-label={`Remind ${name} about ${formatSek(player.outstanding)}`}
										onClick={() => onRemind(player)}
									>
										<BellAlertIcon {...stylex.props(styles.icon)} aria-hidden='true' />
									</Button>
								</div>
							)}
						</div>

						{open && (
							<ul {...stylex.props(styles.dues)}>
								{player.dues.map(due => (
									// Wraps rather than shrinking: a phone puts the
									// controls on their own line under the charge, a
									// desktop keeps them on one.
									<li key={due.id} {...stylex.props(styles.due)}>
										<div {...stylex.props(styles.dueBody)}>
											<p {...stylex.props(styles.dueLabel, utils.truncate)}>{labelFor(due)}</p>
											{due.note && (
												<p {...stylex.props(styles.dueNote, utils.truncate)}>{due.note}</p>
											)}
										</div>

										<span {...stylex.props(styles.dueAmount)}>{formatSek(due.amount)}</span>

										<StatusPill tone={TONE[due.status]}>{STATUS_LABEL[due.status]}</StatusPill>

										{canSettle && (
											<div {...stylex.props(styles.dueActions)}>
												{due.status === 'owing' ? (
													<>
														<Button
															size='sm'
															variant='secondary'
															aria-label={`Mark ${name}'s ${labelFor(due)} paid`}
															onClick={() => onSettle(due, 'paid')}
														>
															<CheckIcon
																{...stylex.props(styles.icon)}
																aria-hidden='true'
															/>
														</Button>
														<Button
															size='sm'
															variant='ghost'
															aria-label={`Write off ${name}'s ${labelFor(due)}`}
															onClick={() => onSettle(due, 'waived')}
														>
															<NoSymbolIcon
																{...stylex.props(styles.icon)}
																aria-hidden='true'
															/>
														</Button>
													</>
												) : (
													<Button
														size='sm'
														variant='ghost'
														aria-label={`Put ${name}'s ${labelFor(due)} back to owing`}
														onClick={() => onSettle(due, 'owing')}
													>
														<ArrowUturnLeftIcon
															{...stylex.props(styles.icon)}
															aria-hidden='true'
														/>
													</Button>
												)}

												<Button
													size='sm'
													variant='ghost'
													aria-label={`Remove ${name}'s ${labelFor(due)} charge`}
													onClick={() => onDelete(due)}
												>
													<TrashIcon {...stylex.props(styles.icon)} aria-hidden='true' />
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
