'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { FORM_LENGTH, getRatingLadder } from '@shared/leaderboard';
import { getPlayerChemistry, getPlayerLinks, getPlayerRecord, getRatingTrend } from '@shared/player';
import type { PlayerGame, PlayerLink } from '@shared/player';
import type { AppUser } from '@shared/types';
import { hasPlayed, isProvisional, toDisplayRating } from '@shared/rating';
import { counted, formatGameDate, placeLabel } from '@shared/format';
import { usePlayerLedger, useSeasons, useUsersByUid } from '../../../../hooks/useData';
import { displayNameOf, nameByUid } from '../../../../lib/people';
import { useAuth } from '../../../../lib/auth';
import { useSeasonScope } from '../../../../components/SeasonScope';
import { seasonNavItems } from '../../../../components/BottomNav';
import PageShell from '../../../../components/PageShell';
import Skeleton from '../../../../components/Skeleton';
import EmptyState from '../../../../components/EmptyState';
import Avatar from '../../../../components/Avatar';
import Button from '../../../../components/Button';
import StatusPill from '../../../../components/StatusPill';
import RatingChart from '../../../../components/RatingChart';
import RatingMovement from '../../../../components/RatingMovement';
import { SectionHeading } from '../../../../components/Section';
import { bp, colors, tint } from '../../../tokens.stylex';
import { surfaces, utils } from '../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },

	/* Eleven px, small caps. The label under a figure and the caption over a run
	   of rows are both labels on something else rather than text to read, which
	   is why they sit a size below everything around them. */
	caption: {
		color: colors.faint,
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},

	/* Two across on a phone, four on anything wider. Four of these on a 320px
	   row would break every one of the labels across two lines. */
	stats: {
		display: 'grid',
		gridTemplateColumns: { default: 'repeat(2, minmax(0, 1fr))', [bp.sm]: 'repeat(4, minmax(0, 1fr))' },
		gap: 12,
	},
	stat: { borderRadius: 16, padding: 12, textAlign: 'center' },
	statValue: {
		color: colors.ink,
		fontSize: 24,
		lineHeight: '32px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	statLabel: { marginTop: 2 },
	statHint: { color: colors.faint, marginTop: 4, fontSize: 11 },

	profile: { display: 'flex', alignItems: 'center', gap: 16, borderRadius: 24, padding: 20 },
	identity: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	rank: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
	pills: { marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 },
	pillIcon: { width: 12, height: 12 },
	ratingBox: { flexShrink: 0, textAlign: 'right' },
	elo: {
		color: colors.ink,
		fontSize: 36,
		lineHeight: '40px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},

	card: { borderRadius: 24, padding: 20 },
	cardHead: { marginBottom: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
	headTight: { marginBottom: 12 },
	cardTitle: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	small: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	strong: { color: colors.ink, fontWeight: 600 },
	chartNote: { color: colors.faint, marginTop: 16, fontSize: 12, lineHeight: 1.625 },

	form: { display: 'flex', gap: 8 },
	formCell: {
		display: 'flex',
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 700,
	},
	formWon: { backgroundColor: tint.brand15, color: colors.brand, boxShadow: `inset 0 0 0 1px ${tint.brand25}` },
	formLost: { backgroundColor: tint.white6, color: colors.muted, boxShadow: `inset 0 0 0 1px ${tint.white10}` },
	formNote: { color: colors.faint, marginTop: 12, fontSize: 12, lineHeight: '16px' },

	heading: { marginBottom: 8, paddingInline: 4 },
	chemistry: { marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4, paddingInline: 4 },

	list: { overflow: 'hidden', borderRadius: 24 },
	/* The `divide-y divide-white/6` these two lists drew, moved onto the row:
	   StyleX has no sibling selector, so the hairline hangs off the row itself. */
	item: { borderTopWidth: { default: 1, ':first-child': 0 }, borderTopStyle: 'solid', borderTopColor: tint.white6 },
	captionRow: { backgroundColor: tint.white5, paddingInline: 16, paddingBlock: 6 },
	captionCols: { display: 'flex', alignItems: 'center', gap: 12 },
	colPlayer: { flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	colNum: { width: 44, textAlign: 'right' },

	rowLink: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingInline: 16,
		paddingBlock: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	rowName: {
		color: colors.ink,
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
	},
	rowNum: {
		color: colors.muted,
		width: 44,
		textAlign: 'right',
		fontSize: 12,
		lineHeight: '16px',
		fontVariantNumeric: 'tabular-nums',
	},

	place: {
		width: 40,
		flexShrink: 0,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	placeWon: { color: colors.brand },
	placeLost: { color: colors.faint },
	trophy: { color: colors.pending, width: 16, height: 16, flexShrink: 0 },
	after: {
		color: colors.faint,
		width: 32,
		textAlign: 'right',
		fontSize: 12,
		lineHeight: '16px',
		fontVariantNumeric: 'tabular-nums',
	},
	chevron: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },

	note: { color: colors.faint, marginTop: 12, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
	more: { marginTop: 12 },
});

/**
 * One player, across every season they have ever played.
 *
 * Global rather than nested under a season, because the thing it is mostly
 * about is: a rating is career-long and carried between seasons, and half the
 * point of the screen is seeing a run that spans them. `/admin/ratings` sits
 * outside a season for the same reason.
 *
 * Everything below the name is aggregated from the rating ledger. See
 * `shared/player.ts`. Nothing new is stored, and nothing here can disagree with
 * the table, because a correction that replays the ladder rewrites the same
 * entries this reads.
 */

/** Games listed before the list asks whether you really want the rest. */
const INITIAL_GAMES = 12;

/** Teammates and opponents listed before the same question. */
const INITIAL_LINKS = 6;

/**
 * Games with somebody before their record together is called a pattern.
 *
 * One game together is a hundred per cent partnership. The list below shows
 * everybody regardless, a single game is a fact, but the two lines that name
 * a name out loud need enough behind them to still be true next month.
 */
const MIN_LINK_GAMES = 4;

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
	<div {...stylex.props(surfaces.glass, styles.stat)}>
		<p {...stylex.props(styles.statValue)}>{value}</p>
		<p {...stylex.props(styles.caption, styles.statLabel)}>{label}</p>
		{hint && <p {...stylex.props(styles.statHint)}>{hint}</p>}
	</div>
);

const PlayerPage = ({ params }: { params: Promise<{ uid: string }> }) => {
	const { uid } = use(params);
	const { user } = useAuth();
	const { seasonId } = useSeasonScope();
	const { users, usersByUid: usersById, loading: usersLoading } = useUsersByUid();
	const { seasons } = useSeasons();
	const { entries, loading: ledgerLoading } = usePlayerLedger(uid);
	const [showAll, setShowAll] = useState(false);
	const [showAllLinks, setShowAllLinks] = useState(false);

	const player = users.find(candidate => candidate.uid === uid) ?? null;
	const record = useMemo(() => getPlayerRecord(entries, uid), [entries, uid]);
	const seasonsById = useMemo(() => new Map(seasons.map(season => [season.id, season])), [seasons]);

	// Everybody they have ever shared a game with, and the two of those worth
	// saying out loud. Off the same entries as the record above, but only the
	// ones carrying a team map, since a shared finishing place cannot say which
	// side of it two players were on.
	const links = useMemo(() => getPlayerLinks(entries, uid), [entries, uid]);
	const chemistry = useMemo(() => getPlayerChemistry(links, MIN_LINK_GAMES), [links]);

	// Counted rather than assumed equal to `appearances`: entries written before
	// the team map existed are absent here, and a panel quietly built on half a
	// career should say so instead of looking complete.
	const linkedGames = useMemo(() => entries.filter(entry => entry.teams?.[uid] !== undefined).length, [entries, uid]);

	// The all-time ladder, purely to say where this player stands on it. Built
	// from the same `useUsers` subscription the name came from, so the rank costs
	// nothing extra to know.
	const ladder = useMemo(() => getRatingLadder(users), [users]);
	const rank = ladder.find(row => row.uid === uid);

	// Everywhere out of a season keeps the tabs of the season you came from, the
	// same trade /me makes: the bar you tapped shouldn't move out from under you.
	//
	// The season is the fallback way out rather than the way out: a profile is
	// opened from a game's roster, a team sheet, the table and other profiles,
	// and the chevron goes back the way it came whenever there is a way. See
	// `AppHistory`. This is what is left for somebody who arrived by link.
	const shell = {
		navItems: seasonId ? seasonNavItems(seasonId) : undefined,
		backHref: seasonId ? `/s/${seasonId}` : '/seasons',
	};

	if (usersLoading || ledgerLoading) {
		return (
			<PageShell title='Player' {...shell}>
				<Skeleton />
			</PageShell>
		);
	}

	if (!player) {
		return (
			<PageShell title='Player' {...shell}>
				<EmptyState title='Player not found' message='Nobody has signed in with this account.' />
			</PageShell>
		);
	}

	const isYou = uid === user?.uid;
	const rating = player.rating;
	const trend = getRatingTrend(record.games).map(toDisplayRating);
	const form = record.games.slice(-FORM_LENGTH);

	// Newest first here, unlike the record itself: a list is read from the top,
	// and the game somebody wants is almost always the last one played.
	const listed = [...record.games].reverse();
	const visible = showAll ? listed : listed.slice(0, INITIAL_GAMES);

	return (
		<PageShell title={player.displayName} {...shell}>
			<div {...stylex.props(styles.page)}>
				<section {...stylex.props(surfaces.glass, styles.profile)}>
					<Avatar displayName={player.displayName} photoURL={player.photoURL} size='lg' />

					<div {...stylex.props(styles.identity)}>
						<p {...stylex.props(styles.name, utils.truncate)}>{player.displayName}</p>
						<p {...stylex.props(styles.rank, utils.truncate)}>
							{rank
								? `${placeLabel(rank.position, ladder.filter(row => row.position === rank.position).length > 1)} of ${ladder.length} on the all-time ladder`
								: 'Not on the ladder yet'}
						</p>

						<div {...stylex.props(styles.pills)}>
							{isYou && <StatusPill tone='brand'>You</StatusPill>}
							{/* Only when there is one to show. A "0" here would put the
							    absence of an award on every profile in the group. */}
							{record.motm > 0 && (
								<StatusPill tone='pending'>
									<TrophyIcon {...stylex.props(styles.pillIcon)} aria-hidden='true' />
									{record.motm} man of the match
								</StatusPill>
							)}
							{rating && !hasPlayed(rating) && <StatusPill tone='pending'>Estimate</StatusPill>}
							{isProvisional(rating) && hasPlayed(rating) && (
								<StatusPill tone='pending'>Settling</StatusPill>
							)}
						</div>
					</div>

					<div {...stylex.props(styles.ratingBox)}>
						<p {...stylex.props(styles.elo)}>{rating ? toDisplayRating(rating.elo) : '—'}</p>
						<p {...stylex.props(styles.caption)}>Rating</p>
					</div>
				</section>

				{record.appearances === 0 ? (
					<EmptyState
						icon={<TrophyIcon />}
						title='No games yet'
						message={
							rating
								? 'An admin has set a starting rating, but nothing counts until a confirmed game.'
								: `${player.displayName} hasn't played a confirmed game, so there is nothing to work a record out from.`
						}
					/>
				) : (
					<>
						<div {...stylex.props(styles.stats)}>
							<Stat label='Played' value={String(record.appearances)} />
							<Stat
								label='Won'
								value={String(record.wins)}
								hint={`${Math.round((record.wins / record.appearances) * 100)}% of games`}
							/>
							<Stat
								label='Best run'
								value={String(record.bestRun)}
								hint={record.bestRun === 1 ? 'win' : 'wins in a row'}
							/>
							<Stat
								label='Peak'
								value={String(toDisplayRating(record.peak!))}
								hint={
									rating && toDisplayRating(record.peak!) === toDisplayRating(rating.elo)
										? 'right now'
										: undefined
								}
							/>
						</div>

						{trend.length > 1 && (
							<section {...stylex.props(surfaces.glass, styles.card)}>
								<div {...stylex.props(styles.cardHead)}>
									<h2 {...stylex.props(styles.cardTitle)}>Rating over time</h2>
									<span {...stylex.props(styles.small)}>
										{trend[0]} → {trend[trend.length - 1]}
									</span>
								</div>

								<RatingChart
									values={trend}
									label={`Rating across ${record.appearances} games, from ${trend[0]} to ${trend[trend.length - 1]}`}
								/>

								<p {...stylex.props(styles.chartNote)}>
									A rating moves on how your team did against how it was expected to, so a win over a
									stronger field is worth more than one over a weaker, and a comfortable win more than
									a squeak.
								</p>
							</section>
						)}

						<section {...stylex.props(surfaces.glass, styles.card)}>
							<div {...stylex.props(styles.cardHead, styles.headTight)}>
								<h2 {...stylex.props(styles.cardTitle)}>Form</h2>
								{record.currentRun > 1 && (
									<StatusPill tone='brand'>{record.currentRun} in a row</StatusPill>
								)}
							</div>

							{/* Oldest on the left, the way a form guide reads. */}
							<ol {...stylex.props(styles.form)}>
								{form.map(game => (
									<li
										key={game.gameId}
										{...stylex.props(styles.formCell, game.won ? styles.formWon : styles.formLost)}
										title={formatGameDate(
											game.kickoff,
											seasonsById.get(game.seasonId)?.slot.timezone ?? 'UTC'
										)}
									>
										{placeLabel(game.position)}
									</li>
								))}
							</ol>

							<p {...stylex.props(styles.formNote)}>
								Where their team finished in the last {counted(form.length, 'game')}, oldest first.
							</p>
						</section>

						{links.length > 0 && (
							<section>
								<SectionHeading sx={styles.heading}>Played with ({links.length})</SectionHeading>

								{(chemistry.bestWith || chemistry.nemesis) && (
									<div {...stylex.props(styles.chemistry)}>
										{chemistry.bestWith && (
											<p {...stylex.props(styles.small)}>
												Wins most alongside{' '}
												<span {...stylex.props(styles.strong)}>
													{nameByUid(usersById, chemistry.bestWith.uid)}
												</span>{' '}
												, {chemistry.bestWith.wonTogether} of {chemistry.bestWith.together}{' '}
												together.
											</p>
										)}
										{chemistry.nemesis && (
											<p {...stylex.props(styles.small)}>
												Comes off worst against{' '}
												<span {...stylex.props(styles.strong)}>
													{nameByUid(usersById, chemistry.nemesis.uid)}
												</span>{' '}
												, {chemistry.nemesis.beat}–{chemistry.nemesis.drewWith}–
												{chemistry.nemesis.lostTo} in {chemistry.nemesis.against} games.
											</p>
										)}
									</div>
								)}

								<ul {...stylex.props(surfaces.glass, styles.list)}>
									{/* Two numbers need saying which is which, and the
									    caption strip is already how this page labels a
									    run of rows. */}
									<li
										{...stylex.props(
											styles.item,
											styles.caption,
											styles.captionRow,
											styles.captionCols
										)}
									>
										<span {...stylex.props(styles.colPlayer)}>Player</span>
										<span {...stylex.props(styles.colNum)}>With</span>
										<span {...stylex.props(styles.colNum)}>Vs</span>
									</li>

									{(showAllLinks ? links : links.slice(0, INITIAL_LINKS)).map(link => (
										<LinkRow key={link.uid} link={link} profile={usersById.get(link.uid) ?? null} />
									))}
								</ul>

								<p {...stylex.props(styles.note)}>
									Games their team won out of games on the same team, then games they finished above
									out of games on opposite teams. A level finish counts for neither.
									{linkedGames < record.appearances &&
										` Worked out from ${linkedGames} of ${record.appearances} games. The rest were rated before the app recorded who was on which team.`}
								</p>

								{links.length > INITIAL_LINKS && (
									<Button
										variant='secondary'
										fullWidth
										sx={styles.more}
										onClick={() => setShowAllLinks(!showAllLinks)}
									>
										{showAllLinks ? 'Show fewer' : `Show all ${links.length}`}
									</Button>
								)}
							</section>
						)}

						<section>
							<SectionHeading sx={styles.heading}>Every game ({record.appearances})</SectionHeading>

							<ul {...stylex.props(surfaces.glass, styles.list)}>
								{visible.map((game, index) => (
									<GameRow
										key={game.gameId}
										game={game}
										seasonName={
											game.seasonId === visible[index - 1]?.seasonId
												? undefined
												: (seasonsById.get(game.seasonId)?.name ?? 'A deleted season')
										}
										timezone={seasonsById.get(game.seasonId)?.slot.timezone ?? 'UTC'}
									/>
								))}
							</ul>

							{/* Two roundings sitting next to each other, which is a
							    contradiction the group will spot before we do. */}
							<p {...stylex.props(styles.note)}>
								Every change rounds to a whole point on its own, so a run of them will not always add up
								to the rating on the right. That column comes straight off the stored rating and is what
								the next game starts from.
							</p>

							{/* A toggle rather than a one-way door. Both of these used
							    to set their state true and then hide themselves, so a
							    regular with three seasons behind them turned this page
							    into a couple of hundred rows with no way back short of
							    reloading it. */}
							{listed.length > INITIAL_GAMES && (
								<Button
									variant='secondary'
									fullWidth
									sx={styles.more}
									onClick={() => setShowAll(!showAll)}
								>
									{showAll ? 'Show fewer' : `Show all ${listed.length} games`}
								</Button>
							)}
						</section>
					</>
				)}
			</div>
		</PageShell>
	);
};

/**
 * One other player, and how the two of them have got on.
 *
 * Wins over games in both columns rather than a percentage, because the numbers
 * behind these are small enough that "67%" flatters two games out of three. The
 * titles are for a desktop hover, where the column headings are the only other
 * explanation on offer.
 */
const LinkRow = ({ link, profile }: { link: PlayerLink; profile: AppUser | null }) => {
	const name = displayNameOf(profile);

	return (
		<li {...stylex.props(styles.item)}>
			<Link href={`/u/${link.uid}`} {...stylex.props(styles.rowLink)}>
				<Avatar displayName={name} photoURL={profile?.photoURL} size='sm' />

				<span {...stylex.props(styles.rowName, utils.truncate)}>{name}</span>

				<span
					{...stylex.props(styles.rowNum)}
					title={`${link.wonTogether} of ${link.together} won on the same team`}
				>
					{link.together === 0 ? '—' : `${link.wonTogether}/${link.together}`}
				</span>

				<span
					{...stylex.props(styles.rowNum)}
					title={`Finished above them in ${link.beat} of ${link.against}, level in ${link.drewWith}`}
				>
					{link.against === 0 ? '—' : `${link.beat}/${link.against}`}
				</span>
			</Link>
		</li>
	);
};

/**
 * One game in the career list.
 *
 * The season is captioned only when it changes on the way down the list, which
 * groups the games without a heading row that a "show all" would have to keep
 * in step.
 */
const GameRow = ({ game, seasonName, timezone }: { game: PlayerGame; seasonName?: string; timezone: string }) => (
	<li {...stylex.props(styles.item)}>
		{seasonName && <p {...stylex.props(styles.caption, styles.captionRow)}>{seasonName}</p>}

		<Link href={`/s/${game.seasonId}/g/${game.gameId}/tournament`} {...stylex.props(styles.rowLink)}>
			<span {...stylex.props(styles.place, game.won ? styles.placeWon : styles.placeLost)}>
				{placeLabel(game.position)}
			</span>

			<span {...stylex.props(styles.rowName, utils.truncate)}>{formatGameDate(game.kickoff, timezone)}</span>

			{game.motm && (
				<TrophyIcon
					{...stylex.props(styles.trophy)}
					aria-label='Man of the match'
					// A title as well as a label: on a desktop this is the only
					// explanation a hover can offer, and the row is otherwise numbers.
					title='Man of the match'
				/>
			)}

			<RatingMovement delta={game.delta} />

			<span {...stylex.props(styles.after)}>{toDisplayRating(game.after)}</span>

			<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
		</Link>
	</li>
);

export default PlayerPage;
