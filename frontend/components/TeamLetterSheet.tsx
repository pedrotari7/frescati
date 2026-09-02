'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, TournamentTeam } from '@shared/types';
import { displayNameOf } from '../lib/people';
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
	/* Bottom of the screen on a phone, where a thumb is. Centred once there is
	   room for it, which is the same shape every sheet in the app takes. */
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

	/* Bleeds into the panel's padding so a pressed row reaches its edge, and
	   scrolls on its own so the Cancel button stays put with four teams. */
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
	current: { opacity: 0.6 },
	optionBody: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	letter: { color: colors.ink, display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	swaps: { color: colors.faint, display: 'block', fontSize: 12, lineHeight: '16px' },
	check: { width: 12, height: 12 },
	cancel: { marginTop: 12, flexShrink: 0 },
});

/**
 * Which letter this squad should have.
 *
 * The question people actually arrive with is "team A is still tying their
 * laces, can we start with the other two", and the answer is not a fixture
 * editor, it is this: team A is the first index, the rotation always opens A
 * against B, so saying the squad that is ready is A puts them on first. One
 * idea instead of two, and the bibs, the scoreboard and the table all keep
 * agreeing because they all read the same index.
 *
 * Each row names two or three of the squad it would swap with, because a letter
 * on its own is not something anybody can pick between at the side of a pitch:
 * "make them A" is a decision about who team A currently is.
 */
const TeamLetterSheet = ({
	team,
	teams,
	usersByUid,
	open,
	onClose,
	onSwap,
}: {
	/** The squad whose letter is being changed. */
	team: TournamentTeam | null;
	teams: TournamentTeam[];
	usersByUid: Map<string, AppUser>;
	open: boolean;
	onClose: () => void;
	onSwap: (withIndex: number) => Promise<void>;
}) => {
	// Enough to recognise a side by, and no more, a full squad list per row
	// turns a four-team sheet into something you have to scroll and read.
	const nameFew = (squad: TournamentTeam): string => {
		const names = squad.uids.slice(0, 2).map(uid => displayNameOf(usersByUid.get(uid)).split(' ')[0]);
		const rest = squad.uids.length - names.length;

		return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ');
	};

	return (
		<Dialog open={open && !!team} onClose={onClose} {...stylex.props(styles.dialog)}>
			<div {...stylex.props(styles.scrim)} aria-hidden='true' />

			<div {...stylex.props(styles.positioner)}>
				<DialogPanel
					{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
				>
					<DialogTitle {...stylex.props(styles.title)}>
						Which team is {team ? nameFew(team) : ''}?
					</DialogTitle>

					<p {...stylex.props(styles.blurb)}>
						The first two teams kick off, so this is how you start with a side that is ready. They swap
						letters. Nobody changes team.
					</p>

					<ul {...stylex.props(styles.list)}>
						{teams.map(candidate => {
							const isCurrent = candidate.index === team?.index;

							return (
								<li key={candidate.index}>
									<button
										type='button'
										disabled={isCurrent}
										onClick={async () => {
											await onSwap(candidate.index);
											onClose();
										}}
										{...stylex.props(styles.option, isCurrent ? styles.current : press.wash)}
									>
										<TeamBadge index={candidate.index} size='md' />
										<span {...stylex.props(styles.optionBody)}>
											<span {...stylex.props(styles.letter)}>
												Team {teamName(candidate.index)}
											</span>
											<span {...stylex.props(styles.swaps, utils.truncate)}>
												{isCurrent ? 'Where they are now' : `Swaps with ${nameFew(candidate)}`}
											</span>
										</span>
										{isCurrent && (
											<StatusPill tone='brand'>
												<CheckIcon {...stylex.props(styles.check)} aria-hidden='true' />
												Now
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

export default TeamLetterSheet;
