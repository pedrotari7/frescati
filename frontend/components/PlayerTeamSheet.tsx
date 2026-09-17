'use client';

import { UserMinusIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import Sheet from './Sheet';
import TeamOption from './TeamOption';
import type { TournamentTeam } from '@shared/types';
import { counted } from '@shared/format';
import Button from './Button';

import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
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
	/* Every row that would refuse the tap, which is the squad they are already
	   on and, when they are the last one on it, all of them. */
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
		<Sheet open={open} onClose={onClose} title={<>Where is {displayName}?</>} scroll>
			<p {...stylex.props(styles.blurb)}>
				{isTheirLastTeammate
					? 'They are the last one on their team, so this is a swap for another day, a team with nobody on it still gets a fixture.'
					: 'The teams stop being re-picked once you move somebody, so from here the sheet is yours to keep straight.'}
			</p>

			<ul {...stylex.props(styles.list)}>
				{teams.map(team => {
					const isCurrent = team.index === currentIndex;

					return (
						<TeamOption
							key={team.index}
							index={team.index}
							note={counted(team.uids.length, 'player')}
							pill={isCurrent ? 'Here now' : undefined}
							disabled={isCurrent || isTheirLastTeammate}
							onPick={async () => {
								await onMove(team.index);
								onClose();
							}}
						/>
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
		</Sheet>
	);
};

export default PlayerTeamSheet;
