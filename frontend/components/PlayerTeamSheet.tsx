'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CheckIcon, UserMinusIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { TournamentTeam } from '@shared/types';
import { counted } from '@shared/format';
import Button from './Button';
import StatusPill from './StatusPill';
import TeamBadge, { teamName } from './TeamBadge';
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

	list: {
		marginInline: -4,
		marginTop: 16,
		display: 'flex',
		minHeight: 0,
		flexGrow: 1,
		flexBasis: '0%',
		flexDirection: 'column',
		gap: 4,
		overflowY: 'auto',
		paddingInline: 4,
	},
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
	/* Every row that would refuse the tap, which is the squad they are already
	   on and, when they are the last one on it, all of them. */
	shut: { opacity: 0.6 },
	optionBody: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	letter: { color: colors.ink, display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	size: { color: colors.faint, display: 'block', fontSize: 12, lineHeight: '16px' },
	check: { width: 12, height: 12 },
	icon: { width: 16, height: 16 },

	off: { marginTop: 12, flexShrink: 0 },
	cancel: { marginTop: 8, flexShrink: 0 },
});

/**
 * Putting one player somewhere else.
 *
 * A sheet rather than a drag, because this is used one-handed at the side of a
 * pitch in the rain: a tap on a name and a tap on a letter is the whole
 * interaction, and there is no drop target small enough to miss.
 *
 * The squad they are already on stays in the list, marked, rather than being
 * filtered out, the same reason `KitTransferSheet` keeps the current holder.
 * Seeing where somebody is while choosing where they go is the context for the
 * choice, and a letter missing from A–D reads as a bug.
 *
 * "Off the team sheet" is last and separated, because it is the one option that
 * is not a move. It is here at all for the player who said In and never turned
 * up, and for the one who has to leave at half seven, both of whom are on a
 * squad the rotation is about to send onto the pitch.
 */
const PlayerTeamSheet = ({
	displayName,
	teams,
	currentIndex,
	open,
	onClose,
	onMove,
}: {
	displayName: string;
	teams: TournamentTeam[];
	/** Where they are now, or `-1` when they are on no squad. */
	currentIndex: number;
	open: boolean;
	onClose: () => void;
	onMove: (teamIndex: number | null) => Promise<void>;
}) => {
	// The last player out of a squad is refused by `setPlayerTeam`: an empty
	// team is a fixture against nobody, so the buttons that would hit that
	// refusal say why instead of failing.
	const isTheirLastTeammate = currentIndex >= 0 && teams[currentIndex]?.uids.length === 1;

	return (
		<Dialog open={open} onClose={onClose} {...stylex.props(styles.dialog)}>
			<div {...stylex.props(styles.scrim)} aria-hidden='true' />

			<div {...stylex.props(styles.positioner)}>
				<DialogPanel
					{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
				>
					<DialogTitle {...stylex.props(styles.title)}>Where is {displayName}?</DialogTitle>

					<p {...stylex.props(styles.blurb)}>
						{isTheirLastTeammate
							? 'They are the last one on their team, so this is a swap for another day, a team with nobody on it still gets a fixture.'
							: 'The teams stop being re-picked once you move somebody, so from here the sheet is yours to keep straight.'}
					</p>

					<ul {...stylex.props(styles.list)}>
						{teams.map(team => {
							const isCurrent = team.index === currentIndex;
							const shut = isCurrent || isTheirLastTeammate;

							return (
								<li key={team.index}>
									<button
										type='button'
										disabled={shut}
										onClick={async () => {
											await onMove(team.index);
											onClose();
										}}
										{...stylex.props(styles.option, shut ? styles.shut : press.wash)}
									>
										<TeamBadge index={team.index} size='md' />
										<span {...stylex.props(styles.optionBody)}>
											<span {...stylex.props(styles.letter)}>Team {teamName(team.index)}</span>
											<span {...stylex.props(styles.size)}>
												{counted(team.uids.length, 'player')}
											</span>
										</span>
										{isCurrent && (
											<StatusPill tone='brand'>
												<CheckIcon {...stylex.props(styles.check)} aria-hidden='true' />
												Here now
											</StatusPill>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					{currentIndex >= 0 && (
						<Button
							variant='danger'
							fullWidth
							disabled={isTheirLastTeammate}
							sx={styles.off}
							onClick={async () => {
								await onMove(null);
								onClose();
							}}
						>
							<UserMinusIcon {...stylex.props(styles.icon)} aria-hidden='true' />
							Off the team sheet
						</Button>
					)}

					<Button variant='ghost' fullWidth onClick={onClose} sx={styles.cancel}>
						Cancel
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default PlayerTeamSheet;
