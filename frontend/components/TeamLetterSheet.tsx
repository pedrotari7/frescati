'use client';

import * as stylex from '@stylexjs/stylex';
import Sheet from './Sheet';
import TeamOption from './TeamOption';
import type { AppUser, TournamentTeam } from '@shared/types';
import { displayNameOf } from '../lib/people';
import Button from './Button';

import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	/* Bottom of the screen on a phone, where a thumb is. Centred once there is
	   room for it, which is the same shape every sheet in the app takes. */
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
		<Sheet open={open && !!team} onClose={onClose} title={<>Which team is {team ? nameFew(team) : ''}?</>} scroll>
			<p {...stylex.props(styles.blurb)}>
				The first two teams kick off, so this is how you start with a side that is ready. They swap letters.
				Nobody changes team.
			</p>

			<ul {...stylex.props(styles.list)}>
				{teams.map(candidate => {
					const isCurrent = candidate.index === team?.index;

					return (
						<TeamOption
							key={candidate.index}
							index={candidate.index}
							note={isCurrent ? 'Where they are now' : `Swaps with ${nameFew(candidate)}`}
							pill={isCurrent ? 'Now' : undefined}
							disabled={isCurrent}
							onPick={async () => {
								await onSwap(candidate.index);
								onClose();
							}}
						/>
					);
				})}
			</ul>

			<Button variant='ghost' fullWidth onClick={onClose} sx={styles.cancel}>
				Cancel
			</Button>
		</Sheet>
	);
};

export default TeamLetterSheet;
