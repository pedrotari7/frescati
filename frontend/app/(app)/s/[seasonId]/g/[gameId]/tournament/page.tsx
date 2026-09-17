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
import type {
	AppUser,
	Game,
	GameResponse,
	Season,
	TeamStanding,
	TournamentMatch,
	TournamentTeams,
} from '@shared/types';
import type { Fixture } from '@shared/tournament';
import { findTeamIndex, getUnassigned } from '@shared/lineup';
import { getAbsentUids, isConfirmed, sortResponses } from '@shared/game';
import { feesFor, planGameDues } from '@shared/finances';
import { getStandings } from '@shared/standings';
import { formatGameDateLong, formatRelative, formatSek } from '@shared/format';
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
import { animations, surfaces, utils } from '../../../../../../../lib/styles';

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

/*
 * The squads come out one after another rather than all at once, which is the
 * one place in the app where a stagger says something true: they were dealt.
 * It runs again on a reshuffle, because that is the same event a second time.
 *
 * A dynamic style rather than four named ones, for the reason `HeadcountBar`
 * has one: this is a genuinely per-element value, and `stylex.props` has to be
 * what writes the `style` attribute. A second one spread beside it would win or
 * lose on whatever order the props happened to be in.
 *
 * 70ms, and no more. Four cards is 210ms on the last one, which reads as a deal
 * rather than as a queue. `MAX_TEAMS` is 4, so that is the whole cost.
 */
const deal = stylex.create({
	delay: (index: number) => ({ animationDelay: `${index * 70}ms` }),
});

/** The evening this screen is about, once it is known to exist. */
interface Evening {
	seasonId: string;
	gameId: string;
	season: Season;
	game: Game;
	lineup: TournamentTeams;
	usersByUid: Map<string, AppUser>;
}

/** What may be done, and by whom. */
interface Powers {
	uid: string | null;
	isAdmin: boolean;
	isAppAdmin: boolean;
	movePlayers: boolean;
	changeLetters: boolean;
	score: boolean;
	lineupOpen: boolean;
	finalised: boolean;
	access: ReturnType<typeof getScoreAccess>;
}

/** The fixture list, and everything read off the squad sizes. */
interface Schedule {
	fixtures: Fixture[];
	squadSizes: number[];
	pitchSide: number;
	roundLength: number;
	showRounds: boolean;
	fit: ReturnType<typeof getScheduleFit>;
	matchesByOrder: Map<number, TournamentMatch>;
	played: number;
}

/** How it finished, what that did to the ratings, and what confirming costs. */
interface Outcome {
	standings: TeamStanding[];
	deltas: Map<string, number> | undefined;
	unequal: boolean;
	chargeNote: string;
}

/** Who was on the sheet, and which of them is not playing after all. */
interface OnTheSheet {
	unassigned: string[];
	notPlaying: Set<string> | undefined;
	absentUids: Set<string>;
}

/**
 * The fixture list and the shape of the evening, read off the lineup.
 *
 * A team card is not being read against any one fixture, so `pitchSide` is the
 * side its squad is sure of: the smallest anybody plays, and never more than the
 * pitch holds. Everyone past that is a sub, which is what the card says.
 *
 * A round only means something once it bundles more than one match. Two teams
 * meet once a round, so every "round" would just repeat the match count, and it
 * is only worth flagging once the game actually plays a second one.
 *
 * Not everything under `matches/` belongs to this game: see
 * `selectPlayedMatches`. The screen has to agree with the function that rates
 * the game, or the table here would explain a set of ratings it did not produce.
 */
const readSchedule = (season: Season, lineup: TournamentTeams, matches: TournamentMatch[]): Schedule => {
	const teamCount = lineup.teams.length;
	const squadSizes = lineup.teams.map(team => team.uids.length);
	const { matchMinutes } = lineup.settings;
	const slot = season.slot.durationMinutes;

	const fixtures = getFixtures(teamCount, matchMinutes, slot);
	const roundLength = getRoundLength(teamCount);
	const playedMatches = selectPlayedMatches(teamCount, matchMinutes, slot, matches);

	return {
		fixtures,
		squadSizes,
		pitchSide: Math.min(...squadSizes, MAX_SIDE),
		roundLength,
		showRounds: roundLength > 1 && fixtures.length > roundLength,
		fit: getScheduleFit(teamCount, matchMinutes, slot),
		matchesByOrder: new Map(playedMatches.map(match => [match.order, match])),
		played: playedMatches.length,
	};
};

