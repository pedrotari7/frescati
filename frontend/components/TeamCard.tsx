'use client';

import Link from 'next/link';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { AppUser, TournamentTeam } from '@shared/types';
import { toDisplayRating } from '@shared/rating';
import { counted } from '@shared/format';
import { displayNameOf } from '../lib/people';
import Avatar from './Avatar';
import RatingMovement from './RatingMovement';
import StatusPill from './StatusPill';
import TeamBadge, { teamName, teamStyle } from './TeamBadge';
import { bp, colors, tint } from '../app/tokens.stylex';
import { press, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	card: { overflow: 'hidden', borderRadius: 24 },
	bib: { height: 6, width: '100%' },
	body: { padding: 16 },
	header: { marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

	identity: { display: 'flex', minWidth: 0, alignItems: 'center', gap: 10 },
	identityButton: {
		marginInline: -4,
		borderRadius: 12,
		paddingInline: 4,
		paddingBlock: 4,
		textAlign: 'left',
		transitionProperty: 'background-color',
		transitionDuration: '0.15s',
	},
	names: { minWidth: 0 },
	teamName: { fontSize: 18, lineHeight: 1.25, fontWeight: 700 },
	sub: { color: colors.faint, fontSize: 12, lineHeight: '16px' },

	chip: { flexShrink: 0, borderRadius: 9999, paddingInline: 8, paddingBlock: 2, fontSize: 11, fontWeight: 600 },

	list: { display: 'flex', flexDirection: 'column', gap: 4 },
	row: {
		display: 'flex',
		alignItems: 'center',
		borderRadius: 12,
		transitionProperty: 'background-color',
		transitionDuration: '0.15s',
	},
	highlighted: { backgroundColor: tint.white6 },

	link: {
		display: 'flex',
		minWidth: 0,
		flexGrow: 1,
		alignItems: 'center',
		gap: 10,
		borderRadius: 12,
		paddingInline: 8,
		paddingBlock: 6,
		transitionProperty: 'background-color',
		transitionDuration: '0.15s',
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
	},
	name: {
		minWidth: 0,
		flexGrow: 1,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		fontSize: 14,
		lineHeight: '20px',
		color: colors.ink,
	},
	struck: { color: colors.muted, textDecorationLine: 'line-through' },
	movement: { fontSize: 11 },
	elo: { color: colors.faint, fontSize: 12, lineHeight: '16px', fontVariantNumeric: 'tabular-nums' },

	move: {
		color: colors.faint,
		marginRight: 4,
		display: 'flex',
		width: 36,
		height: 36,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
		transitionProperty: 'color, background-color',
		transitionDuration: '0.15s',
	},
	movable: { color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.ink } } },
	stuck: { opacity: 0.3 },
	moveIcon: { width: 16, height: 16 },

	rotating: { color: colors.faint, marginTop: 12, fontSize: 11 },
});

/**
 * One squad's team sheet.
 *
 * `sideSize` is how many of them are on the pitch at once. When the squad is
 * bigger than that, which happens on any odd headcount, the surplus rotate
 * through rather than one person watching the whole game, so the card says so
 * instead of implying somebody is dropped.
 */
