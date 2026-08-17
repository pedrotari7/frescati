'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, TrophyIcon } from '@heroicons/react/24/outline';
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
import { classNames } from '../../../../lib/utils/reactHelper';

/**
 * One player, across every season they have ever played.
 *
 * Global rather than nested under a season, because the thing it is mostly
 * about is: a rating is career-long and carried between seasons, and half the
 * point of the screen is seeing a run that spans them. `/admin/ratings` sits
 * outside a season for the same reason.
 *
 * Everything below the name is aggregated from the rating ledger — see
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
 * everybody regardless — a single game is a fact — but the two lines that name
 * a name out loud need enough behind them to still be true next month.
 */
const MIN_LINK_GAMES = 4;

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
	<div className='glass rounded-2xl p-3 text-center'>
		<p className='text-ink text-2xl font-bold tabular-nums'>{value}</p>
		<p className='text-faint mt-0.5 text-[11px] font-semibold tracking-wider uppercase'>{label}</p>
		{hint && <p className='text-faint mt-1 text-[11px]'>{hint}</p>}
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
	// saying out loud. Off the same entries as the record above — but only the
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
			<div className='space-y-4 p-4'>
				<section className='glass flex items-center gap-4 rounded-3xl p-5'>
					<Avatar displayName={player.displayName} photoURL={player.photoURL} size='lg' />

					<div className='min-w-0 flex-1'>
						<p className='text-ink truncate font-semibold'>{player.displayName}</p>
						<p className='text-faint mt-0.5 truncate text-xs'>
							{rank
								? `${placeLabel(rank.position, ladder.filter(row => row.position === rank.position).length > 1)} of ${ladder.length} on the all-time ladder`
								: 'Not on the ladder yet'}
						</p>

						<div className='mt-2 flex flex-wrap gap-1.5'>
							{isYou && <StatusPill tone='brand'>You</StatusPill>}
							{/* Only when there is one to show. A "0" here would put the
							    absence of an award on every profile in the group. */}
							{record.motm > 0 && (
								<StatusPill tone='pending'>
									<TrophyIcon className='size-3' aria-hidden='true' />
									{record.motm} man of the match
								</StatusPill>
							)}
							{rating && !hasPlayed(rating) && <StatusPill tone='pending'>Estimate</StatusPill>}
							{isProvisional(rating) && hasPlayed(rating) && (
								<StatusPill tone='pending'>Settling</StatusPill>
							)}
						</div>
					</div>

					<div className='shrink-0 text-right'>
						<p className='text-ink text-4xl font-bold tabular-nums'>
							{rating ? toDisplayRating(rating.elo) : '—'}
						</p>
						<p className='text-faint text-[11px] font-semibold tracking-wider uppercase'>Rating</p>
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
						<div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
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
							<section className='glass rounded-3xl p-5'>
								<div className='mb-4 flex items-baseline justify-between gap-2'>
									<h2 className='text-ink text-sm font-semibold'>Rating over time</h2>
									<span className='text-faint text-xs'>
										{trend[0]} → {trend[trend.length - 1]}
									</span>
								</div>

								<RatingChart
									values={trend}
									label={`Rating across ${record.appearances} games, from ${trend[0]} to ${trend[trend.length - 1]}`}
								/>

								<p className='text-faint mt-4 text-xs leading-relaxed'>
									A rating moves on how your team finished against how it was expected to, so a win
									over a stronger field is worth more than one over a weaker.
								</p>
							</section>
						)}

						<section className='glass rounded-3xl p-5'>
							<div className='mb-3 flex items-baseline justify-between gap-2'>
								<h2 className='text-ink text-sm font-semibold'>Form</h2>
								{record.currentRun > 1 && (
									<StatusPill tone='brand'>{record.currentRun} in a row</StatusPill>
								)}
							</div>

							{/* Oldest on the left, the way a form guide reads. */}
							<ol className='flex gap-2'>
								{form.map(game => (
									<li
										key={game.gameId}
										className={classNames(
											'flex size-10 items-center justify-center rounded-xl text-xs font-bold ring-1 ring-inset',
											game.won
												? 'bg-brand/15 text-brand ring-brand/25'
												: 'text-muted bg-white/6 ring-white/10'
										)}
										title={formatGameDate(
											game.kickoff,
											seasonsById.get(game.seasonId)?.slot.timezone ?? 'UTC'
										)}
									>
										{placeLabel(game.position)}
									</li>
								))}
							</ol>

							<p className='text-faint mt-3 text-xs'>
								Where their team finished in the last {counted(form.length, 'game')}, oldest first.
							</p>
						</section>

						{links.length > 0 && (
							<section>
								<SectionHeading className='mb-2 px-1'>Played with ({links.length})</SectionHeading>

								{(chemistry.bestWith || chemistry.nemesis) && (
									<div className='mb-2 space-y-1 px-1'>
										{chemistry.bestWith && (
											<p className='text-faint text-xs'>
												Wins most alongside{' '}
												<span className='text-ink font-semibold'>
													{nameByUid(usersById, chemistry.bestWith.uid)}
												</span>{' '}
												— {chemistry.bestWith.wonTogether} of {chemistry.bestWith.together}{' '}
												together.
											</p>
										)}
										{chemistry.nemesis && (
											<p className='text-faint text-xs'>
												Comes off worst against{' '}
												<span className='text-ink font-semibold'>
													{nameByUid(usersById, chemistry.nemesis.uid)}
												</span>{' '}
												— {chemistry.nemesis.beat}–{chemistry.nemesis.drewWith}–
												{chemistry.nemesis.lostTo} in {chemistry.nemesis.against} games.
											</p>
										)}
									</div>
								)}

								<ul className='glass divide-y divide-white/6 overflow-hidden rounded-3xl'>
									{/* Two numbers need saying which is which, and the
									    caption strip is already how this page labels a
									    run of rows. */}
									<li className='text-faint flex items-center gap-3 bg-white/5 px-4 py-1.5 text-[11px] font-semibold tracking-wider uppercase'>
										<span className='flex-1'>Player</span>
										<span className='w-11 text-right'>With</span>
										<span className='w-11 text-right'>Vs</span>
									</li>

									{(showAllLinks ? links : links.slice(0, INITIAL_LINKS)).map(link => (
										<LinkRow key={link.uid} link={link} profile={usersById.get(link.uid) ?? null} />
									))}
								</ul>

								<p className='text-faint mt-3 px-1 text-xs leading-relaxed'>
									Games their team won out of games on the same team, then games they finished above
									out of games on opposite teams. A level finish counts for neither.
									{linkedGames < record.appearances &&
										` Worked out from ${linkedGames} of ${record.appearances} games — the rest were rated before the app recorded who was on which team.`}
								</p>

								{links.length > INITIAL_LINKS && !showAllLinks && (
									<Button
										variant='secondary'
										fullWidth
										className='mt-3'
										onClick={() => setShowAllLinks(true)}
									>
										Show all {links.length}
									</Button>
								)}
							</section>
						)}

						<section>
							<SectionHeading className='mb-2 px-1'>Every game ({record.appearances})</SectionHeading>

							<ul className='glass divide-y divide-white/6 overflow-hidden rounded-3xl'>
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

							{listed.length > visible.length && (
								<Button variant='secondary' fullWidth className='mt-3' onClick={() => setShowAll(true)}>
									Show all {listed.length} games
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
		<li>
			<Link
				href={`/u/${link.uid}`}
				className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5'
			>
				<Avatar displayName={name} photoURL={profile?.photoURL} size='sm' />

				<span className='text-ink min-w-0 flex-1 truncate text-sm'>{name}</span>

				<span
					className='text-muted w-11 text-right text-xs tabular-nums'
					title={`${link.wonTogether} of ${link.together} won on the same team`}
				>
					{link.together === 0 ? '—' : `${link.wonTogether}/${link.together}`}
				</span>

				<span
					className='text-muted w-11 text-right text-xs tabular-nums'
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
	<li>
		{seasonName && (
			<p className='text-faint bg-white/5 px-4 py-1.5 text-[11px] font-semibold tracking-wider uppercase'>
				{seasonName}
			</p>
		)}

		<Link
			href={`/s/${game.seasonId}/g/${game.gameId}/tournament`}
			className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5'
		>
			<span
				className={classNames(
					'w-10 shrink-0 text-xs font-bold tabular-nums',
					game.won ? 'text-brand' : 'text-faint'
				)}
			>
				{placeLabel(game.position)}
			</span>

			<span className='text-ink min-w-0 flex-1 truncate text-sm'>{formatGameDate(game.kickoff, timezone)}</span>

			{game.motm && (
				<TrophyIcon
					className='text-pending size-4 shrink-0'
					aria-label='Man of the match'
					// A title as well as a label: on a desktop this is the only
					// explanation a hover can offer, and the row is otherwise numbers.
					title='Man of the match'
				/>
			)}

			<RatingMovement delta={game.delta} flat={<span className='text-faint text-xs tabular-nums'>—</span>} />

			<span className='text-faint w-8 text-right text-xs tabular-nums'>{toDisplayRating(game.after)}</span>

			<ChevronRightIcon className='text-faint size-4 shrink-0' aria-hidden='true' />
		</Link>
	</li>
);

export default PlayerPage;
