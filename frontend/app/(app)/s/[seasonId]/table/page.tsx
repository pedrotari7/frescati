'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TrophyIcon } from '@heroicons/react/24/outline';
import { getRatingLadder, getSeasonTable, toDisplayMovement } from '@shared/leaderboard';
import type { SeasonResult, SeasonSort } from '@shared/leaderboard';
import { toDisplayRating } from '@shared/rating';
import { counted, formatGameDate, placeLabel, signed } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useSeasonLedger, useUsersByUid } from '../../../../../hooks/useData';
import { displayNameOf, nameByUid } from '../../../../../lib/people';
import { useAuth } from '../../../../../lib/auth';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';
import { classNames } from '../../../../../lib/utils/reactHelper';

type Tab = 'season' | 'all-time';

/**
 * The three ways to read a season, in the order the control offers them, the
 * default first. `getSeasonTable` carries the argument for why that one leads.
 */
const SORTS: { key: SeasonSort; label: string }[] = [
	{ key: 'won', label: 'Won' },
	{ key: 'rating', label: 'Rating' },
	{ key: 'played', label: 'Played' },
];

/**
 * What each order means, said under the table it drew.
 *
 * A sentence per sort rather than one for all three, because the numbers on a
 * row never move, only their order does. Somebody who missed which column is
 * leading has nothing else on the screen to tell the three tables apart.
 */
const SORT_NOTES: Record<SeasonSort, string> = {
	won: 'Ordered on games won, then on how much rating you gained, who had a good season, rather than who is best.',
	rating: 'Ordered on rating gained, then on games won. How far the season moved you, where beating a stronger side counts for more than beating a weaker one.',
	played: 'Ordered on games played, then on games won. Who turned up, rather than how it went once they were there.',
};

/**
 * The last few games, oldest on the left, the way a form guide reads.
 *
 * Won or nothing, with no shade in between: a finishing place only means
 * something against the number of teams that played, and the ledger cannot say
 * how many there were, a tie for last is indistinguishable from a smaller
 * field. So the dot claims exactly what the win column beside it claims, and
 * the place goes in the title for anybody who wants it.
 *
 * Right-aligned in a fixed width so a newcomer's two dots line up under
 * everybody else's fifth, which is the one every eye goes to.
 */
const FormDots = ({ form, timezone }: { form: SeasonResult[]; timezone: string }) => (
	<span
		role='img'
		// Read out as places rather than as won-and-not-won, which is the one
		// thing a dot can say and a sentence doesn't have to.
		aria-label={`Last ${counted(form.length, 'game')}, oldest first: ${form
			.map(game => placeLabel(game.position))
			.join(', ')}`}
		className='flex w-12 shrink-0 items-center justify-end gap-1'
	>
		{form.map(game => (
			<span
				key={game.gameId}
				title={`${placeLabel(game.position)} · ${formatGameDate(game.kickoff, timezone)}`}
				className={classNames('size-1.5 rounded-full', game.won ? 'bg-brand' : 'bg-white/20')}
			/>
		))}
	</span>
);

