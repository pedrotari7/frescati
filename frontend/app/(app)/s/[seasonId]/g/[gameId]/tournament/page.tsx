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
	getRoundLength,
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
import * as stylex from '@stylexjs/stylex';
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
import { useNow } from '../../../../../../../hooks/useNow';
import { useWrite } from '../../../../../../../hooks/useWrite';
import { useAuth } from '../../../../../../../lib/auth';
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
import { useConfirm } from '../../../../../../../components/ConfirmDialog';
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
import { bp, colors, tint } from '../../../../../../tokens.stylex';
import { surfaces, utils } from '../../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	card: { borderRadius: 24, padding: 20 },

	pills: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },

	/* An icon and a sentence about it, the icon holding its line at the top
	   rather than centring against three wrapped lines of text. */
	noteRow: {
		color: colors.muted,
		marginTop: 12,
		display: 'flex',
		alignItems: 'flex-start',
		gap: 6,
		fontSize: 14,
		lineHeight: '20px',
	},
	warnRow: {
		color: colors.pending,
		marginTop: 12,
		display: 'flex',
		alignItems: 'flex-start',
		gap: 6,
		fontSize: 14,
		lineHeight: '20px',
	},
	noteIcon: { marginTop: 2, width: 16, height: 16, flexShrink: 0 },
	note: { color: colors.muted, marginTop: 12, fontSize: 14, lineHeight: '20px' },
	hint: { color: colors.faint, marginTop: 8, fontSize: 12, lineHeight: '16px' },
	buttonIcon: { width: 16, height: 16 },
	reshuffle: { marginTop: 16 },
	confirm: { marginTop: 12 },

	/* One column on a phone, two from 640px. Four squads side by side would put
	   a seven-name list in a 160px column; two of them is the widest a card can
	   be read at, and it is what the roster on the game screen does too. */
	cards: { display: 'grid', gap: 16, gridTemplateColumns: { default: null, [bp.sm]: 'repeat(2, minmax(0, 1fr))' } },

	head: { marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
	headIcon: { color: colors.pending, width: 16, height: 16, flexShrink: 0 },
	title: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	titleGap: { color: colors.ink, marginBottom: 12, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	lead: { color: colors.faint, marginBottom: 12, fontSize: 12, lineHeight: '16px' },
	tableNote: { color: colors.faint, marginTop: 16, fontSize: 12, lineHeight: '16px' },

	/* `divide-y divide-white/5`, hung off the row: StyleX has no sibling
	   selector to put it on the list. */
	person: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 8,
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
	},
	personName: {
		color: colors.ink,
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
	},

	scoreHead: { marginBottom: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
	fixtures: { display: 'flex', flexDirection: 'column', gap: 8 },

	/*
	 * The label over each round of matches.
	 *
	 * The 8px above the rule is the list's own gap now, where Tailwind wrote it
	 * as an `mt-2` that landed on the same property as its `space-y-2` and
	 * resolved to the same 8px either way. Setting it again here would stack on
	 * top of the gap and open the break to 16.
	 */
	round: {
		color: colors.faint,
		paddingInline: 4,
		paddingBottom: 4,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},
	roundBreak: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: tint.white8, paddingTop: 16 },
});