const TeamCard = ({
	team,
	elos,
	usersByUid,
	sideSize,
	highlightUid,
	deltas,
	notPlaying,
	absentUids,
	onMovePlayer,
	onChangeLetter,
	sx,
}: {
	team: TournamentTeam;
	elos: Record<string, number>;
	usersByUid: Map<string, AppUser>;
	sideSize: number;
	highlightUid?: string | null;
	/** Rating movement per uid, once the game has been confirmed. */
	deltas?: Map<string, number>;
	/**
	 * Anyone on this sheet who is no longer in the playing pool. Only possible
	 * on a hand-picked lineup, which stops being re-picked, so the sheet can
	 * outlive somebody's answer, and saying nothing would leave a squad quietly
	 * a man short on the game.
	 */
	notPlaying?: Set<string>;
	/**
	 * Anyone a season admin has reported as a no-show. Different from
	 * `notPlaying` and louder: that is somebody who changed their answer, this
	 * is somebody who didn't. Their team played a man down, which is the one
	 * thing a team sheet is in a position to say.
	 */
	absentUids?: Set<string>;
	/** Season admins only: open the sheet that moves this player elsewhere. */
	onMovePlayer?: (uid: string) => void;
	/**
	 * Season admins only: open the sheet that swaps this squad's letter with
	 * another's. On the badge and the name rather than a control of its own,
	 * because the letter is what is being changed and it is the biggest thing on
	 * the card already.
	 */
	onChangeLetter?: () => void;
	sx?: StyleXStyles;
}) => {
	const style = teamStyle(team.index);
	// Only over the ratings we actually hold. Treating a missing one as zero
	// dragged the whole squad's badge down by whatever share of it that player
	// was, a worse answer than an average of the people we can price.
	const rated = team.uids.map(uid => elos[uid]).filter((elo): elo is number => typeof elo === 'number');
	const average = rated.length > 0 ? rated.reduce((total, elo) => total + elo, 0) / rated.length : null;
	const rotating = team.uids.length - sideSize;

	// The last player on a squad has nowhere to go. `setPlayerTeam` refuses to
	// leave a team with nobody on it, and that covers taking them off the sheet
	// as well, so the move sheet opens for them with every control greyed and
	// only Cancel live. Better said here, where the tap would have been.
	const isOnlyTeammate = team.uids.length === 1;

	const identity = (
		<>
			<TeamBadge index={team.index} size='md' />

			<div {...stylex.props(styles.names)}>
				<p {...stylex.props(styles.teamName, style.text)}>Team {teamName(team.index)}</p>
				<p {...stylex.props(styles.sub)}>
					{counted(team.uids.length, 'player')}
					{onChangeLetter && ' · tap to swap'}
				</p>
			</div>
		</>
	);

	return (
		<section {...stylex.props(surfaces.glass, styles.card, style.ring, sx)}>
			{/* Reads as a bib from across the card, before any letter has been. */}
			<div {...stylex.props(styles.bib, style.bar)} aria-hidden='true' />

			<div {...stylex.props(styles.body)}>
				<header {...stylex.props(styles.header)}>
					{/* The letter is the biggest thing on the card and the thing being
					    changed, so it is the target rather than a control of its own.
					    But only a button when there is somebody who can press it. A
					    disabled one would still be in every player's tab order,
					    offering nothing. */}
					{onChangeLetter ? (
						<button
							type='button'
							onClick={onChangeLetter}
							aria-label={`Change which team ${teamName(team.index)} is`}
							{...stylex.props(styles.identity, styles.identityButton, press.wash)}
						>
							{identity}
						</button>
					) : (
						<div {...stylex.props(styles.identity)}>{identity}</div>
					)}

					{average !== null && (
						<span {...stylex.props(styles.chip, style.chip)}>avg {toDisplayRating(average)}</span>
					)}
				</header>

				<ul {...stylex.props(styles.list)}>
					{team.uids.map(uid => {
						const user = usersByUid.get(uid);
						const elo = elos[uid];
						const noShow = absentUids?.has(uid) === true;
						// A no-show is the louder of the two and the only one that is
						// somebody's report rather than a derived disagreement, so it
						// wins the row where both would apply.
						const dropped = !noShow && notPlaying?.has(uid) === true;

						return (
							<li key={uid} {...stylex.props(styles.row, uid === highlightUid && styles.highlighted)}>
								{/* Only the name is the link. An admin's move button sits
								    beside it, and a <button> inside an <a> is invalid and
								    breaks keyboard navigation. */}
								<Link href={`/u/${uid}`} {...stylex.props(styles.link)}>
									<Avatar displayName={displayNameOf(user)} photoURL={user?.photoURL} size='sm' />
									{/* Full name, like every other list of people in the app: a team
									    sheet is where two Davids have to be told apart. */}
									<span {...stylex.props(styles.name, (noShow || dropped) && styles.struck)}>
										{displayNameOf(user)}
									</span>
									{noShow && <StatusPill tone='out'>No-show</StatusPill>}
									{dropped && <StatusPill tone='out'>Out</StatusPill>}
									<RatingMovement delta={deltas?.get(uid)} sx={styles.movement} />
									<span {...stylex.props(styles.elo)}>
										{typeof elo === 'number' ? toDisplayRating(elo) : '–'}
									</span>
								</Link>

								{/* Disabled rather than hidden where they can't be
								    moved: the one row in a card without a button
								    beside it reads as a bug, and the reason is worth
								    a hover on a desktop and a label everywhere else. */}
								{onMovePlayer && (
									<button
										type='button'
										disabled={isOnlyTeammate}
										onClick={() => onMovePlayer(uid)}
										aria-label={
											isOnlyTeammate
												? `${displayNameOf(user)} is the only player on team ${teamName(team.index)}, so there is nowhere to move them`
												: `Move ${displayNameOf(user)} to another team`
										}
										title={
											isOnlyTeammate
												? "The only player on a team can't be moved, a team with nobody on it still gets a fixture."
												: undefined
										}
										{...stylex.props(
											styles.move,
											utils.tap44,
											isOnlyTeammate ? styles.stuck : [styles.movable, press.wash]
										)}
									>
										<ArrowsRightLeftIcon {...stylex.props(styles.moveIcon)} aria-hidden='true' />
									</button>
								)}
							</li>
						);
					})}
				</ul>

				{rotating > 0 && (
					<p {...stylex.props(styles.rotating)}>
						{sideSize} on the pitch · {rotating} rotating
					</p>
				)}
			</div>
		</section>
	);
};

export default TeamCard;