const LeaderboardPage = () => {
	const { seasonId, season, loading, error, retry } = useSeasonContext();
	const { entries, loading: ledgerLoading } = useSeasonLedger(seasonId);
	const { users, usersByUid } = useUsersByUid();
	const { user } = useAuth();
	const [tab, setTab] = useState<Tab>('season');
	const [sort, setSort] = useState<SeasonSort>('won');

	const seasonTable = useMemo(() => getSeasonTable(entries, seasonId, sort), [entries, seasonId, sort]);
	const ladder = useMemo(() => getRatingLadder(users), [users]);

	if (loading || ledgerLoading) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<LoadFailed what='the table' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	const rows = tab === 'season' ? seasonTable : ladder;

	const name = (uid: string) => nameByUid(usersByUid, uid);

	return (
		<SeasonShell title='Table' subtitle={season.name} backHref={`/s/${seasonId}`}>
			<div className='space-y-4 p-4'>
				{/* A pair of toggles rather than a tablist, which would want
				    `aria-controls` and a `tabpanel` for a table that is just the
				    rest of the page. `aria-pressed` is what says which one is on:
				    without it the active tab was a colour and nothing else, so a
				    screen reader got "This season, button. All time, button" with
				    no way to tell which table was underneath. */}
				<div className='glass flex gap-1 rounded-2xl p-1' role='group' aria-label='Which table to show'>
					{(
						[
							['season', 'This season'],
							['all-time', 'All time'],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type='button'
							aria-pressed={tab === key}
							onClick={() => setTab(key)}
							className={classNames(
								'focus-visible:ring-brand/60 h-10 flex-1 rounded-xl text-sm font-semibold transition-colors',
								'focus-visible:ring-2 focus-visible:outline-none',
								tab === key ? 'bg-brand text-canvas' : 'text-muted hover:text-ink'
							)}
						>
							{label}
						</button>
					))}
				</div>

				{/* Over the season table only, which is the one with three
				    numbers to choose between. The all-time ladder is the rating
				    ladder by definition, and it has no wins column to offer
				    anyway. Smaller and rounder than the toggle above it, and grey
				    rather than green when it is on, so two rows of buttons don't
				    read as two sets of tabs. */}
				{tab === 'season' && (
					<div className='flex items-center gap-2 px-1'>
						<span id='season-sort-label' className='text-faint text-xs font-semibold'>
							Sort
						</span>

						<div
							className='glass flex gap-1 rounded-full p-1'
							role='group'
							aria-labelledby='season-sort-label'
						>
							{SORTS.map(({ key, label }) => (
								<button
									key={key}
									type='button'
									aria-pressed={sort === key}
									onClick={() => setSort(key)}
									// h-9 because it is a thumb, not a pointer. The text
									// is small to keep this behind the toggle above it.
									// The target it sits in is not.
									className={classNames(
										'focus-visible:ring-brand/60 h-9 rounded-full px-3 text-xs font-semibold transition-colors',
										'focus-visible:ring-2 focus-visible:outline-none',
										sort === key ? 'text-ink bg-white/12' : 'text-muted hover:text-ink'
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				)}

				{rows.length === 0 ? (
					<EmptyState
						icon={<TrophyIcon />}
						title='Nothing to show yet'
						message={
							tab === 'season'
								? 'The table fills in as games get confirmed.'
								: 'Ratings appear once somebody has played a confirmed game.'
						}
					/>
				) : (
					<ul className='glass divide-y divide-white/6 overflow-hidden rounded-3xl'>
						{rows.map(row => {
							const shared = rows.filter(other => other.position === row.position).length > 1;
							const profile = usersByUid.get(row.uid);

							return (
								<li key={row.uid}>
									<Link
										href={`/u/${row.uid}`}
										className={classNames(
											'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5',
											row.uid === user?.uid && 'bg-white/6'
										)}
									>
										<span className='text-faint w-9 shrink-0 text-xs font-semibold tabular-nums'>
											{placeLabel(row.position, shared)}
										</span>

										<Avatar
											displayName={displayNameOf(profile)}
											photoURL={profile?.photoURL}
											size='sm'
										/>

										<div className='min-w-0 flex-1'>
											<p className='text-ink truncate text-sm font-semibold'>{name(row.uid)}</p>
											<p className='text-faint text-xs'>
												{'wins' in row
													? `${row.appearances} played · ${row.wins} won`
													: `${row.games} played`}
											</p>
										</div>

										{'form' in row && row.form.length > 0 && (
											<FormDots form={row.form} timezone={season.slot.timezone} />
										)}

										{'provisional' in row && row.provisional && (
											<StatusPill tone='pending'>Settling</StatusPill>
										)}

										<span className='text-ink w-10 text-right text-lg font-bold tabular-nums'>
											{'elo' in row
												? toDisplayRating(row.elo)
												: signed(toDisplayMovement(row.movement))}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}

				<p className='text-faint px-1 text-xs'>
					{tab === 'season'
						? `${SORT_NOTES[sort]} The dots are the last five games, oldest first, and a filled one is a win. The number reads the whole season and rounds once, so adding up the per game changes on a profile can land a point or two either side of it.`
						: 'Your rating follows you across every season. It moves on how your team did against how it was expected to, so beating a stronger side is worth more, and beating them comfortably more again.'}
				</p>
			</div>
		</SeasonShell>
	);
};

export default LeaderboardPage;
