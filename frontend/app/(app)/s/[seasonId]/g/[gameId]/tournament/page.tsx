'use client';

import { use, useMemo } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, UsersIcon } from '@heroicons/react/24/outline';
import {
	AUTO_FINALISE_HOURS,
	describeSquads,
	getFixtures,
	getScheduleFit,
	getSideSize,
	MIN_TOURNAMENT_PLAYERS,
	selectPlayedMatches,
} from '@shared/tournament';
import { getStandings } from '@shared/standings';
import { formatGameDateLong, formatRelative } from '@shared/format';
import { useSeasonContext } from '../../../../../../../components/SeasonProvider';
import { useMatches, useTournamentResult, useTournamentTeams, useUsers } from '../../../../../../../hooks/useData';
import { useMyResponses } from '../../../../../../../hooks/useMyResponses';
import { useWrite } from '../../../../../../../hooks/useWrite';
import { useAuth } from '../../../../../../../lib/auth';
import {
	clearMatchScore,
	finaliseTournament,
	reshuffleTeams,
	setMatchScore,
} from '../../../../../../../lib/db/tournament';
import SeasonShell from '../../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../../components/Skeleton';
import EmptyState from '../../../../../../../components/EmptyState';
import Button from '../../../../../../../components/Button';
import StatusPill from '../../../../../../../components/StatusPill';
import TeamCard from '../../../../../../../components/TeamCard';
import MatchScore from '../../../../../../../components/MatchScore';
import StandingsTable from '../../../../../../../components/StandingsTable';

const TournamentPage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);
	const { season, games, loading, isAdmin } = useSeasonContext();
	const { teams: lineup, loading: teamsLoading } = useTournamentTeams(seasonId, gameId);
	const { matches } = useMatches(seasonId, gameId);
	const { result } = useTournamentResult(seasonId, gameId);
	const { users } = useUsers();
	const { myResponses } = useMyResponses();
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

	// Not everything under `matches/` belongs to this game — see
	// `selectPlayedMatches`. The screen has to agree with the function that
	// rates the game, or the table here would explain a set of ratings it
	// didn't produce.
	const playedMatches = selectPlayedMatches(lineup.teams.length, matches);

	const matchesByOrder = new Map(playedMatches.map(match => [match.order, match]));
	const played = playedMatches.length;

	// Once confirmed the table comes from the result document rather than being
	// recomputed, so a past game keeps reading the way it was decided even if
	// somebody later clears a score.
	const standings = result?.standings ?? getStandings(lineup.teams.length, playedMatches);
	const deltas = result ? new Map(result.changes.map(change => [change.uid, change.delta])) : undefined;

	// Anyone who answered the game can keep the score — that is the point, so
	// whoever has a free hand does it. Confirming the game closes it to
	// everyone but an admin, whose correction replays the ratings.
	const finalised = !!game.resultFinalisedAt;
	const canScore = (isAdmin || !!myResponses[gameId]) && (isAdmin || !finalised);

	// Only worth explaining when it is actually happening.
	const unequal = new Set(standings.map(row => row.played)).size > 1;

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
							deltas={deltas}
						/>
					))}
				</div>

				<section className='glass rounded-3xl p-5'>
					<div className='mb-3 flex items-baseline justify-between gap-2'>
						<h2 className='text-ink text-sm font-semibold'>Scoreboard</h2>
						{finalised && <StatusPill tone='neutral'>Confirmed</StatusPill>}
					</div>

					{!canScore && !finalised && (
						<p className='text-faint mb-3 text-xs'>Say you&apos;re in and you can keep the score too.</p>
					)}

					<ol className='space-y-2'>
						{fixtures.map(fixture => (
							<MatchScore
								key={fixture.order}
								fixture={fixture}
								match={matchesByOrder.get(fixture.order)}
								sideSize={getSideSize(squadSizes[fixture.teamA], squadSizes[fixture.teamB])}
								canScore={canScore}
								onScore={async (scoreA, scoreB) => {
									if (!user) return;

									await write(
										() => setMatchScore(seasonId, gameId, fixture, scoreA, scoreB, user.uid),
										"Couldn't save that score."
									);
								}}
								onClear={async () => {
									await write(
										() => clearMatchScore(seasonId, gameId, fixture.order),
										"Couldn't clear that score."
									);
								}}
							/>
						))}
					</ol>
				</section>

				{(played > 0 || finalised) && (
					<section className='glass rounded-3xl p-5'>
						<h2 className='text-ink mb-3 text-sm font-semibold'>Table</h2>
						<StandingsTable standings={standings} unequal={unequal} />

						{finalised ? (
							<p className='text-faint mt-4 text-xs'>
								Confirmed {formatRelative(game.resultFinalisedAt!)}. Ratings have been applied — a
								season admin correcting a score from here will work them out again.
							</p>
						) : (
							<>
								<p className='text-faint mt-4 text-xs'>
									Nothing counts towards anyone&apos;s rating until this is confirmed, which happens
									on its own {AUTO_FINALISE_HOURS} hours after kick-off.
								</p>

								{isAdmin && (
									<Button
										variant='primary'
										className='mt-3'
										onClick={async () => {
											await write(
												() => finaliseTournament(seasonId, gameId),
												"Couldn't confirm the results."
											);
										}}
									>
										<CheckCircleIcon className='size-4' aria-hidden='true' />
										Confirm results
									</Button>
								)}
							</>
						)}
					</section>
				)}
			</div>
		</SeasonShell>
	);
};

export default TournamentPage;