/**
 * What the table says, and what confirming would cost the extras.
 *
 * Once confirmed the table comes from the result document rather than being
 * recomputed, so a past game keeps reading the way it was decided even if
 * somebody later clears a score.
 *
 * The charge note is one sentence or none. Every charge is the same season fee,
 * so one amount says the whole of it, and the count is what an admin reads to
 * recognise the game they are about to bill. It comes off the same function the
 * callable raises the charges with, so the dialog cannot promise a different
 * number from the one that lands, and it is named only when there is something
 * to name: a season with no per-game fee, or a game the whole squad turned out
 * for, charges nobody.
 */
const readOutcome = (
	season: Season,
	gameId: string,
	lineup: TournamentTeams,
	schedule: Schedule,
	result: { standings: TeamStanding[]; changes: { uid: string; delta: number }[] } | null,
	responses: GameResponse[]
): Outcome => {
	const playedMatches = [...schedule.matchesByOrder.values()];
	const standings = result?.standings ?? getStandings(lineup.teams.length, playedMatches);
	const extraCharges = planGameDues(feesFor(season), gameId, responses);

	return {
		standings,
		deltas: result ? new Map(result.changes.map(change => [change.uid, change.delta])) : undefined,
		// Only worth explaining when it is actually happening.
		unequal: new Set(standings.map(row => row.played)).size > 1,
		chargeNote:
			extraCharges.length > 0
				? ` The ${
						extraCharges.length === 1
							? 'extra who played is'
							: `${extraCharges.length} extras who played are`
					} charged ${formatSek(extraCharges[0].amount)}, and can pay as soon as this lands.`
				: '',
	};
};

/**
 * Who was picked, and how the sheet and the pool have drifted apart.
 *
 * A hand-picked lineup stops being re-picked, which is the point of it, and the
 * price is that the two can drift in both directions: somebody says In
 * afterwards and lands on no team, or somebody on a squad taps Out and stays on
 * it. Neither is wrong, both are invisible, and the app has stopped being the
 * thing that would fix them. An automatic lineup needs none of this said, since
 * a rebuild is already seconds away.
 *
 * Reported no-shows are not filtered out of the pool: they said In and were
 * picked, and the sheet's job is to say who was on which team and which of them
 * never turned up, not to rewrite the evening as though the squads had been
 * picked without them. Moving somebody off the sheet is a separate decision,
 * and the button for it is right there.
 */
const readSheet = (lineup: TournamentTeams, responses: GameResponse[]): OnTheSheet => {
	const poolUids = sortResponses(responses.filter(response => response.status === 'in' && isConfirmed(response))).map(
		response => response.uid
	);
	const inThePool = new Set(poolUids);

	return {
		unassigned: lineup.edited ? getUnassigned(lineup.teams, poolUids) : [],
		notPlaying: lineup.edited
			? new Set(lineup.teams.flatMap(team => team.uids).filter(uid => !inThePool.has(uid)))
			: undefined,
		absentUids: new Set(getAbsentUids(responses)),
	};
};

/** Why there is no team sheet to show, drawn as the screen. */
const NoTeams = ({
	reason,
	backHref,
	onRetry,
}: {
	reason: 'loading' | 'error' | 'missing';
	backHref: string;
	onRetry: () => void;
}) => (
	<SeasonShell title='Teams' backHref={backHref}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='the teams' onRetry={onRetry} />}
		{reason === 'missing' && (
			<EmptyState title='Game not found' message='It may have been deleted from the calendar.' />
		)}
	</SeasonShell>
);

