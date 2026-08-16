'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TrophyIcon } from '@heroicons/react/24/outline';
import { getRatingLadder, getSeasonTable, toDisplayMovement } from '@shared/leaderboard';
import type { SeasonResult } from '@shared/leaderboard';
import { toDisplayRating } from '@shared/rating';
import { formatGameDate, placeLabel, shortName } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useSeasonLedger, useUsers } from '../../../../../hooks/useData';
import { useAuth } from '../../../../../lib/auth';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';
import { classNames } from '../../../../../lib/utils/reactHelper';

type Tab = 'season' | 'all-time';

/**
 * The last few games, oldest on the left, the way a form guide reads.
 *
 * Won or nothing, with no shade in between: a finishing place only means
 * something against the number of teams that played, and the ledger cannot say
 * how many there were — a tie for last is indistinguishable from a smaller
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
		aria-label={`Last ${form.length} ${form.length === 1 ? 'game' : 'games'}, oldest first: ${form
			.map(game => placeLabel(game.position))
			.join(', ')}`}
		className='flex w-12 shrink-0 items-center justify-end gap-1'
	>
		{form.map(game => (
			<span
				key={game.gameId}
				title={`${placeLabel(game.position)} — ${formatGameDate(game.kickoff, timezone)}`}
				className={classNames('size-1.5 rounded-full', game.won ? 'bg-brand' : 'bg-white/20')}
			/>
		))}
	</span>
);

const LeaderboardPage = () => {
	const { seasonId, season, loading } = useSeasonContext();
	const { entries, loading: ledgerLoading } = useSeasonLedger(seasonId);
	const { users } = useUsers();
	const { user } = useAuth();
	const [tab, setTab] = useState<Tab>('season');

	const usersByUid = useMemo(() => new Map(users.map(person => [person.uid, person])), [users]);
	const seasonTable = useMemo(() => getSeasonTable(entries, seasonId), [entries, seasonId]);
	const ladder = useMemo(() => getRatingLadder(users), [users]);

	if (loading || ledgerLoading) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<Skeleton />
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

	const name = (uid: string) => shortName(usersByUid.get(uid)?.displayName ?? 'Unknown player');

	return (
		<SeasonShell title='Table' subtitle={season.name} backHref={`/s/${seasonId}`}>
			<div className='space-y-4 p-4'>
				<div className='glass flex gap-1 rounded-2xl p-1'>
					{(
						[
							['season', 'This season'],
							['all-time', 'All time'],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type='button'
							onClick={() => setTab(key)}
							className={classNames(
								'h-10 flex-1 rounded-xl text-sm font-semibold transition-colors',
								tab === key ? 'bg-brand text-canvas' : 'text-muted hover:text-ink'
							)}
						>
							{label}
						</button>
					))}
				</div>

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
											displayName={profile?.displayName ?? 'Unknown player'}
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
												: movementLabel(toDisplayMovement(row.movement))}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}

				<p className='text-faint px-1 text-xs'>
					{tab === 'season'
						? 'Ordered on games won, then on how much rating you gained — who had a good season, rather than who is best. The dots are the last five games, oldest first, and a filled one is a win.'
						: 'Your rating follows you across every season. It moves on how your team did against how it was expected to, so beating a stronger side is worth more.'}
				</p>
			</div>
		</SeasonShell>
	);
};

const movementLabel = (shown: number) => (shown > 0 ? `+${shown}` : `${shown}`);

export default LeaderboardPage;
