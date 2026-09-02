'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, KitItem } from '@shared/types';
import Avatar from './Avatar';
import Button from './Button';
import StatusPill from './StatusPill';
import { SearchInput } from './Field';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, press, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	dialog: { position: 'relative', zIndex: 50 },
	scrim: {
		backgroundColor: tint.canvas80,
		position: 'fixed',
		inset: 0,
		backdropFilter: 'blur(4px)',
		WebkitBackdropFilter: 'blur(4px)',
	},
	positioner: {
		position: 'fixed',
		inset: 0,
		display: 'flex',
		alignItems: { default: 'flex-end', [bp.sm]: 'center' },
		justifyContent: 'center',
		padding: 16,
	},
	panel: {
		display: 'flex',
		maxHeight: '80vh',
		width: '100%',
		maxWidth: 384,
		flexDirection: 'column',
		borderRadius: 24,
		padding: 20,
	},
	title: { color: colors.ink, fontSize: 18, lineHeight: '28px', fontWeight: 600 },
	blurb: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: '20px' },

	field: { marginTop: 16 },

	/* Scrolls inside the sheet rather than growing it past the viewport, a
	   squad of twenty-six on a small phone. */
	list: {
		marginInline: -4,
		marginTop: 12,
		minHeight: 0,
		flexGrow: 1,
		flexBasis: '0%',
		overflowY: 'auto',
		paddingInline: 4,
	},
	none: { color: colors.faint, paddingBlock: 16, fontSize: 14, lineHeight: '20px' },
	option: {
		display: 'flex',
		width: '100%',
		alignItems: 'center',
		gap: 12,
		borderRadius: 12,
		borderWidth: 0,
		backgroundColor: 'transparent',
		paddingInline: 8,
		paddingBlock: 10,
		textAlign: 'left',
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	holder: { opacity: 0.6 },
	name: {
		color: colors.ink,
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
	},
	check: { width: 12, height: 12 },

	cancel: { marginTop: 16, flexShrink: 0 },
});

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
		<Dialog open={open && !!item} onClose={onClose} {...stylex.props(styles.dialog)}>
			<div {...stylex.props(styles.scrim)} aria-hidden='true' />

			<div {...stylex.props(styles.positioner)}>
				<DialogPanel
					{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
				>
					<DialogTitle {...stylex.props(styles.title)}>Who has {item?.name}?</DialogTitle>

					<p {...stylex.props(styles.blurb)}>
						Pick whoever is taking it home. Anyone in the squad can change this later.
					</p>

					<SearchInput
						label='Search the squad'
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder='Search the squad'
						sx={styles.field}
					/>

					<ul {...stylex.props(styles.list)}>
						{matches.length === 0 && <li {...stylex.props(styles.none)}>Nobody matches that search.</li>}

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
										{...stylex.props(styles.option, isHolder ? styles.holder : press.wash)}
									>
										<Avatar displayName={member.displayName} photoURL={member.photoURL} size='sm' />
										<span {...stylex.props(styles.name, utils.truncate)}>{member.displayName}</span>
										{isHolder && (
											<StatusPill tone='brand'>
												<CheckIcon {...stylex.props(styles.check)} aria-hidden='true' />
												Has it
											</StatusPill>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					<Button variant='ghost' fullWidth onClick={onClose} sx={styles.cancel}>
						Cancel
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default KitTransferSheet;