/**
 * No lineup means the pool is still short of a tournament.
 *
 * The function clears the document rather than leaving a stale sheet up, so this
 * is the honest state rather than a loading gap.
 */
const NoLineup = ({ playing, subtitle, backHref }: { playing: number; subtitle: string; backHref: string }) => {
	const shortBy = MIN_TOURNAMENT_PLAYERS - playing;

	return (
		<SeasonShell title='Teams' subtitle={subtitle} backHref={backHref}>
			<EmptyState
				icon={<UsersIcon />}
				title='No teams yet'
				message={
					shortBy > 0
						? `${playing} playing so far. Teams appear at ${MIN_TOURNAMENT_PLAYERS}, so ${shortBy} more to go.`
						: 'Teams are being picked. This updates on its own in a few seconds.'
				}
			/>
		</SeasonShell>
	);
};

/**
 * The squads, how they were picked, and the one button that picks them again.
 *
 * Reshuffle is app admins only, narrower than every other button on this screen
 * and narrower than it used to be. Re-picking is free, instant and leaves no
 * mark, so a button in front of every season admin is one that gets pulled again
 * and again until the squads come out the way somebody fancies, which is the one
 * thing a seeded optimizer exists to take out of anybody's hands. A season admin
 * who genuinely needs a different sheet still has `setPlayerTeam`, which moves
 * the person they mean and signs the lineup with their name.
 *
 * The rules are untouched: a reshuffle is a bump of `reshuffleCount` and stays a
 * season-admin write, as every other field on the game document is. This is
 * about who is offered the button.
 */
const LineupCard = ({
	evening,
	powers,
	schedule,
	onReshuffle,
}: {
	evening: Evening;
	powers: Powers;
	schedule: Schedule;
	onReshuffle: () => void;
}) => {
	const { lineup, usersByUid } = evening;
	const { fit } = schedule;

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.pills)}>
				<StatusPill tone='brand'>{describeSquads(schedule.squadSizes)}</StatusPill>
				<StatusPill tone='neutral'>
					{fit.matchCount} {fit.matchCount === 1 ? 'match' : 'matches'} · {fit.matchMinutes} min
				</StatusPill>
			</div>

			{lineup.edited ? (
				<p {...stylex.props(styles.noteRow)}>
					<PencilSquareIcon {...stylex.props(styles.noteIcon)} aria-hidden='true' />
					{/* The way back out of a pinned lineup is named only to the people who
					    have it. Everyone else gets the fact without a button they will go
					    looking for and not find. */}
					<span>
						Sorted out by {displayNameOf(usersByUid.get(lineup.edited.by))}{' '}
						{formatRelative(lineup.edited.at)}. These teams stay as they are now
						{powers.isAppAdmin ? '. Reshuffle hands them back to the app.' : '.'}
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
						{fit.overrunMinutes} over. Shorten the matches in season settings, or expect to run late.
					</span>
				</p>
			)}

			{powers.isAppAdmin && (
				<>
					<Button
						variant='secondary'
						sx={styles.reshuffle}
						disabled={!powers.lineupOpen}
						onClick={onReshuffle}
					>
						<ArrowPathIcon {...stylex.props(styles.buttonIcon)} aria-hidden='true' />
						Reshuffle
					</Button>

					{/* A greyed-out button with no reason beside it reads as a bug. */}
					{!powers.lineupOpen && (
						<p {...stylex.props(styles.hint)}>
							{powers.finalised
								? 'The lineup is frozen now the game is confirmed.'
								: 'Scores are in. Clear them to re-pick the teams.'}
						</p>
					)}
				</>
			)}
		</section>
	);
};

