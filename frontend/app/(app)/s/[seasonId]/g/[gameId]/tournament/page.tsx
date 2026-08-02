'use client';

import { use, useMemo } from 'react';
import { ArrowPathIcon, ExclamationTriangleIcon, UsersIcon } from '@heroicons/react/24/outline';
import { describeSquads, getFixtures, getScheduleFit, getSideSize, MIN_TOURNAMENT_PLAYERS } from '@shared/tournament';
import { formatGameDateLong } from '@shared/format';
import { useSeasonContext } from '../../../../../../../components/SeasonProvider';
import { useTournamentTeams, useUsers } from '../../../../../../../hooks/useData';
import { useWrite } from '../../../../../../../hooks/useWrite';
import { useAuth } from '../../../../../../../lib/auth';
import { reshuffleTeams } from '../../../../../../../lib/db/tournament';
import SeasonShell from '../../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../../components/Skeleton';
import EmptyState from '../../../../../../../components/EmptyState';
import Button from '../../../../../../../components/Button';
import StatusPill from '../../../../../../../components/StatusPill';
import TeamCard, { teamName } from '../../../../../../../components/TeamCard';

const TournamentPage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);
	const { season, games, loading, isAdmin } = useSeasonContext();
	const { teams: lineup, loading: teamsLoading } = useTournamentTeams(seasonId, gameId);
	const { users } = useUsers();
	const { user } = useAuth();
	const write = useWrite();

	const game = games.find(candidate => candidate.id === gameId) ?? null;
	const usersByUid = useMemo(() => new Map(users.map(person => [person.uid, person])), [users]);

	const backHref = `/s/${seasonId}/g/${gameId}`;

	if (loading || teamsLoading) {
		return (
			<SeasonShell title='Teams' backHref={backHref}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (!season || !game) {
		return (
			<SeasonShell title='Teams' backHref={backHref}>
				<EmptyState title='Game not found' message='It may have been deleted from the calendar.' />
			</SeasonShell>
		);
	}

	const subtitle = formatGameDateLong(game.kickoff, season.slot.timezone);

	// No lineup means the pool is still short of a tournament. The function
	// clears the document rather than leaving a stale sheet up, so this is the
	// honest state rather than a loading gap.
	if (!lineup || lineup.teams.length === 0) {
		const shortBy = MIN_TOURNAMENT_PLAYERS - game.counts.playing;

		return (
			<SeasonShell title='Teams' subtitle={subtitle} backHref={backHref}>
				<EmptyState
					icon={<UsersIcon />}
					title='No teams yet'
					message={
						shortBy > 0
							? `${game.counts.playing} playing so far. Teams appear at ${MIN_TOURNAMENT_PLAYERS}, so ${shortBy} more to go.`
							: 'Teams are being picked — this updates on its own in a few seconds.'
					}
				/>
			</SeasonShell>
		);
	}

	const squadSizes = lineup.teams.map(team => team.uids.length);
	const fixtures = getFixtures(lineup.teams.length);
	const fit = getScheduleFit(lineup.teams.length, lineup.settings.matchMinutes, season.slot.durationMinutes);

	return (
		<SeasonShell title='Teams' subtitle={subtitle} backHref={backHref}>
			<div className='space-y-6 p-4'>
				<section className='glass rounded-3xl p-5'>
					<div className='flex flex-wrap items-center gap-2'>
						<StatusPill tone='brand'>{describeSquads(squadSizes)}</StatusPill>
						<StatusPill tone='neutral'>
							{fit.matchCount} matches · {lineup.settings.matchMinutes} min
						</StatusPill>
					</div>

					<p className='text-muted mt-3 text-sm'>
						Picked automatically from who is in, and re-picked whenever somebody changes their answer.
					</p>

					{fit.overrunMinutes > 0 && (
						<p className='text-pending mt-3 flex items-start gap-1.5 text-sm'>
							<ExclamationTriangleIcon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
							<span>
								{fit.totalMinutes} minutes of football in a {fit.slotMinutes} minute slot — about{' '}
								{fit.overrunMinutes} over. Shorten the matches in season settings, or expect to run
								late.
							</span>
						</p>
					)}

					{isAdmin && (
						<Button
							variant='secondary'
							className='mt-4'
							onClick={async () => {
								await write(() => reshuffleTeams(seasonId, gameId), "Couldn't reshuffle the teams.");
							}}
						>
							<ArrowPathIcon className='size-4' aria-hidden='true' />
							Reshuffle
						</Button>
					)}
				</section>

				<div className='grid gap-4 sm:grid-cols-2'>
					{lineup.teams.map(team => (
						<TeamCard
							key={team.index}
							team={team}
							elos={lineup.elos}
							usersByUid={usersByUid}
							sideSize={Math.min(...squadSizes)}
							highlightUid={user?.uid}
						/>
					))}
				</div>

				<section className='glass rounded-3xl p-5'>
					<h2 className='text-ink mb-3 text-sm font-semibold'>Running order</h2>

					<ol className='space-y-2'>
						{fixtures.map(fixture => (
							<li key={fixture.order} className='flex items-center gap-3 text-sm'>
								<span className='text-faint w-5 shrink-0 tabular-nums'>{fixture.order + 1}</span>
								<span className='text-ink'>
									{teamName(fixture.teamA)} v {teamName(fixture.teamB)}
								</span>
								<span className='text-faint ml-auto text-xs'>
									{getSideSize(squadSizes[fixture.teamA], squadSizes[fixture.teamB])} a side
								</span>
							</li>
						))}
					</ol>
				</section>
			</div>
		</SeasonShell>
	);
};

export default TournamentPage;
