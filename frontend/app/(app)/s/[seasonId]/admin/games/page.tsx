'use client';

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { Game, Season } from '@shared/types';
import type { GeneratedGame } from '@shared/schedule';
import { diffGeneratedGames, generateGameDates } from '@shared/schedule';
import { getGameLifecycle, hasBeenPlayed, splitOnWhistle } from '@shared/game';
import { counted, formatGameDate, formatGameTime } from '@shared/format';
import { parseCivilDate, zonedTimeToUtc } from '@shared/datetime';
import { useAuth } from '../../../../../../lib/auth';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useWrite } from '../../../../../../hooks/useWrite';
import { useConfirm } from '../../../../../../components/ConfirmDialog';
import { useToast } from '../../../../../../components/Toast';
import { useNow } from '../../../../../../hooks/useNow';
import { cancelGame, createGames, createOneOffGame, deleteGame, restoreGame } from '../../../../../../lib/db/games';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import LoadFailed from '../../../../../../components/LoadFailed';
import Button from '../../../../../../components/Button';
import StatusPill from '../../../../../../components/StatusPill';
import DatePicker from '../../../../../../components/DatePicker';
import PlayedSection from '../../../../../../components/PlayedSection';
import { Field, TextInput } from '../../../../../../components/Field';
import { ListCard, ListEmpty, listRow, SectionHeading } from '../../../../../../components/Section';
import { colors } from '../../../../../tokens.stylex';
import { surfaces } from '../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },
	card: { borderRadius: 16, padding: 20 },
	cardTitle: { color: colors.ink, marginBottom: 4, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	oneOffTitle: { marginBottom: 16 },
	blurb: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 1.625 },
	preview: { marginBottom: 16, display: 'flex', gap: 8 },

	/*
	 * Two across at every width. The date and the kick-off are one question, and
	 * a date picker beside a time field fits the narrowest phone.
	 */
	pair: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },
	add: { marginTop: 16 },

	heading: { marginBottom: 8, paddingInline: 4 },
	/* The gap under the Played heading, above a card of rows. */
	playedHead: { marginBottom: 8 },

	/*
	 * Does not wrap, on purpose: Cancel and Delete are three and six characters
	 * and the date beside them shrinks instead, which keeps the two buttons in
	 * the same place on every row of a list somebody is working down.
	 */
	row: { display: 'flex', alignItems: 'center', gap: 8, paddingBlock: 12 },
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	when: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
	time: { color: colors.faint, fontVariantNumeric: 'tabular-nums' },
	marks: { marginTop: 4, display: 'flex', gap: 6 },
	playing: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
});

/**
 * What deleting this game actually costs.
 *
 * A confirmed game is the part worth spelling out: the ratings it gave
 * everybody are taken back and every game played since is worked out again,
 * because each of those was rated against the ratings this one produced. None
 * of that is what "delete a game" sounds like it does.
 */
const describeDeletion = (game: Game): string => {
	const answers = game.counts.membersIn + game.counts.membersOut + game.counts.extrasIn + game.counts.extrasOut;

	return [
		game.resultFinalisedAt &&
			'These results are confirmed, so the ratings they gave everyone are taken back and every game played since is worked out again.',
		answers > 0 &&
			`${answers} ${answers === 1 ? 'answer goes' : 'answers go'} with it. Cancelling the game instead keeps them.`,
		"This can't be undone.",
	]
		.filter(Boolean)
		.join(' ');
};

/**
 * One game on the admin calendar.
 *
 * Its own component because the list is drawn twice now: what is coming up,
 * and what has been played, and two copies of a row carrying three buttons is
 * two places for them to drift apart.
 */