/** One card per squad, dealt in. */
const TeamCards = ({
	evening,
	powers,
	schedule,
	sheet,
	deltas,
	onMove,
	onLetter,
}: {
	evening: Evening;
	powers: Powers;
	schedule: Schedule;
	sheet: OnTheSheet;
	deltas: Map<string, number> | undefined;
	onMove: (uid: string) => void;
	onLetter: (index: number) => void;
}) => (
	<div {...stylex.props(styles.cards)}>
		{evening.lineup.teams.map((team, order) => (
			<TeamCard
				key={team.index}
				sx={[animations.rise, deal.delay(order)]}
				team={team}
				elos={evening.lineup.elos}
				usersByUid={evening.usersByUid}
				sideSize={schedule.pitchSide}
				highlightUid={powers.uid ?? undefined}
				deltas={deltas}
				notPlaying={sheet.notPlaying}
				absentUids={sheet.absentUids}
				onMovePlayer={powers.movePlayers ? onMove : undefined}
				onChangeLetter={powers.changeLetters ? () => onLetter(team.index) : undefined}
			/>
		))}
	</div>
);

/**
 * People who are in for this game but on no team.
 *
 * Only reachable once somebody has picked the teams by hand, which is also the
 * moment nothing else is going to notice. Shown to everybody rather than to
 * admins alone: a player looking for their own name on four cards and not
 * finding it deserves the explanation, even though only an admin can do
 * anything about it.
 */
