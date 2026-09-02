'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
	BanknotesIcon,
	ChevronRightIcon,
	Cog6ToothIcon,
	ShoppingBagIcon,
	UsersIcon,
} from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { KIT_KIND_LABELS, groupKitByKind } from '@shared/kit';
import { entryShare, feesFor } from '@shared/finances';
import { byDisplayName, formatSek } from '@shared/format';
import type { AvailabilityMark } from '@shared/availability';
import { availabilityGames, buildAvailability, seasonExtras } from '@shared/availability';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useKit, useUsersByUid } from '../../../../../hooks/useData';
import { useSeasonResponses } from '../../../../../hooks/useSeasonResponses';
import type { PersonRow } from '../../../../../lib/people';
import { personRow } from '../../../../../lib/people';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';
import AvailabilityDots, { AvailabilityLegend } from '../../../../../components/AvailabilityDots';
import { ListCard, ListEmpty, listRow, SectionHeading } from '../../../../../components/Section';
import { bp, colors, tint } from '../../../../tokens.stylex';
import { surfaces, utils } from '../../../../../lib/styles';

const styles = stylex.create({
	page: { padding: 16 },

	links: { marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 },
	link: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		borderRadius: 16,
		padding: 16,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
	},
	linkIcon: { color: colors.brand, width: 20, height: 20, flexShrink: 0 },
	linkBody: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	linkTitle: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	linkNote: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	chevron: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },

	manage: {
		color: colors.ink,
		display: 'flex',
		height: 44,
		width: '100%',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		borderRadius: 12,
		paddingInline: 16,
		fontSize: 14,
		lineHeight: '20px',
		transitionProperty: 'transform, background-color, border-color',
		transitionDuration: '0.15s',
		transform: { default: null, ':active': 'scale(0.98)' },
	},
	cog: { width: 16, height: 16 },
	manageWrap: { marginTop: 16 },

	failed: {
		marginBottom: 8,
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		columnGap: 8,
		rowGap: 4,
		paddingInline: 4,
		fontSize: 12,
		lineHeight: '16px',
	},
	failedText: { color: colors.muted },
	retry: {
		appearance: 'none',
		borderWidth: 0,
		backgroundColor: 'transparent',
		padding: 0,
		color: colors.brand,
		fontFamily: 'inherit',
		fontSize: 'inherit',
		fontWeight: 600,
		cursor: 'pointer',
	},

	legend: { marginBottom: 8, paddingInline: 4 },
	heading: { marginBottom: 8, paddingInline: 4 },
	extras: { marginTop: 24 },

	row: {
		display: 'block',
		paddingBlock: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	person: { display: 'flex', alignItems: 'center', gap: 12 },
	name: { color: colors.ink, flexGrow: 1, flexShrink: 1, flexBasis: '0%', fontSize: 14, lineHeight: '20px' },
	dots: { marginTop: 8 },

	blurb: { color: colors.faint, marginBottom: 8, paddingInline: 4, fontSize: 12, lineHeight: '16px' },
	note: { color: colors.faint, marginTop: 16, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
});

/**
 * One of the two things on this screen that is somewhere to go rather than
 * something to read: kit and the books.
 *
 * A component rather than the pair of identical blocks, which differed only in
 * the icon, the word and the line underneath.
 */
const NavCard = ({ href, icon, title, note }: { href: string; icon: ReactNode; title: string; note: ReactNode }) => (
	<Link href={href} {...stylex.props(surfaces.glassCard, styles.link)}>
		{icon}

		<div {...stylex.props(styles.linkBody)}>
			<p {...stylex.props(styles.linkTitle)}>{title}</p>
			<p {...stylex.props(styles.linkNote)}>{note}</p>
		</div>

		<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
	</Link>
);

/** Somebody on one of the two lists, and their season. */
type Player = PersonRow & { availability: AvailabilityMark[] };

/**
 * One person on this screen: who they are, and their season under the name.
 *
 * The squad and the extras get the same row deliberately. Both lists answer the
 * same question, who has been around this season, and the only differences are
 * the heading over them and the pill an admin carries.
 */