const CalendarRow = ({
	game,
	season,
	now,
	onCancel,
	onRestore,
	onDelete,
}: {
	game: Game;
	season: Season;
	now: Date;
	onCancel: (game: Game) => void;
	onRestore: (game: Game) => void;
	onDelete: (game: Game) => void;
}) => {
	const isCancelled = getGameLifecycle(game, season, now) === 'cancelled';
	const isOver = hasBeenPlayed(game, now);

	return (
		<div {...stylex.props(listRow, styles.row)}>
			<div {...stylex.props(styles.body)}>
				<p {...stylex.props(styles.when)}>
					{formatGameDate(game.kickoff, season.slot.timezone)}{' '}
					<span {...stylex.props(styles.time)}>{formatGameTime(game.kickoff, season.slot.timezone)}</span>
				</p>
				<div {...stylex.props(styles.marks)}>
					<span {...stylex.props(styles.playing)}>{game.counts.playing} playing</span>
					{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
					{isCancelled && <StatusPill tone='out'>Cancelled</StatusPill>}
				</div>
			</div>

			{/* Calling a game off past the final whistle is not a decision anybody
			    can still make, and it is worse than useless: `cancelled` is read
			    before `finished`, so a played, even a confirmed and rated, game
			    would stop being finished and reappear as the top card on the
			    season home screen. Restore stays on a cancelled game whenever it
			    happened, because that is the way back from exactly this. */}
			{(isCancelled || !isOver) && (
				<Button size='sm' variant='ghost' onClick={() => (isCancelled ? onRestore(game) : onCancel(game))}>
					{isCancelled ? 'Restore' : 'Cancel'}
				</Button>
			)}

			{/* Deleting loses the answers; cancelling keeps them. */}
			<Button size='sm' variant='danger' onClick={() => onDelete(game)}>
				Delete
			</Button>
		</div>
	);
};

/** Why there is no calendar to manage, drawn as the screen. */
const NoCalendar = ({
	reason,
	backHref,
	onRetry,
}: {
	reason: 'loading' | 'error' | 'denied';
	backHref: string;
	onRetry: () => void;
}) => (
	<SeasonShell title='Games' backHref={backHref}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='the calendar' onRetry={onRetry} />}
		{reason === 'denied' && <EmptyState title='Admins only' />}
	</SeasonShell>
);

/** What generating would do, and the button to do it. */
const GenerateButton = ({
	preview,
	onGenerate,
}: {
	preview: ReturnType<typeof diffGeneratedGames> | null;
	onGenerate: (toCreate: GeneratedGame[]) => Promise<void>;
}) => {
	const toCreate = preview?.toCreate ?? [];

	return (
		<>
			{preview && (
				<div {...stylex.props(styles.preview)}>
					<StatusPill tone={toCreate.length > 0 ? 'in' : 'neutral'}>{toCreate.length} new</StatusPill>
					<StatusPill tone='neutral'>{preview.alreadyExisting.length} already there</StatusPill>
				</div>
			)}

			<Button variant='primary' fullWidth disabled={toCreate.length === 0} onClick={() => onGenerate(toCreate)}>
				{toCreate.length > 0 ? `Add ${counted(toCreate.length, 'game')}` : 'Nothing to add'}
			</Button>
		</>
	);
};

/**
 * Everything an admin can do to this season's calendar.
 *
 * Calling a game off and putting it back on both ask first, because both send a
 * notification to everybody the game affects: `onGameWrite` pushes the moment
 * `status` moves. Cancel was the one button on a row doing that unguarded, and
 * it is the smaller and quieter of the two beside a Delete that has always
 * confirmed.
 */