const NotOnTheSheet = ({
	uids,
	usersByUid,
	canMove,
	onMove,
}: {
	uids: string[];
	usersByUid: Map<string, AppUser>;
	canMove: boolean;
	onMove: (uid: string) => void;
}) => {
	if (uids.length === 0) return null;

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<HandRaisedIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
				<h2 {...stylex.props(styles.title)}>Not on the sheet</h2>
				<StatusPill tone='pending'>{uids.length}</StatusPill>
			</div>

			<p {...stylex.props(styles.lead)}>
				In for this game, but on no team. The app stopped picking when the teams were sorted out by hand.
			</p>

			<ul>
				{uids.map(uid => (
					<li key={uid} {...stylex.props(styles.person)}>
						<Avatar
							displayName={displayNameOf(usersByUid.get(uid))}
							photoURL={usersByUid.get(uid)?.photoURL}
							size='sm'
						/>
						<span {...stylex.props(styles.personName, utils.truncate)}>
							{displayNameOf(usersByUid.get(uid))}
						</span>
						{canMove && (
							<Button size='sm' variant='ghost' onClick={() => onMove(uid)}>
								Give a team
							</Button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
};

/** One fixture, and the round heading above it where a round means anything. */
const FixtureRow = ({
	fixture,
	schedule,
	canScore,
	onScore,
	onClear,
}: {
	fixture: Fixture;
	schedule: Schedule;
	canScore: boolean;
	onScore: (fixture: Fixture, scoreA: number, scoreB: number) => Promise<void>;
	onClear: (order: number) => Promise<void>;
}) => (
	<Fragment>
		{schedule.showRounds && fixture.order % schedule.roundLength === 0 && (
			<li {...stylex.props(styles.round, fixture.order > 0 && styles.roundBreak)}>
				Round {fixture.order / schedule.roundLength + 1}
			</li>
		)}

		<MatchScore
			fixture={fixture}
			match={schedule.matchesByOrder.get(fixture.order)}
			sideSize={getSideSize(schedule.squadSizes[fixture.teamA], schedule.squadSizes[fixture.teamB])}
			canScore={canScore}
			onScore={(scoreA, scoreB) => onScore(fixture, scoreA, scoreB)}
			onClear={() => onClear(fixture.order)}
		/>
	</Fragment>
);

/**
 * Keeping the score.
 *
 * Anyone who answered the game can. That is the point, so whoever has a free
 * hand does it. Confirming the game closes it to everyone but an admin, and
 * closes it to a tap even for them: a correction replays the ladder from here
 * on, so a locked scoreboard is one they have to open first. `ScoreboardLock`
 * is the door and holds the reasoning.
 */
const Scoreboard = ({
	schedule,
	powers,
	correcting,
	onCorrecting,
	onScore,
	onClear,
}: {
	schedule: Schedule;
	powers: Powers;
	correcting: boolean;
	onCorrecting: (next: boolean) => void;
	onScore: (fixture: Fixture, scoreA: number, scoreB: number) => Promise<void>;
	onClear: (order: number) => Promise<void>;
}) => (
	<section {...stylex.props(surfaces.glass, styles.card)}>
		<div {...stylex.props(styles.scoreHead)}>
			<h2 {...stylex.props(styles.title)}>Scoreboard</h2>
			{powers.finalised && <StatusPill tone='neutral'>Confirmed</StatusPill>}
		</div>

		{powers.access === 'none' && !powers.finalised && (
			<p {...stylex.props(styles.lead)}>Say you&apos;re in and you can keep the score too.</p>
		)}

		{powers.access === 'locked' && <ScoreboardLock correcting={correcting} onChange={onCorrecting} />}

		<ol {...stylex.props(styles.fixtures)}>
			{schedule.fixtures.map(fixture => (
				<FixtureRow
					key={fixture.order}
					fixture={fixture}
					schedule={schedule}
					canScore={powers.score}
					onScore={onScore}
					onClear={onClear}
				/>
			))}
		</ol>
	</section>
);

/**
 * The table, and the one tap on this screen that reaches everybody.
 *
 * Confirming applies ratings, opens the vote, notifies the lineup, charges the
 * extras who played and freezes the sheet the ledger was computed against. It
 * sits directly under a table an admin came here to read, which is where a
 * scrolling thumb ends up. `ScoreboardLock` already asks before undoing this;
 * asking here too is the other half of the same trade, since this is the tap
 * that makes the undo cost a replay.
 */
const TableSection = ({
	evening,
	powers,
	schedule,
	outcome,
	onConfirm,
}: {
	evening: Evening;
	powers: Powers;
	schedule: Schedule;
	outcome: Outcome;
	onConfirm: () => void;
}) => {
	if (schedule.played === 0 && !powers.finalised) return null;

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<h2 {...stylex.props(styles.titleGap)}>Table</h2>
			<StandingsTable standings={outcome.standings} unequal={outcome.unequal} />

			{/* Said on the screen the table is on, because this is where somebody
			    works out why their rating moved the way it did, and the answer
			    stopped being "we came second" in Aug 2026. */}
			<p {...stylex.props(styles.tableNote)}>
				Ratings read how much of the evening each team won, not just where it finished, so two teams that end up
				level move almost together, and the team that wins the table always moves further.
			</p>

			{powers.finalised ? (
				<p {...stylex.props(styles.hint)}>
					Confirmed {formatRelative(evening.game.resultFinalisedAt!)}. Ratings have been applied. A season
					admin correcting a score from here will work them out again.
				</p>
			) : (
				<>
					<p {...stylex.props(styles.hint)}>
						Nothing counts towards anyone&apos;s rating until this is confirmed, which happens on its own{' '}
						{AUTO_FINALISE_HOURS} hours after kick-off.
					</p>

					{powers.isAdmin && (
						<Button variant='primary' sx={styles.confirm} onClick={onConfirm}>
							<CheckCircleIcon {...stylex.props(styles.buttonIcon)} aria-hidden='true' />
							Confirm results
						</Button>
					)}
				</>
			)}
		</section>
	);
};

/** Moving one player, and swapping two squads' letters. One at a time. */
const Sheets = ({
	evening,
	letteringIndex,
	movingUid,
	onCloseLetter,
	onCloseMove,
	onSwap,
	onMove,
}: {
	evening: Evening;
	letteringIndex: number | null;
	movingUid: string | null;
	onCloseLetter: () => void;
	onCloseMove: () => void;
	onSwap: (from: number, to: number) => Promise<void>;
	onMove: (uid: string, teamIndex: number | null) => Promise<void>;
}) => (
	<>
		{letteringIndex !== null && (
			<TeamLetterSheet
				team={evening.lineup.teams[letteringIndex] ?? null}
				teams={evening.lineup.teams}
				usersByUid={evening.usersByUid}
				open
				onClose={onCloseLetter}
				onSwap={withIndex => onSwap(letteringIndex, withIndex)}
			/>
		)}

		{movingUid && (
			<PlayerTeamSheet
				displayName={displayNameOf(evening.usersByUid.get(movingUid))}
				teams={evening.lineup.teams}
				currentIndex={findTeamIndex(evening.lineup.teams, movingUid)}
				open
				onClose={onCloseMove}
				onMove={teamIndex => onMove(movingUid, teamIndex)}
			/>
		)}
	</>
);

/**
 * Everything the team sheet reads.
 *
 * `matchesLoading` travels with the rest for the same reason a missing lineup
 * is its own state: a screen must not draw a real state it does not know yet. A
 * match with no document reads as a dash, and that is the third state, never
 * played, as distinct from played nil-nil. An outstanding subscription renders
 * the same dash, so without this a 5-3 game came up as two dashes and snapped
 * to the score a moment later. Wrong on the one screen whose whole job is the
 * scoreline, and wrong in the specific way that makes the number unreadable:
 * anything reading it, a person or a test, cannot tell "nobody played this" from
 * "ask again in a moment".
 */
const useTeamSheet = (seasonId: string, gameId: string) => {
	const { season, games, myResponses, loading, error, retry, isAdmin, isSeasonAdmin } = useSeasonContext();
	const { teams: lineup, loading: teamsLoading } = useTournamentTeams(seasonId, gameId);
	const { matches, loading: matchesLoading } = useMatches(seasonId, gameId);
	const { result } = useTournamentResult(seasonId, gameId);
	// Who is actually in, subscribed here rather than taken from `game.counts`:
	// the counters are a background trigger behind, and this is the list the team
	// sheet gets compared against.
	const { responses } = useResponses(seasonId, gameId);
	const { usersByUid } = useUsersByUid();

	return {
		season,
		game: games.find(candidate => candidate.id === gameId) ?? null,
		myResponse: myResponses[gameId],
		lineup,
		matches,
		result,
		responses,
		usersByUid,
		loading: loading || teamsLoading || matchesLoading,
		error,
		retry,
		isAdmin,
		isSeasonAdmin,
	};
};

/**
 * The man-of-the-match vote, which is the one thing on this screen with a
 * deadline on it.
 *
 * The clock has to move: anything off `new Date()` would keep offering the
 * buttons for as long as the page stayed open.
 */
const useMotmVote = (seasonId: string, gameId: string, uid: string | null) => {
	const { motm } = useMotm(seasonId, gameId);
	const { vote } = useMyMotmVote(seasonId, gameId, uid);
	const { voterUids } = useMotmVoters(seasonId, gameId);
	const write = useWrite();
	const now = useNow();

	const cast = async (votedFor: string) => {
		if (!uid) return;

		// Tapping your own pick again takes it back. Abstaining is a real
		// position, and there is nowhere else to express it.
		await write(
			() =>
				vote?.votedFor === votedFor
					? clearMotmVote(seasonId, gameId, uid)
					: setMotmVote(seasonId, gameId, uid, votedFor),
			"Couldn't save your vote."
		);
	};

	return { motm, vote, voterUids, now, cast };
};

/** Everything this screen writes, and the two things it asks about first. */
const useTeamSheetWrites = (seasonId: string, gameId: string, usersByUid: Map<string, AppUser>) => {
	const write = useWrite();
	const confirm = useConfirm();

	return {
		/**
		 * Asked about only when there is something to throw away, which is the
		 * whole distinction the button rests on. An automatic lineup is re-picked
		 * every time somebody changes their answer, so re-picking it deliberately
		 * costs nothing and stays one tap. A pinned one is an evening of somebody
		 * else's planning, and this is the only button that undoes it. The
		 * pinned-lineup note already names who, so the dialog does too.
		 */
		reshuffle: async (edited: TournamentTeams['edited']) => {
			if (edited) {
				const ok = await confirm({
					title: 'Throw away the hand-picked teams?',
					message: `${displayNameOf(usersByUid.get(edited.by))} sorted these teams out by hand. Reshuffling hands them back to the app, which picks from who is in and re-picks whenever somebody changes their answer.`,
					// Never the word on the button that opened it: "Reshuffle" twice
					// on one screen is a thing for a tap, and a test, to pick the
					// wrong one of. Same reason `ScoreboardLock` answers "Correct a
					// score" with "Correct it".
					confirmLabel: 'Re-pick them',
					tone: 'danger',
				});

				if (!ok) return;
			}

			await write(() => reshuffleTeams(seasonId, gameId), "Couldn't reshuffle the teams.");
		},

		score: async (fixture: Fixture, scoreA: number, scoreB: number, uid: string | null) => {
			if (!uid) return;

			await write(
				() => setMatchScore(seasonId, gameId, fixture, scoreA, scoreB, uid),
				"Couldn't save that score."
			);
		},

		clearScore: async (order: number) => {
			await write(() => clearMatchScore(seasonId, gameId, order), "Couldn't clear that score.");
		},

		finalise: async (chargeNote: string) => {
			const ok = await confirm({
				title: 'Confirm the results?',
				message: `Ratings are worked out and applied to everybody who played, the man-of-the-match vote opens and the lineup is notified.${chargeNote} Correcting a score after this works the ratings out again: for this game, and for every game played since.`,
				confirmLabel: 'Confirm it',
			});

			if (!ok) return;

			await write(() => finaliseTournament(seasonId, gameId), "Couldn't confirm the results.");
		},

		swapLetters: async (from: number, to: number) => {
			await write(() => setTeamLetter(seasonId, gameId, from, to), "Couldn't swap those teams over.");
		},

		movePlayer: async (uid: string, teamIndex: number | null) => {
			await write(() => setPlayerTeam(seasonId, gameId, uid, teamIndex), "Couldn't move them.");
		},
	};
};

/**
 * What the person looking at this may actually do.
 *
 * A score is recorded against a fixture, "match 1, team A v team B", so
 * re-picking the squads underneath one would leave the scoreboard describing a
 * game nobody played. The lineup is settled from the first score in, and frozen
 * outright once the game is confirmed, which `runTeamRebuild` enforces on its
 * side too.
 *
 * `isAppAdmin` is neither `isAdmin`, which is either kind, nor `isSeasonAdmin`,
 * which is neither. Reshuffle is the one button here that asks for the global
 * claim. Moving players is season admins rather than everyone `isAdmin` covers:
 * an app admin passing through somebody else's season has no standing to move
 * their players around. Changing letters has the same window as Reshuffle for a
 * stricter reason: a match document stores the two team indices it was played
 * between, so a swap underneath one hands a scoreline to a squad that never
 * played it.
 */
const readPowers = ({
	user,
	isAdmin,
	isSeasonAdmin,
	finalised,
	hasResponded,
	played,
	correcting,
}: {
	user: { uid: string; isAppAdmin?: boolean } | null | undefined;
	isAdmin: boolean;
	isSeasonAdmin: boolean;
	finalised: boolean;
	hasResponded: boolean;
	played: number;
	correcting: boolean;
}): Powers => {
	const access = getScoreAccess({ finalised, isAdmin, hasResponded });
	const lineupOpen = played === 0 && !finalised;

	return {
		uid: user?.uid ?? null,
		isAdmin,
		isAppAdmin: user?.isAppAdmin === true,
		movePlayers: isSeasonAdmin && !finalised,
		changeLetters: isSeasonAdmin && lineupOpen,
		score: access === 'open' || (access === 'locked' && correcting),
		lineupOpen,
		finalised,
		access,
	};
};

const TournamentPage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);
	const { user } = useAuth();
	const read = useTeamSheet(seasonId, gameId);
	const motm = useMotmVote(seasonId, gameId, user?.uid ?? null);
	const writes = useTeamSheetWrites(seasonId, gameId, read.usersByUid);

	// Which player's move sheet is open. One at a time. This is a tap on a name
	// followed by a tap on a letter, not a mode the screen sits in.
	const [movingUid, setMovingUid] = useState<string | null>(null);

	// Which squad's letter is being changed. `null` rather than a boolean, since
	// the sheet is about one team and the swap is with whichever is picked.
	const [letteringIndex, setLetteringIndex] = useState<number | null>(null);

	// Whether a confirmed game's scoreboard has been deliberately opened up: see
	// `ScoreboardLock`, which is where the reasoning lives. On the screen rather
	// than on the game: it is about this visit, and it means nothing to anybody
	// else looking at the same game.
	const [correcting, setCorrecting] = useState(false);

	const backHref = `/s/${seasonId}/g/${gameId}`;

	if (read.loading) return <NoTeams reason='loading' backHref={backHref} onRetry={read.retry} />;
	if (read.error) return <NoTeams reason='error' backHref={backHref} onRetry={read.retry} />;
	if (!read.season || !read.game) return <NoTeams reason='missing' backHref={backHref} onRetry={read.retry} />;

	const { season, game, lineup } = read;
	const subtitle = formatGameDateLong(game.kickoff, season.slot.timezone);

	if (!lineup || lineup.teams.length === 0) {
		return <NoLineup playing={game.counts.playing} subtitle={subtitle} backHref={backHref} />;
	}

	const evening: Evening = { seasonId, gameId, season, game, lineup, usersByUid: read.usersByUid };
	const schedule = readSchedule(season, lineup, read.matches);
	const outcome = readOutcome(season, gameId, lineup, schedule, read.result ?? null, read.responses);
	const sheet = readSheet(lineup, read.responses);

	const powers = readPowers({
		user,
		isAdmin: read.isAdmin,
		isSeasonAdmin: read.isSeasonAdmin,
		finalised: !!game.resultFinalisedAt,
		hasResponded: !!read.myResponse,
		played: schedule.played,
		correcting,
	});

	return (
		<SeasonShell title='Teams' subtitle={subtitle} backHref={backHref}>
			<div {...stylex.props(styles.page)}>
				{/* First on the screen, whichever of its two jobs it is doing. Open, it
				    is the only thing here with a deadline on it and the notification
				    that opened it lands on this page, so it goes above a lineup and a
				    scoreboard that are both already settled. Decided, it stays there:
				    it used to drop down beside the table once it was counted, which put
				    the one part of the evening the table cannot show below three
				    sections of the parts it can, at the bottom of a long scroll on a
				    phone. Drawn only when there is something to draw: the panel returns
				    nothing at all until there is a vote to hold or a result to
				    report. */}
				<MotmPanel
					teams={lineup.teams}
					usersByUid={read.usersByUid}
					motm={motm.motm}
					vote={motm.vote}
					voterUids={motm.voterUids}
					votingUntil={game.motmVotingUntilMillis}
					now={motm.now}
					meUid={powers.uid}
					onVote={motm.cast}
				/>

				<LineupCard
					evening={evening}
					powers={powers}
					schedule={schedule}
					onReshuffle={() => writes.reshuffle(lineup.edited)}
				/>

				<TeamCards
					evening={evening}
					powers={powers}
					schedule={schedule}
					sheet={sheet}
					deltas={outcome.deltas}
					onMove={setMovingUid}
					onLetter={setLetteringIndex}
				/>

				<NotOnTheSheet
					uids={sheet.unassigned}
					usersByUid={read.usersByUid}
					canMove={powers.movePlayers}
					onMove={setMovingUid}
				/>

				<Scoreboard
					schedule={schedule}
					powers={powers}
					correcting={correcting}
					onCorrecting={setCorrecting}
					onScore={(fixture, scoreA, scoreB) => writes.score(fixture, scoreA, scoreB, powers.uid)}
					onClear={writes.clearScore}
				/>

				<TableSection
					evening={evening}
					powers={powers}
					schedule={schedule}
					outcome={outcome}
					onConfirm={() => writes.finalise(outcome.chargeNote)}
				/>

				<Sheets
					evening={evening}
					letteringIndex={letteringIndex}
					movingUid={movingUid}
					onCloseLetter={() => setLetteringIndex(null)}
					onCloseMove={() => setMovingUid(null)}
					onSwap={writes.swapLetters}
					onMove={writes.movePlayer}
				/>
			</div>
		</SeasonShell>
	);
};

export default TournamentPage;
