'use client';

import { Fragment, use, useState } from 'react';
import {
	ArrowPathIcon,
	CheckCircleIcon,
	ExclamationTriangleIcon,
	HandRaisedIcon,
	PencilSquareIcon,
	UsersIcon,
} from '@heroicons/react/24/outline';
import {
	AUTO_FINALISE_HOURS,
	describeSquads,
	getFixtures,
	getLapLength,
	getScheduleFit,
	getScoreAccess,
	getSideSize,
	MAX_SIDE,
	MIN_TOURNAMENT_PLAYERS,
	selectPlayedMatches,
} from '@shared/tournament';
import { findTeamIndex, getUnassigned } from '@shared/lineup';
import { getAbsentUids, isConfirmed, sortResponses } from '@shared/game';
import { getStandings } from '@shared/standings';
import { formatGameDateLong, formatRelative } from '@shared/format';
import { isMotmVotingOpen } from '@shared/motm';
import { useSeasonContext } from '../../../../../../../components/SeasonProvider';
import {
	useMatches,
	useMotm,
	useMotmVoters,
	useMyMotmVote,
	useResponses,
	useTournamentResult,
	useTournamentTeams,
	useUsersByUid,
} from '../../../../../../../hooks/useData';
import { useMyResponses } from '../../../../../../../hooks/useMyResponses';
import { useNow } from '../../../../../../../hooks/useNow';
import { useWrite } from '../../../../../../../hooks/useWrite';
import { useAuth } from '../../../../../../../lib/auth';
import { classNames } from '../../../../../../../lib/utils/reactHelper';
import { clearMotmVote, setMotmVote } from '../../../../../../../lib/db/motm';
import {
	clearMatchScore,
	finaliseTournament,
	reshuffleTeams,
	setMatchScore,
	setPlayerTeam,
	setTeamLetter,
} from '../../../../../../../lib/db/tournament';
import { displayNameOf } from '../../../../../../../lib/people';
import MotmPanel from '../../../../../../../components/MotmPanel';
import PlayerTeamSheet from '../../../../../../../components/PlayerTeamSheet';
import TeamLetterSheet from '../../../../../../../components/TeamLetterSheet';
import SeasonShell from '../../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../../components/Skeleton';
import EmptyState from '../../../../../../../components/EmptyState';
import LoadFailed from '../../../../../../../components/LoadFailed';
import Button from '../../../../../../../components/Button';
import StatusPill from '../../../../../../../components/StatusPill';
import Avatar from '../../../../../../../components/Avatar';
import TeamCard from '../../../../../../../components/TeamCard';
import MatchScore from '../../../../../../../components/MatchScore';
import ScoreboardLock from '../../../../../../../components/ScoreboardLock';
import StandingsTable from '../../../../../../../components/StandingsTable';