const TournamentPage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);
	const { user } = useAuth();
	const { season, games, myResponses, loading, error, retry, isAdmin, isSeasonAdmin } = useSeasonContext();
	const { teams: lineup, loading: teamsLoading } = useTournamentTeams(seasonId, gameId);
	const { matches, loading: matchesLoading } = useMatches(seasonId, gameId);
	const { result } = useTournamentResult(seasonId, gameId);
	const { motm } = useMotm(seasonId, gameId);
	const { vote } = useMyMotmVote(seasonId, gameId, user?.uid ?? null);
	const { voterUids } = useMotmVoters(seasonId, gameId);
	const { usersByUid } = useUsersByUid();
	const write = useWrite();
	const confirm = useConfirm();
	// The vote closes on a deadline, so the panel needs a clock that moves.
	// Anything off `new Date()` would keep offering the buttons for as long as
	// the page stayed open.
	const now = useNow();
	// Who is actually in, subscribed here rather than taken from `game.counts`:
	// the counters are a background trigger behind, and this is the list the
	// team sheet gets compared against.
	const { responses } = useResponses(seasonId, gameId);

	// Which player's move sheet is open. One at a time. This is a tap on a name
	// followed by a tap on a letter, not a mode the screen sits in.
	const [movingUid, setMovingUid] = useState<string | null>(null);

	// Which squad's letter is being changed. `null` rather than a boolean, since
	// the sheet is about one team and the swap is with whichever is picked.
	const [letteringIndex, setLetteringIndex] = useState<number | null>(null);

	// Whether a confirmed game's scoreboard has been deliberately opened up:
	// see `ScoreboardLock`, which is where the reasoning lives. On the screen
	// rather than on the game: it is about this visit, and it means nothing to
	// anybody else looking at the same game.
	const [correcting, setCorrecting] = useState(false);

	const game = games.find(candidate => candidate.id === gameId) ?? null;

	const backHref = `/s/${seasonId}/g/${gameId}`;

	// `matchesLoading` is in here for the same reason as the note below about a
	// missing lineup: a screen must not draw a real state it does not know yet.
	// A match with no document reads as `–` and that is the third state, never
	// played, as distinct from played nil-nil, but an outstanding subscription
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
							: 'Teams are being picked. This updates on its own in a few seconds.'
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

	// A round only means something once it bundles more than one match. Two
	// teams meet once a round, so every "round" would just repeat the match
	// count, and only worth flagging once the game actually plays a second one.
	const roundLength = getRoundLength(lineup.teams.length);
	const showRounds = roundLength > 1 && fixtures.length > roundLength;

	// Not everything under `matches/` belongs to this game: see
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

	// Anyone who answered the game can keep the score. That is the point, so
	// whoever has a free hand does it. Confirming the game closes it to everyone
	// but an admin, and closes it to a *tap* even for them: a correction replays
	// the ladder from here on, so `locked` is a scoreboard they have to open
	// first. `ScoreboardLock` is the door and holds the reasoning.
	const finalised = !!game.resultFinalisedAt;
	const access = getScoreAccess({ finalised, isAdmin, hasResponded: !!myResponses[gameId] });
	const canScore = access === 'open' || (access === 'locked' && correcting);

	// A score is recorded against a fixture: "match 1, team A v team B", so
	// re-picking the squads underneath one would leave the scoreboard describing
	// a game nobody played. The lineup is settled from the first score in, and
	// frozen outright once the game is confirmed, which `runTeamRebuild` enforces
	// on its side too.
	const lineupOpen = played === 0 && !finalised;

	// Not `isAdmin`, which is either kind of admin, and not `isSeasonAdmin`,
	// which is neither. Reshuffle is the one button here that asks for the
	// global claim, and the block that draws it says why.
	const isAppAdmin = user?.isAppAdmin === true;

	// The lineup is frozen once the ledger has been computed against it, which
	// `setPlayerTeam` refuses on its side too. This is about which buttons get
	// offered. Season admins rather than everyone `isAdmin` covers: an app admin
	// passing through somebody else's season has no standing to move their
	// players around.
	const canMovePlayers = isSeasonAdmin && !finalised;

	// The same window Reshuffle has, and for a stricter reason: a match document
	// stores the two team indices it was played between, so a swap underneath one
	// hands a scoreline to a squad that never played it. Once a score is in, who
	// kicks off has been decided anyway.
	const canChangeLetters = isSeasonAdmin && lineupOpen;

	const poolUids = sortResponses(responses.filter(response => response.status === 'in' && isConfirmed(response))).map(
		response => response.uid
	);

	// A hand-picked lineup stops being re-picked, which is the point of it, and
	// the price is that the sheet and the pool can drift apart in both
	// directions: somebody says In afterwards and lands on no team, or somebody
	// on a squad taps Out and stays on it. Neither is wrong, both are invisible,
	// and the app has stopped being the thing that would fix them. An automatic
	// lineup needs none of this said: a rebuild is already seconds away.
	// Reported no-shows. Not filtered out of the pool above: they said In and
	// were picked, and the sheet's job here is to say who was on which team and
	// which of them never turned up, not to rewrite the evening as though the
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
	// enforce too. Being an admin is not being on the pitch.
	const playedInThis = !!user && lineup.teams.some(team => team.uids.includes(user.uid));

	// Where the panel goes depends on whether it is a ballot or a record. While
	// the vote is open it is the only thing on the screen with a deadline, and
	// the notification that opened it lands here, so it goes first, above a
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

				// Tapping your own pick again takes it back. Abstaining is a
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
			<div {...stylex.props(styles.page)}>
				{voting && motmPanel}

				<section {...stylex.props(surfaces.glass, styles.card)}>
					<div {...stylex.props(styles.pills)}>
						<StatusPill tone='brand'>{describeSquads(squadSizes)}</StatusPill>
						<StatusPill tone='neutral'>
							{fit.matchCount} {fit.matchCount === 1 ? 'match' : 'matches'} · {fit.matchMinutes} min
						</StatusPill>
					</div>

					{lineup.edited ? (
						<p {...stylex.props(styles.noteRow)}>
							<PencilSquareIcon {...stylex.props(styles.noteIcon)} aria-hidden='true' />
							{/* The way back out of a pinned lineup is named only to the
							    people who have it. Everyone else gets the fact without a
							    button they will go looking for and not find. */}
							<span>
								Sorted out by {displayNameOf(usersByUid.get(lineup.edited.by))}{' '}
								{formatRelative(lineup.edited.at)}. These teams stay as they are now
								{isAppAdmin ? '. Reshuffle hands them back to the app.' : '.'}
							</span>
						</p>
					) : (
						<p {...stylex.props(styles.note)}>
							Picked automatically from who is in, and re-picked whenever somebody changes their answer.
						</p>
					)}

					{fit.overrunMinutes > 0 && (
						<p {...stylex.props(styles.warnRow)}>
							<ExclamationTriangleIcon {...stylex.props(styles.noteIcon)} aria-hidden='true' />
							<span>
								{fit.totalMinutes} minutes of football in a {fit.slotMinutes} minute slot, about{' '}
								{fit.overrunMinutes} over. Shorten the matches in season settings, or expect to run
								late.
							</span>
						</p>
					)}

					{/* App admins only, narrower than every other button on this screen,
					    and narrower than it used to be. Re-picking is free, instant and
					    leaves no mark, so a button in front of every season admin is one
					    that gets pulled again and again until the squads come out the way
					    somebody fancies, which is the one thing a seeded optimizer exists
					    to take out of anybody's hands. A season admin who genuinely needs a
					    different sheet still has `setPlayerTeam`, which moves the person
					    they mean and signs the lineup with their name.

					    The rules are untouched: a reshuffle is a bump of `reshuffleCount`
					    and stays a season-admin write, as every other field on the game
					    document is. This is about who is offered the button. */}
					{isAppAdmin && (
						<>
							<Button
								variant='secondary'
								sx={styles.reshuffle}
								disabled={!lineupOpen}
								onClick={async () => {
									// Asked about only when there is something to
									// throw away, which is the whole distinction the
									// button rests on. An automatic lineup is
									// re-picked every time somebody changes their
									// answer, so re-picking it deliberately costs
									// nothing and stays one tap: that is what
									// "free, instant and leaves no mark" above
									// means. A pinned one is an evening of somebody
									// else's planning, and this is the only button
									// that undoes it. The pinned-lineup note above
									// already names who, so the dialog does too.
									if (lineup.edited) {
										const ok = await confirm({
											title: 'Throw away the hand-picked teams?',
											message: `${displayNameOf(usersByUid.get(lineup.edited.by))} sorted these teams out by hand. Reshuffling hands them back to the app, which picks from who is in and re-picks whenever somebody changes their answer.`,
											// Never the word on the button that opened
											// it: "Reshuffle" twice on one screen
											// is a thing for a tap, and a test, to
											// pick the wrong one of. Same reason
											// `ScoreboardLock` answers "Correct a
											// score" with "Correct it".
											confirmLabel: 'Re-pick them',
											tone: 'danger',
										});

										if (!ok) return;
									}

									await write(
										() => reshuffleTeams(seasonId, gameId),
										"Couldn't reshuffle the teams."
									);
								}}
							>
								<ArrowPathIcon {...stylex.props(styles.buttonIcon)} aria-hidden='true' />
								Reshuffle
							</Button>

							{/* A greyed-out button with no reason beside it reads as a bug. */}
							{!lineupOpen && (
								<p {...stylex.props(styles.hint)}>
									{finalised
										? 'The lineup is frozen now the game is confirmed.'
										: 'Scores are in. Clear them to re-pick the teams.'}
								</p>
							)}
						</>
					)}
				</section>

				<div {...stylex.props(styles.cards)}>
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
					<section {...stylex.props(surfaces.glass, styles.card)}>
						<div {...stylex.props(styles.head)}>
							<HandRaisedIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
							<h2 {...stylex.props(styles.title)}>Not on the sheet</h2>
							<StatusPill tone='pending'>{unassigned.length}</StatusPill>
						</div>

						<p {...stylex.props(styles.lead)}>
							In for this game, but on no team. The app stopped picking when the teams were sorted out by
							hand.
						</p>

						<ul>
							{unassigned.map(uid => {
								const player = usersByUid.get(uid);

								return (
									<li key={uid} {...stylex.props(styles.person)}>
										<Avatar
											displayName={displayNameOf(player)}
											photoURL={player?.photoURL}
											size='sm'
										/>
										<span {...stylex.props(styles.personName, utils.truncate)}>
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

				<section {...stylex.props(surfaces.glass, styles.card)}>
					<div {...stylex.props(styles.scoreHead)}>
						<h2 {...stylex.props(styles.title)}>Scoreboard</h2>
						{finalised && <StatusPill tone='neutral'>Confirmed</StatusPill>}
					</div>

					{access === 'none' && !finalised && (
						<p {...stylex.props(styles.lead)}>Say you&apos;re in and you can keep the score too.</p>
					)}

					{access === 'locked' && <ScoreboardLock correcting={correcting} onChange={setCorrecting} />}

					<ol {...stylex.props(styles.fixtures)}>
						{fixtures.map(fixture => (
							<Fragment key={fixture.order}>
								{showRounds && fixture.order % roundLength === 0 && (
									<li {...stylex.props(styles.round, fixture.order > 0 && styles.roundBreak)}>
										Round {fixture.order / roundLength + 1}
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
					<section {...stylex.props(surfaces.glass, styles.card)}>
						<h2 {...stylex.props(styles.titleGap)}>Table</h2>
						<StandingsTable standings={standings} unequal={unequal} />

						{/* Said on the screen the table is on, because this is where
						    somebody works out why their rating moved the way it did,
						    and the answer stopped being "we came second" in Aug 2026. */}
						<p {...stylex.props(styles.tableNote)}>
							Ratings read how much of the evening each team won, not just where it finished, so two teams
							that end up level move almost together, and the team that wins the table always moves
							further.
						</p>

						{finalised ? (
							<p {...stylex.props(styles.hint)}>
								Confirmed {formatRelative(game.resultFinalisedAt!)}. Ratings have been applied. A season
								admin correcting a score from here will work them out again.
							</p>
						) : (
							<>
								<p {...stylex.props(styles.hint)}>
									Nothing counts towards anyone&apos;s rating until this is confirmed, which happens
									on its own {AUTO_FINALISE_HOURS} hours after kick-off.
								</p>

								{/* The one tap on this screen that reaches everybody.
								    It applies ratings, opens the vote and notifies
								    the lineup, and freezes the sheet the ledger was
								    computed against, and it sits directly under a
								    table an admin came here to read, which is where
								    a scrolling thumb ends up. `ScoreboardLock`
								    already asks before *undoing* this; asking here
								    too is the other half of the same trade, since
								    this is the tap that makes the undo cost a
								    replay. */}
								{isAdmin && (
									<Button
										variant='primary'
										sx={styles.confirm}
										onClick={async () => {
											const ok = await confirm({
												title: 'Confirm the results?',
												message:
													'Ratings are worked out and applied to everybody who played, the man-of-the-match vote opens and the lineup is notified. Correcting a score after this works the ratings out again: for this game, and for every game played since.',
												confirmLabel: 'Confirm it',
											});

											if (!ok) return;

											await write(
												() => finaliseTournament(seasonId, gameId),
												"Couldn't confirm the results."
											);
										}}
									>
										<CheckCircleIcon {...stylex.props(styles.buttonIcon)} aria-hidden='true' />
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