const PlayerRow = ({
	player,
	timezone,
	showAvailability,
	pending,
	trailing,
}: {
	player: Player;
	timezone: string;
	showAvailability: boolean;
	pending: boolean;
	trailing?: ReactNode;
}) => (
	<Link href={`/u/${player.uid}`} {...stylex.props(listRow, styles.row)}>
		<div {...stylex.props(styles.person)}>
			<Avatar displayName={player.displayName} photoURL={player.photoURL} />
			<span {...stylex.props(styles.name, utils.truncate)}>{player.displayName}</span>
			{trailing}
		</div>

		{/* Under the whole row rather than beside the name, so every strip gets
		    the same width and therefore wraps at the same game. Beside the name it
		    would be the admin pill deciding where one player's season broke and
		    not another's. */}
		{showAvailability && player.availability.length > 0 && (
			<AvailabilityDots sx={styles.dots} marks={player.availability} timezone={timezone} pending={pending} />
		)}
	</Link>
);

const MembersPage = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin } = useSeasonContext();
	const { usersByUid } = useUsersByUid();
	const { kit } = useKit(seasonId);
	const {
		responses,
		loading: answersLoading,
		error: answersError,
		retry: retryAnswers,
	} = useSeasonResponses(seasonId, games);

	/** The games the strip has a dot for, which is every one still meant to be played. */
	const dotted = useMemo(() => availabilityGames(games), [games]);

	// The strip is built for everybody whether or not the answers have landed:
	// the games are what decide how many dots there are and where they break, so
	// building it early is what lets the rows hold their height. Until then every
	// mark reads `unanswered`, which is why `answersLoading` has to travel with
	// it rather than being checked here.
	const members = useMemo(() => {
		if (!season) return [];

		return season.memberUids
			.map(uid => ({ ...personRow(usersByUid, uid), availability: buildAvailability(uid, dotted, responses) }))
			.sort(byDisplayName);
	}, [season, usersByUid, dotted, responses]);

	// Nobody stores the extras, so they are whoever the season's answers say they
	// are, and unlike the squad they cannot be drawn before that read lands. The
	// squad is known first and the answers fill it in. Here the answers are the
	// list, so the section arrives with them rather than sitting there empty:
	// "nobody has guested this season" is a real answer, and this screen must not
	// assert it before it knows.
	const extras = useMemo(() => {
		if (!season) return [];

		return seasonExtras(season.memberUids, responses)
			.map(uid => ({ ...personRow(usersByUid, uid), availability: buildAvailability(uid, dotted, responses) }))
			.sort(byDisplayName);
	}, [season, usersByUid, dotted, responses]);

	if (loading) {
		return (
			<SeasonShell title='Club'>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Club'>
				<LoadFailed what='the club' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Club'>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	const fees = feesFor(season);

	// Kit and finances live behind the Club tab rather than a fifth and sixth one
	// of their own: both are the club's rather than any one game's, who is holding
	// what and who has paid what, and the tab bar deliberately never grows or
	// reflows, so a new tab would move every tab beside it on every screen in the
	// app. The tab is called Club rather than Squad for the same reason. The
	// roster is one of the three things on it, not the whole screen. All three are
	// shown to everyone:
	// anybody in the squad can hand a bag on, and an extra who owes for a game
	// needs somewhere to go and pay it.
	//
	// Above the roster rather than under it. A full squad is eighteen rows, so
	// underneath meant scrolling past every one of them to find the two things on
	// this screen that are somewhere to go rather than something to read.
	const kitLink = (
		<NavCard
			href={`/s/${seasonId}/kit`}
			icon={<ShoppingBagIcon {...stylex.props(styles.linkIcon)} aria-hidden='true' />}
			title='Kit'
			// Which kinds, not how many of each, "1 vests" is the sort of thing a
			// count can't say. The screen itself has the detail.
			note={
				kit.length === 0
					? 'Nothing listed yet'
					: groupKitByKind(kit)
							.map(group => KIT_KIND_LABELS[group.kind])
							.join(' · ')
			}
		/>
	);

	// The summary line is what each person owes rather than a balance, because a
	// balance would mean subscribing to the whole book from a screen that does not
	// otherwise read it, and an extra is not allowed to anyway. A member's share is
	// the bill divided by the squad, so it moves when somebody joins or leaves.
	const financesLink = (
		<NavCard
			href={`/s/${seasonId}/finances`}
			icon={<BanknotesIcon {...stylex.props(styles.linkIcon)} aria-hidden='true' />}
			title='Finances'
			note={
				fees.total === 0 && fees.perGame === 0
					? 'Nothing is being collected'
					: `${formatSek(entryShare(fees.total, season.memberUids.length))} each, ${formatSek(fees.perGame)} a game as an extra`
			}
		/>
	);

	// In the body rather than the top bar: an admin-only control up there appears
	// on this screen and no other, which drags the tabs beside it around.
	//
	// Styled as a link rather than wrapping a <Button>, since a <button> inside
	// an <a> is invalid and breaks keyboard nav.
	const manageLink = isAdmin ? (
		<Link href={`/s/${seasonId}/admin/members`} {...stylex.props(surfaces.glassCard, styles.manage)}>
			<Cog6ToothIcon {...stylex.props(styles.cog)} aria-hidden='true' />
			Manage squad
		</Link>
	) : null;

	// A failed read takes the dots away and leaves the roster, which is what the
	// screen is for. It says so out loud rather than drawing nothing, because a
	// season nobody has answered anything in and a read that never landed are
	// the same picture, and only one of them is worth pressing something about.
	const availabilityFailed = (
		<div {...stylex.props(styles.failed)}>
			<span {...stylex.props(styles.failedText)}>Couldn&apos;t load who has been playing.</span>
			<button type='button' onClick={retryAnswers} {...stylex.props(styles.retry)}>
				Try again
			</button>
		</div>
	);

	return (
		<SeasonShell title='Club' subtitle={season.name}>
			{members.length === 0 && extras.length === 0 ? (
				<EmptyState
					icon={<UsersIcon />}
					title='No squad yet'
					message={
						isAdmin
							? 'Add players to build the roster.'
							: 'An admin has not added anyone to this season yet.'
					}
					action={manageLink}
				/>
			) : (
				<div {...stylex.props(styles.page)}>
					<div {...stylex.props(styles.links)}>
						{kitLink}
						{financesLink}
					</div>

					{dotted.length > 0 &&
						(answersError ? availabilityFailed : <AvailabilityLegend sx={styles.legend} />)}

					<section>
						<SectionHeading sx={styles.heading}>Squad ({members.length})</SectionHeading>

						<ListCard>
							{/* Only reachable with extras below it, which is a real
							    state a new season passes through: a game is up, an
							    admin has added nobody, and the first person to answer
							    is an extra by definition. */}
							{members.length === 0 && <ListEmpty>Nobody in the squad yet.</ListEmpty>}

							{members.map(member => (
								<PlayerRow
									key={member.uid}
									player={member}
									timezone={season.slot.timezone}
									showAvailability={!answersError}
									pending={answersLoading}
									trailing={
										season.adminUids.includes(member.uid) ? (
											<StatusPill tone='brand'>Admin</StatusPill>
										) : null
									}
								/>
							))}
						</ListCard>

						{/* Managing the squad stays under the list it manages. */}
						{manageLink && <div {...stylex.props(styles.manageWrap)}>{manageLink}</div>}
					</section>

					{/* Below the squad, where extras sort on every other list of
					    people in this app, and gone entirely when there are none: an
					    empty Extras card on a season nobody has guested in answers a
					    question nobody asked. */}
					{extras.length > 0 && (
						<section {...stylex.props(styles.extras)}>
							<SectionHeading sx={styles.heading}>Extras ({extras.length})</SectionHeading>

							{/* Says what put somebody here, since this is a list the
							    app works out rather than one anybody keeps. It also
							    accounts for the dots underneath, which are mostly grey
							    on this half: an extra answers the odd game, not the
							    season. */}
							<p {...stylex.props(styles.blurb)}>
								Not in the squad, but they have answered a game this season.
							</p>

							<ListCard>
								{extras.map(extra => (
									<PlayerRow
										key={extra.uid}
										player={extra}
										timezone={season.slot.timezone}
										showAvailability={!answersError}
										pending={answersLoading}
									/>
								))}
							</ListCard>
						</section>
					)}

					<p {...stylex.props(styles.note)}>
						Anyone signed in can put their hand up for a game without being in the squad. A season admin
						gives them a spot game by game.
					</p>
				</div>
			)}
		</SeasonShell>
	);
};

export default MembersPage;