const TournamentPage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);
	const { user } = useAuth();
	const { season, games, loading, error, retry, isAdmin, isSeasonAdmin } = useSeasonContext();
	const { teams: lineup, loading: teamsLoading } = useTournamentTeams(seasonId, gameId);
	const { matches, loading: matchesLoading } = useMatches(seasonId, gameId);
	const { result } = useTournamentResult(seasonId, gameId);
	const { motm } = useMotm(seasonId, gameId);
	const { vote } = useMyMotmVote(seasonId, gameId, user?.uid ?? null);
	const { voterUids } = useMotmVoters(seasonId, gameId);
	const { usersByUid } = useUsersByUid();
	const { myResponses } = useMyResponses();
	const write = useWrite();
	// The vote closes on a deadline, so the panel needs a clock that moves —
	// anything off `new Date()` would keep offering the buttons for as long as
	// the page stayed open.
	const now = useNow();
	// Who is actually in, subscribed here rather than taken from `game.counts`:
	// the counters are a background trigger behind, and this is the list the
	// team sheet gets compared against.
	const { responses } = useResponses(seasonId, gameId);

	// Which player's move sheet is open. One at a time — this is a tap on a name
	// followed by a tap on a letter, not a mode the screen sits in.
	const [movingUid, setMovingUid] = useState<string | null>(null);

	// Which squad's letter is being changed. `null` rather than a boolean, since
	// the sheet is about one team and the swap is with whichever is picked.
	const [letteringIndex, setLetteringIndex] = useState<number | null>(null);

	// Whether a confirmed game's scoreboard has been deliberately opened up —
	// see `ScoreboardLock`, which is where the reasoning lives. On the screen
	// rather than on the game: it is about this visit, and it means nothing to
	// anybody else looking at the same game.
	const [correcting, setCorrecting] = useState(false);

	const game = games.find(candidate => candidate.id === gameId) ?? null;

	const backHref = `/s/${seasonId}/g/${gameId}`;

	// `matchesLoading` is in here for the same reason as the note below about a
	// missing lineup: a screen must not draw a real state it does not know yet.
	// A match with no document reads as `–` and that is the third state — never
	// played, as distinct from played nil-nil — but an outstanding subscription
	// renders `–` too, so without this a 5–3 game came up as `– –` and snapped
	// to the score a moment later. Wrong on the one screen whose whole job is
	// the scoreline, and wrong in the specific way that makes the number
	// unreadable: anything reading it, a person or a test, cannot tell "nobody
	// played this" from "ask again in a moment".
	if (loading || teamsLoading || matchesLoading) {
		return (
			<SeasonShell title='Teams' backHref={backHref}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Teams' backHref={backHref}>
				<LoadFailed what='the teams' onRetry={retry} />
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
	// A team card isn't being read against any one fixture, so it shows the side
	// its squad is sure of: the smallest anybody plays, and never more than the
	// pitch holds. Everyone past that is a sub, which is what the card says.
	const pitchSide = Math.min(...squadSizes, MAX_SIDE);
	const fixtures = getFixtures(lineup.teams.length, lineup.settings.matchMinutes, season.slot.durationMinutes);
	const fit = getScheduleFit(lineup.teams.length, lineup.settings.matchMinutes, season.slot.durationMinutes);

	// A round only means something once it bundles more than one match — a
	// two-team lap is always a single fixture, so every "round" would just
	// repeat the match count — and only worth flagging once the game actually
	// plays a second one.
	const lapLength = getLapLength(lineup.teams.length);
	const showRounds = lapLength > 1 && fixtures.length > lapLength;

	// Not everything under `matches/` belongs to this game — see
	// `selectPlayedMatches`. The screen has to agree with the function that
	// rates the game, or the table here would explain a set of ratings it
	// didn't produce.
	const playedMatches = selectPlayedMatches(
		lineup.teams.length,
		lineup.settings.matchMinutes,
		season.slot.durationMinutes,
		matches
	);

	const matchesByOrder = new Map(playedMatches.map(match => [match.order, match]));
	const played = playedMatches.length;

	// Once confirmed the table comes from the result document rather than being
	// recomputed, so a past game keeps reading the way it was decided even if
	// somebody later clears a score.
	const standings = result?.standings ?? getStandings(lineup.teams.length, playedMatches);
	const deltas = result ? new Map(result.changes.map(change => [change.uid, change.delta])) : undefined;

	// Anyone who answered the game can keep the score — that is the point, so
	// whoever has a free hand does it. Confirming the game closes it to everyone
	// but an admin, and closes it to a *tap* even for them: a correction replays
	// the ladder from here on, so `locked` is a scoreboard they have to open
	// first. `ScoreboardLock` is the door and holds the reasoning.
	const finalised = !!game.resultFinalisedAt;
	const access = getScoreAccess({ finalised, isAdmin, hasResponded: !!myResponses[gameId] });
	const canScore = access === 'open' || (access === 'locked' && correcting);

	// A score is recorded against a fixture — "match 1, team A v team B" — so
	// re-picking the squads underneath one would leave the scoreboard describing
	// a game nobody played. The lineup is settled from the first score in, and
	// frozen outright once the game is confirmed, which `runTeamRebuild` enforces
	// on its side too.
	const canReshuffle = played === 0 && !finalised;

	// The lineup is frozen once the ledger has been computed against it, which
	// `setPlayerTeam` refuses on its side too — this is about which buttons get
	// offered. Season admins rather than everyone `isAdmin` covers, for the same
	// reason Reshuffle is: an app admin passing through somebody else's season
	// has no standing to re-pick their teams.
	const canMovePlayers = isSeasonAdmin && !finalised;

	// The same window Reshuffle has, for a stricter version of the same reason: a
	// match document stores the two team indices it was played between, so a swap
	// underneath one hands a scoreline to a squad that never played it. Once a
	// score is in, who kicks off has been decided anyway.
	const canChangeLetters = isSeasonAdmin && canReshuffle;

	const poolUids = sortResponses(responses.filter(response => response.status === 'in' && isConfirmed(response))).map(
		response => response.uid
	);

	// A hand-picked lineup stops being re-picked, which is the point of it — and
	// the price is that the sheet and the pool can drift apart in both
	// directions: somebody says In afterwards and lands on no team, or somebody
	// on a squad taps Out and stays on it. Neither is wrong, both are invisible,
	// and the app has stopped being the thing that would fix them. An automatic
	// lineup needs none of this said: a rebuild is already seconds away.
	// Reported no-shows. Not filtered out of the pool above: they said In and
	// were picked, and the sheet's job here is to say who was on which team and
	// which of them never turned up — not to rewrite the evening as though the
	// squads had been picked without them. Moving somebody off the sheet is a
	// separate decision, and the button for it is right there.
	const absentUids = new Set(getAbsentUids(responses));

	const inThePool = new Set(poolUids);
	const unassigned = lineup.edited ? getUnassigned(lineup.teams, poolUids) : [];
	const notPlaying = lineup.edited
		? new Set(lineup.teams.flatMap(team => team.uids).filter(uid => !inThePool.has(uid)))
		: undefined;

	// Only worth explaining when it is actually happening.
	const unequal = new Set(standings.map(row => row.played)).size > 1;

	// Only the people on the team sheet get a vote, which is what the rules
	// enforce too — being an admin is not being on the pitch.
	const playedInThis = !!user && lineup.teams.some(team => team.uids.includes(user.uid));

	// Where the panel goes depends on whether it is a ballot or a record. While
	// the vote is open it is the only thing on the screen with a deadline, and
	// the notification that opened it lands here — so it goes first, above a
	// lineup and a scoreboard that are both already settled. Once it is decided
	// it drops back to sitting with the table, which is the other thing the
	// evening produced. Drawn once either way: the panel returns nothing at all
	// until there is a vote to hold or a result to report.
	const motmPanel = (
		<MotmPanel
			teams={lineup.teams}
			usersByUid={usersByUid}
			motm={motm}
			vote={vote}
			voterUids={voterUids}
			votingUntil={game.motmVotingUntilMillis}
			now={now}
			canVote={playedInThis}
			onVote={async uid => {
				if (!user) return;

				// Tapping your own pick again takes it back — abstaining is a
				// real position, and there is nowhere else to express it.
				await write(
					() =>
						vote?.votedFor === uid
							? clearMotmVote(seasonId, gameId, user.uid)
							: setMotmVote(seasonId, gameId, user.uid, uid),
					"Couldn't save your vote."
				);
			}}
		/>
	);

	const voting = isMotmVotingOpen(game.motmVotingUntilMillis, now.getTime());

	return (
		<SeasonShell title='Teams' subtitle={subtitle} backHref={backHref}>
			<div className='space-y-6 p-4'>
				{voting && motmPanel}

				<section className='glass rounded-3xl p-5'>
					<div className='flex flex-wrap items-center gap-2'>
						<StatusPill tone='brand'>{describeSquads(squadSizes)}</StatusPill>
						<StatusPill tone='neutral'>
							{fit.matchCount} {fit.matchCount === 1 ? 'match' : 'matches'} · {fit.matchMinutes} min
						</StatusPill>
					</div>

					{lineup.edited ? (
						<p className='text-muted mt-3 flex items-start gap-1.5 text-sm'>
							<PencilSquareIcon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
							<span>
								Sorted out by {displayNameOf(usersByUid.get(lineup.edited.by))}{' '}
								{formatRelative(lineup.edited.at)}. These teams stay as they are now — Reshuffle hands
								them back to the app.
							</span>
						</p>
					) : (
						<p className='text-muted mt-3 text-sm'>
							Picked automatically from who is in, and re-picked whenever somebody changes their answer.
						</p>
					)}

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

					{/* Season admins only, rather than everyone `isAdmin` covers: re-picking
					    a lineup is a decision about one group's game, and an app admin
					    passing through a season they don't run has no standing to make it.
					    The rules still let them — `isSeasonAdmin` there includes app admins,
					    as it does everywhere — so this is about who is offered the button. */}
					{isSeasonAdmin && (
						<>
							<Button
								variant='secondary'
								className='mt-4'
								disabled={!canReshuffle}
								onClick={async () => {
									await write(
										() => reshuffleTeams(seasonId, gameId),
										"Couldn't reshuffle the teams."
									);
								}}
							>
								<ArrowPathIcon className='size-4' aria-hidden='true' />
								Reshuffle
							</Button>

							{/* A greyed-out button with no reason beside it reads as a bug. */}
							{!canReshuffle && (
								<p className='text-faint mt-2 text-xs'>
									{finalised
										? 'The lineup is frozen now the game is confirmed.'
										: 'Scores are in — clear them to re-pick the teams.'}
								</p>
							)}
						</>
					)}
				</section>

				<div className='grid gap-4 sm:grid-cols-2'>
					{lineup.teams.map(team => (
						<TeamCard
							key={team.index}
							team={team}
							elos={lineup.elos}
							usersByUid={usersByUid}
							sideSize={pitchSide}
							highlightUid={user?.uid}
							deltas={deltas}
							notPlaying={notPlaying}
							absentUids={absentUids}
							onMovePlayer={canMovePlayers ? setMovingUid : undefined}
							onChangeLetter={canChangeLetters ? () => setLetteringIndex(team.index) : undefined}
						/>
					))}
				</div>

				{/* Only reachable once somebody has picked the teams by hand, which is
				    also the moment nothing else is going to notice. Shown to everybody
				    rather than to admins alone: a player looking for their own name on
				    four cards and not finding it deserves the explanation, even though
				    only an admin can do anything about it. */}
				{unassigned.length > 0 && (
					<section className='glass rounded-3xl p-5'>
						<div className='mb-1 flex items-center gap-2'>
							<HandRaisedIcon className='text-pending size-4 shrink-0' aria-hidden='true' />
							<h2 className='text-ink text-sm font-semibold'>Not on the sheet</h2>
							<StatusPill tone='pending'>{unassigned.length}</StatusPill>
						</div>

						<p className='text-faint mb-3 text-xs'>
							In for this game, but on no team — the app stopped picking when the teams were sorted out by
							hand.
						</p>

						<ul className='divide-y divide-white/5'>
							{unassigned.map(uid => {
								const player = usersByUid.get(uid);

								return (
									<li key={uid} className='flex items-center gap-3 py-2'>
										<Avatar
											displayName={displayNameOf(player)}
											photoURL={player?.photoURL}
											size='sm'
										/>
										<span className='text-ink min-w-0 flex-1 truncate text-sm'>
											{displayNameOf(player)}
										</span>
										{canMovePlayers && (
											<Button size='sm' variant='ghost' onClick={() => setMovingUid(uid)}>
												Give a team
											</Button>
										)}
									</li>
								);
							})}
						</ul>
					</section>
				)}

				<section className='glass rounded-3xl p-5'>
					<div className='mb-3 flex items-baseline justify-between gap-2'>
						<h2 className='text-ink text-sm font-semibold'>Scoreboard</h2>
						{finalised && <StatusPill tone='neutral'>Confirmed</StatusPill>}
					</div>

					{access === 'none' && !finalised && (
						<p className='text-faint mb-3 text-xs'>Say you&apos;re in and you can keep the score too.</p>
					)}

					{access === 'locked' && <ScoreboardLock correcting={correcting} onChange={setCorrecting} />}

					<ol className='space-y-2'>
						{fixtures.map(fixture => (
							<Fragment key={fixture.order}>
								{showRounds && fixture.order % lapLength === 0 && (
									<li
										className={classNames(
											'text-faint px-1 pb-1 text-xs font-semibold tracking-wider uppercase',
											fixture.order > 0 && 'mt-2 border-t border-white/8 pt-4'
										)}
									>
										Round {fixture.order / lapLength + 1}
									</li>
								)}

								<MatchScore
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
							</Fragment>
						))}
					</ol>
				</section>

				{/* Above the table on purpose: the winner is the part of the
				    evening the table can't show. */}
				{!voting && motmPanel}

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

				{letteringIndex !== null && (
					<TeamLetterSheet
						team={lineup.teams[letteringIndex] ?? null}
						teams={lineup.teams}
						usersByUid={usersByUid}
						open
						onClose={() => setLetteringIndex(null)}
						onSwap={async withIndex => {
							await write(
								() => setTeamLetter(seasonId, gameId, letteringIndex, withIndex),
								"Couldn't swap those teams over."
							);
						}}
					/>
				)}

				{movingUid && (
					<PlayerTeamSheet
						displayName={displayNameOf(usersByUid.get(movingUid))}
						teams={lineup.teams}
						currentIndex={findTeamIndex(lineup.teams, movingUid)}
						open
						onClose={() => setMovingUid(null)}
						onMove={async teamIndex => {
							await write(
								() => setPlayerTeam(seasonId, gameId, movingUid, teamIndex),
								"Couldn't move them."
							);
						}}
					/>
				)}
			</div>
		</SeasonShell>
	);
};

export default TournamentPage;