const useCalendarActions = (season: Season | null, uid: string | undefined) => {
	const write = useWrite();
	const confirm = useConfirm();
	const { notify } = useToast();

	const when = (game: Game) => formatGameDate(game.kickoff, season?.slot.timezone ?? 'UTC');

	const generate = async (toCreate: GeneratedGame[]) => {
		if (!season || !uid || toCreate.length === 0) return;

		const ok = await write(
			() => createGames(season, toCreate, uid),
			"Couldn't add the games. Nothing was created."
		);

		if (ok) notify(`Added ${counted(toCreate.length, 'game')}.`);
	};

	const addOneOff = async ({ date, time }: { date: string; time: string }) => {
		if (!season || !uid || !date || !time) return false;

		const { year, month, day } = parseCivilDate(date);
		const [hours, minutes] = time.split(':').map(Number);
		const kickoff = zonedTimeToUtc(year, month, day, hours, minutes, season.slot.timezone);

		const ok = await write(
			() =>
				createOneOffGame(
					season,
					{
						kickoff: kickoff.toISOString(),
						endsAt: new Date(kickoff.getTime() + season.slot.durationMinutes * 60 * 1000).toISOString(),
					},
					uid
				),
			"Couldn't add that game."
		);

		if (ok) notify('One-off game added.');

		return ok;
	};

	const cancel = async (game: Game) => {
		if (!season) return;

		const ok = await confirm({
			title: `Call off ${when(game)}?`,
			message:
				'Everybody this game affects gets a notification. Answers are kept, so putting it back on is one tap.',
			confirmLabel: 'Call it off',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => cancelGame(season.id, game.id, 'Called off by an admin'), "Couldn't cancel that game.");
	};

	const remove = async (game: Game) => {
		if (!season) return;

		const ok = await confirm({
			title: `Delete ${when(game)}?`,
			message: describeDeletion(game),
			confirmLabel: 'Delete',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => deleteGame(season.id, game.id), "Couldn't delete that game.");
	};

	const restore = async (game: Game) => {
		if (!season) return;

		const ok = await confirm({
			title: `Put ${when(game)} back on?`,
			message: 'Everybody this game affects gets a notification saying it is on again.',
			confirmLabel: 'Put it back on',
		});

		if (!ok) return;

		await write(() => restoreGame(season.id, game.id), "Couldn't put that game back on.");
	};

	return { generate, addOneOff, cancel, remove, restore };
};

const AdminGamesPage = () => {
	const { user } = useAuth();
	const { seasonId, season, games, loading, error, retry, isAdmin } = useSeasonContext();
	const now = useNow();
	const { generate, addOneOff, cancel, remove, restore } = useCalendarActions(season, user?.uid);

	const [oneOff, setOneOff] = useState({ date: '', time: '' });
	const [showPast, setShowPast] = useState(false);

	// It used to render `games` straight through in kickoff order, so by March an
	// admin scrolled past twenty played games to reach the one they came to
	// change. `splitOnWhistle` is in `shared/` with the rest of the reasoning
	// about where a game sits in time, and tested there.
	const { scheduled, played } = useMemo(() => splitOnWhistle(games, now), [games, now]);

	// Preview what "generate" would actually do, so an admin can see "12 new, 8
	// already there" before committing a batch write.
	const preview = useMemo(() => {
		if (!season) return null;

		try {
			const generated = generateGameDates(season.slot, season.startDate, season.endDate);

			return diffGeneratedGames(
				generated,
				games.map(game => game.kickoff)
			);
		} catch {
			// Dates can be mid-edit and invalid; the button just stays disabled.
			return null;
		}
	}, [season, games]);

	const up = `/s/${seasonId}/admin`;

	if (loading) return <NoCalendar reason='loading' backHref={up} onRetry={retry} />;
	if (error) return <NoCalendar reason='error' backHref={up} onRetry={retry} />;
	if (!season || !isAdmin || !user) return <NoCalendar reason='denied' backHref={up} onRetry={retry} />;

	return (
		<SeasonShell title='Games' subtitle={`${games.length} on the calendar`} backHref={`/s/${seasonId}/admin`}>
			<div {...stylex.props(styles.page)}>
				<section {...stylex.props(surfaces.glass, styles.card)}>
					<h2 {...stylex.props(styles.cardTitle)}>Generate the calendar</h2>
					<p {...stylex.props(styles.blurb)}>
						Creates every {season.slot.time} game on the season&apos;s weekday between {season.startDate}{' '}
						and {season.endDate}. Games that already exist are left alone, so it&apos;s safe to run again
						after extending the season.
					</p>

					<GenerateButton preview={preview} onGenerate={generate} />
				</section>

				<section {...stylex.props(surfaces.glass, styles.card)}>
					<h2 {...stylex.props(styles.cardTitle, styles.oneOffTitle)}>Add a one-off</h2>

					<div {...stylex.props(styles.pair)}>
						<Field label='Date'>
							<DatePicker value={oneOff.date} onChange={date => setOneOff({ ...oneOff, date })} />
						</Field>

						<Field label='Kick-off'>
							<TextInput
								type='time'
								value={oneOff.time}
								onChange={e => setOneOff({ ...oneOff, time: e.target.value })}
							/>
						</Field>
					</div>

					<Button
						variant='secondary'
						fullWidth
						sx={styles.add}
						disabled={!oneOff.date || !oneOff.time}
						onClick={async () => {
							if (await addOneOff(oneOff)) setOneOff({ date: '', time: '' });
						}}
					>
						Add game
					</Button>
				</section>

				<section>
					<SectionHeading sx={styles.heading}>Coming up ({scheduled.length})</SectionHeading>

					<ListCard>
						{scheduled.length === 0 && (
							<ListEmpty>
								{games.length === 0 ? 'No games yet.' : 'Nothing left on the calendar.'}
							</ListEmpty>
						)}

						{scheduled.map(game => (
							<CalendarRow
								key={game.id}
								game={game}
								season={season}
								now={now}
								onCancel={cancel}
								onRestore={restore}
								onDelete={remove}
							/>
						))}
					</ListCard>
				</section>

				<PlayedSection
					count={played.length}
					open={showPast}
					onToggle={() => setShowPast(!showPast)}
					sx={styles.playedHead}
				>
					<ListCard>
						{played.map(game => (
							<CalendarRow
								key={game.id}
								game={game}
								season={season}
								now={now}
								onCancel={cancel}
								onRestore={restore}
								onDelete={remove}
							/>
						))}
					</ListCard>
				</PlayedSection>
			</div>
		</SeasonShell>
	);
};

export default AdminGamesPage;
