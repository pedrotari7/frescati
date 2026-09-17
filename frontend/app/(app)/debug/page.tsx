'use client';

import { useMemo, useState } from 'react';
import { BellAlertIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Game, Season } from '@shared/types';
import type { AnyNotification, PushPayload } from '@shared/notifications';
import {
	NOTIFICATIONS,
	buildDueRaisedPush,
	buildDuesPush,
	buildGamePush,
	buildNewPlayerPush,
} from '@shared/notifications';
import { getSilentMembers } from '@shared/game';
import { SAMPLE_CHARGE, SAMPLE_DEBT } from '@shared/debug';
import { counted, formatGameWhen, plural } from '@shared/format';
import { useAuth } from '../../../lib/auth';
import type { PushSupport } from '../../../lib/push';
import { usePushRegistration } from '../../../hooks/usePushRegistration';
import { sendTestPush } from '../../../lib/db/testPush';
import { sendTestEmail } from '../../../lib/db/testEmail';
import type { EmailTestOutcome, EmailTestStatus, TestEmailResult } from '../../../lib/db/testEmail';
import { useGames, useResponses, useSeasons, useUsers } from '../../../hooks/useData';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';
import PageShell from '../../../components/PageShell';
import AppAdminOnly from '../../../components/AppAdminOnly';
import Avatar from '../../../components/Avatar';
import Button from '../../../components/Button';
import StatusPill from '../../../components/StatusPill';
import type { PillTone } from '../../../components/StatusPill';
import { Field, Select } from '../../../components/Field';
import ErrorTriggers from '../../../components/ErrorTriggers';
import PaymentTriggers from '../../../components/PaymentTriggers';
import { colors, tint } from '../../tokens.stylex';
import { surfaces, utils } from '../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },

	card: { borderRadius: 16, padding: 20 },
	/* `space-y-4` on the two panels that are a stack of form rows. */
	stack: { display: 'flex', flexDirection: 'column', gap: 16 },

	head: { display: 'flex', alignItems: 'center', gap: 8 },
	headGap: { marginBottom: 12 },
	headTight: { marginBottom: 4 },
	headIcon: { color: colors.muted, width: 20, height: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	titleGap: { marginBottom: 4 },

	pills: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },

	body: { color: colors.muted, fontSize: 14, lineHeight: 1.625 },
	bodyGap: { marginTop: 12 },
	lead: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 1.625 },
	warn: { color: colors.pending, fontSize: 14, lineHeight: 1.625 },
	note: { color: colors.faint, marginTop: 12, fontSize: 12, lineHeight: 1.625 },

	/*
	 * `divide-y divide-white/5 border-t border-white/5`, which is a hairline
	 * above every row including the first, so the row carries it with no
	 * `:first-child` exception and the container needs no border of its own.
	 */
	row: {
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 16,
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
	},
	/* Wide enough to be worth a line of its own: under 160px the description
	   wraps to one word per line, so below that the Send button drops instead. */
	rowBody: { minWidth: 160, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	rowTitle: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 500 },
	rowNote: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: 1.625 },

	/** What actually went out, quoted. */
	quote: {
		color: colors.muted,
		borderLeftWidth: 2,
		borderLeftStyle: 'solid',
		borderLeftColor: tint.white10,
		paddingLeft: 8,
		fontSize: 12,
		lineHeight: 1.625,
	},
	quoteGap: { marginTop: 8 },

	pickerHead: { marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	pickerLabel: {
		color: colors.muted,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		letterSpacing: '0.025em',
		textTransform: 'uppercase',
	},
	pickerActions: { display: 'flex', gap: 4 },

	/* Capped and scrolling: the full roster is longer than the screen, and the
	   send button underneath has to stay reachable without scrolling past it. */
	roster: { maxHeight: 256, overflowY: 'auto', borderRadius: 12, paddingInline: 12 },
	empty: { color: colors.faint, paddingBlock: 12, fontSize: 14, lineHeight: '20px' },
	person: {
		display: 'flex',
		cursor: 'pointer',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 8,
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
	},
	tick: { accentColor: colors.brand, width: 16, height: 16, flexShrink: 0 },
	personName: {
		color: colors.ink,
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
	},

	outcome: {
		display: 'flex',
		flexDirection: 'column',
		gap: 8,
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
		paddingTop: 16,
	},
	outcomes: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 },
	outcomeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	outcomeName: { color: colors.muted, minWidth: 0, fontSize: 12, lineHeight: '16px' },
});

/**
 * Fires each of the app's real notifications at your own devices.
 *
 * Exists because push is the one thing in here that can't be exercised locally:
 * Firebase has no Cloud Messaging emulator, so a notification only becomes real
 * once the backend asks FCM for it. Staging the events by hand is worse than it
 * sounds. `atRisk` fires on an edge only somebody *else's* response can cross,
 * and reminders are an hourly sweep that records each window as sent forever.
 *
 * The copy comes back from the function rather than being composed here, so
 * what this screen shows is what was sent.
 */

/**
 * The title alone, for the row that hasn't been sent yet. Read off the real
 * builder rather than retyped, so a row can't label itself something other than
 * what the send returns.
 *
 * The two money kinds are the ones whose titles interpolate. An empty context
 * still renders, it just renders `0 kr`, so each gets the same invented figures
 * `buildTestPayload` sends with. Otherwise the row would relabel itself the
 * moment a send came back.
 */
const titleFor = (kind: AnyNotification) => {
	if (kind === 'newPlayer') return buildNewPlayerPush({ uid: '', displayName: '', seasonId: null }).title;

	if (kind === 'duesReminder') {
		return buildDuesPush({ seasonId: '', seasonName: '', ...SAMPLE_DEBT, blocked: true }).title;
	}

	if (kind === 'dueRaised') {
		return buildDueRaisedPush({ seasonId: '', seasonName: '', gameId: '', ...SAMPLE_CHARGE, blocked: true }).title;
	}

	return buildGamePush(kind, { when: '', url: '', gameId: '' }).title;
};

const DESCRIPTIONS: Record<AnyNotification, string> = {
	reminder: "The nudge before a game. Really goes to members who haven't answered yet.",
	atRisk: 'Sent once, the moment a game first drops below its minimum.',
	cancelled: 'Really goes to everyone who answered, either way.',
	restored: 'Really goes to every member of the season.',
	kickoffMoved: "Really goes to everyone who said they're in.",
	newPlayer: 'Really goes to every app admin, once, when somebody first signs in. Sends as if you had just joined.',
	availability:
		'Really goes to whoever tapped the bell on that game, every time an answer moves. Sends as if you had just said you were in.',
	motm: 'Really goes to everybody in the lineup and every app admin, once, when a game is confirmed. Opens the team sheet, where the vote is.',
	motmResult:
		'Really goes to the same people when the vote is counted, two days later. Sends as if you had won it. Opens the team sheet, where the totals are.',
	duesReminder:
		'Really goes to one person an admin chased from the season books, with what they owe read off the books rather than typed. Needs the season above; sends a made-up amount. Opens the finances screen.',
	dueRaised:
		'Really goes to each extra the moment a game they played is confirmed, one send each, with the fee off the season. Needs the season above; sends a made-up amount and date. Opens the finances screen.',
};

const STATUS_TONE: Record<EmailTestStatus, PillTone> = { sent: 'in', noAddress: 'out', emailOff: 'neutral' };

const STATUS_LABEL: Record<EmailTestStatus, string> = {
	sent: 'Emailed',
	noAddress: 'No address',
	emailOff: 'Email off',
};

/** What both send buttons aim at: a season, and a game in it when there is one. */
interface Target {
	seasonId: string;
	gameId?: string;
}

/**
 * Which season and game everything on this screen points at.
 *
 * The season falls back to the first rather than being synced in an effect: the
 * list arrives after the first render, and writing it back into state means a
 * frame where nothing is selected. The game is derived rather than stored for a
 * sharper reason, switching season must not leave a game id from the previous
 * one selected, which would send a notification deep-linking somewhere the
 * picker is not pointing.
 *
 * The next game is the one whose notifications are worth looking at, and
 * falling back to the last means a finished season still gives a real deep
 * link.
 */
const useDebugTarget = () => {
	const { seasons } = useSeasons();
	const [chosenSeason, setChosenSeason] = useState<string | null>(null);
	const [chosenGame, setChosenGame] = useState<string | null>(null);

	const seasonId = chosenSeason ?? seasons[0]?.id ?? null;
	const { games } = useGames(seasonId);

	const byKickoff = useMemo(() => [...games].sort((a, b) => a.kickoffMillis - b.kickoffMillis), [games]);

	const defaultGameId = useMemo(() => {
		const now = Date.now();

		return (byKickoff.find(game => game.kickoffMillis >= now) ?? byKickoff[byKickoff.length - 1])?.id ?? null;
	}, [byKickoff]);

	const gameId = chosenGame && byKickoff.some(game => game.id === chosenGame) ? chosenGame : defaultGameId;

	// The season travels on its own when there is no game to name, because the two
	// money kinds are about a season rather than a game and a season with no games
	// generated yet would otherwise be told to pick one. The game kinds fall back
	// to their stand-in context, as they already do when nothing is picked at all.
	const target: Target | undefined = seasonId ? { seasonId, gameId: gameId ?? undefined } : undefined;

	return {
		seasons,
		seasonId,
		season: seasons.find(candidate => candidate.id === seasonId) ?? null,
		games: byKickoff,
		gameId,
		target,
		setChosenSeason,
		setChosenGame,
	};
};

/** Whether this browser could receive anything at all. */
const DeviceCard = ({ support, enabled }: { support: PushSupport | null; enabled: boolean | null }) => (
	<section {...stylex.props(surfaces.glass, styles.card)}>
		<div {...stylex.props(styles.head, styles.headGap)}>
			<BellAlertIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
			<h2 {...stylex.props(styles.title)}>This device</h2>
		</div>

		<div {...stylex.props(styles.pills)}>
			{support === null && <StatusPill tone='neutral'>Checking…</StatusPill>}
			{support === 'needs-install' && <StatusPill tone='pending'>Add to home screen first</StatusPill>}
			{support === 'unsupported' && <StatusPill tone='out'>Browser can&apos;t do push</StatusPill>}
			{support === 'supported' && enabled === true && <StatusPill tone='in'>Registered</StatusPill>}
			{support === 'supported' && enabled === false && <StatusPill tone='out'>Not registered</StatusPill>}
		</div>

		{support === 'supported' && enabled === false && (
			<p {...stylex.props(styles.body, styles.bodyGap)}>
				Turn notifications on from the You screen, then come back. Sends will report zero devices until this
				browser holds a token.
			</p>
		)}

		<p {...stylex.props(styles.note)}>
			Anything sent here goes only to accounts you are signed in as, on every device you have registered. To test
			how the notification renders without involving FCM at all, use the Push box in DevTools under Application →
			Service Workers.
		</p>
	</section>
);

/**
 * Which season and game to aim at. Both, since the payments panel below reads
 * the season's fees off the same selection the notifications deep-link into.
 */
const TargetCard = ({
	seasons,
	season,
	seasonId,
	games,
	gameId,
	onSeason,
	onGame,
}: {
	seasons: Season[];
	season: Season | null;
	seasonId: string | null;
	games: Game[];
	gameId: string | null;
	onSeason: (id: string) => void;
	onGame: (id: string) => void;
}) => (
	<section {...stylex.props(surfaces.glass, styles.card, styles.stack)}>
		<h2 {...stylex.props(styles.title)}>Target season and game</h2>

		<Field label='Season'>
			<Select value={seasonId ?? ''} onChange={event => onSeason(event.target.value)}>
				{seasons.length === 0 && <option value=''>No seasons yet</option>}
				{seasons.map(candidate => (
					<option key={candidate.id} value={candidate.id}>
						{candidate.name}
					</option>
				))}
			</Select>
		</Field>

		<Field label='Game' hint='The notification deep-links here, so tapping it lands on a real game.'>
			<Select value={gameId ?? ''} onChange={event => onGame(event.target.value)} disabled={games.length === 0}>
				{games.length === 0 && <option value=''>No games in this season</option>}
				{games.map(game => (
					<option key={game.id} value={game.id}>
						{season ? formatGameWhen(game.kickoff, season.slot.timezone) : game.kickoff}
						{game.status === 'cancelled' ? ' · cancelled' : ''}
					</option>
				))}
			</Select>
		</Field>

		{!gameId && (
			<p {...stylex.props(styles.warn)}>
				Without a game these send a sample payload linking to the season list. Pick one to test the deep link.
			</p>
		)}
	</section>
);

/**
 * Sending one notification to yourself, and saying which of the five things
 * that can happen actually did.
 *
 * Every one of them is invisible from the phone and they look identical from
 * here, nothing arrives. Saying which it was is the entire point of the screen.
 */
const usePushTest = (target: Target | undefined) => {
	const { notify, warn } = useToast();
	const [sentPayloads, setSentPayloads] = useState<Partial<Record<AnyNotification, PushPayload>>>({});

	const report = (result: Awaited<ReturnType<typeof sendTestPush>>) => {
		if (result.sent > 0) return notify(`Sent to ${counted(result.sent, 'device')}.`);

		// Checked before the two push failures below, because when the fallback
		// caught it neither of them is what happened.
		if (result.emailed > 0) return notify('No device could be reached, so it went to your email instead.');

		// Ahead of the device count, unlike `getPushReach`. That summarises whether
		// somebody is reachable at all, where the missing device is the root cause.
		// This reports one send, and the preference is what short-circuited it,
		// before either channel was consulted.
		if (!result.prefEnabled) return warn('That kind is switched off in your notification preferences.');

		if (result.devices === 0) {
			return warn('No registered devices, and no email went out either. Check the email fallback is configured.');
		}

		return warn('FCM accepted none of your tokens. They are stale, turn notifications off and on again.');
	};

	const send = async (kind: AnyNotification) => {
		try {
			const result = await sendTestPush(kind, target);

			setSentPayloads(previous => ({ ...previous, [kind]: result.payload }));
			report(result);
		} catch (error) {
			console.error('Could not send the test notification', error);
			warn(error instanceof Error ? error.message : "Couldn't send that notification.");
		}
	};

	return { sentPayloads, send };
};

/** One notification per row, with whatever last went out under it. */
const SendOneCard = ({ target }: { target: Target | undefined }) => {
	const { sentPayloads, send } = usePushTest(target);

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<h2 {...stylex.props(styles.title, styles.titleGap)}>Send one</h2>
			<p {...stylex.props(styles.lead)}>
				The same payload the real trigger builds, through the same preferences check. Sending does not change
				any game.
			</p>

			<div>
				{NOTIFICATIONS.map(kind => (
					<SendRow key={kind} kind={kind} payload={sentPayloads[kind]} onSend={() => send(kind)} />
				))}
			</div>
		</section>
	);
};

/** One kind of notification, and what actually went out last time. */
const SendRow = ({
	kind,
	payload,
	onSend,
}: {
	kind: AnyNotification;
	payload: PushPayload | undefined;
	onSend: () => void;
}) => (
	<div {...stylex.props(styles.row)}>
		<div {...stylex.props(styles.rowBody)}>
			<p {...stylex.props(styles.rowTitle)}>{payload?.title ?? titleFor(kind)}</p>
			<p {...stylex.props(styles.rowNote)}>{DESCRIPTIONS[kind]}</p>

			{/* What actually went out, straight from the function, not a preview
			    built here. */}
			{payload && <p {...stylex.props(styles.quote, styles.quoteGap)}>{payload.body}</p>}
		</div>

		<Button size='sm' variant='secondary' onClick={onSend}>
			Send
		</Button>
	</div>
);

/** Who to email, ticked off the full list of accounts. */
const RecipientPicker = ({
	users,
	selected,
	silentUids,
	showSilent,
	onToggle,
	onSet,
}: {
	users: AppUser[];
	selected: Set<string>;
	silentUids: string[];
	showSilent: boolean;
	onToggle: (uid: string) => void;
	onSet: (uids: string[]) => void;
}) => (
	<div>
		<div {...stylex.props(styles.pickerHead)}>
			<span {...stylex.props(styles.pickerLabel)}>Recipients</span>

			<div {...stylex.props(styles.pickerActions)}>
				{showSilent && (
					<Button size='sm' variant='ghost' onClick={() => onSet(silentUids)}>
						Hasn&apos;t answered ({silentUids.length})
					</Button>
				)}
				{selected.size > 0 && (
					<Button size='sm' variant='ghost' onClick={() => onSet([])}>
						Clear
					</Button>
				)}
			</div>
		</div>

		<div {...stylex.props(surfaces.glassCard, styles.roster)}>
			{users.length === 0 && <p {...stylex.props(styles.empty)}>No accounts yet.</p>}

			{users.map(candidate => (
				<label key={candidate.uid} {...stylex.props(styles.person)}>
					<input
						type='checkbox'
						{...stylex.props(styles.tick)}
						checked={selected.has(candidate.uid)}
						onChange={() => onToggle(candidate.uid)}
					/>
					<Avatar displayName={candidate.displayName} photoURL={candidate.photoURL} size='sm' />
					<span {...stylex.props(styles.personName, utils.truncate)}>{candidate.displayName}</span>
				</label>
			))}
		</div>
	</div>
);

/** Who the last send reached, and why it missed anybody it missed. */
const EmailOutcome = ({ result }: { result: TestEmailResult | null }) => {
	if (!result) return null;

	return (
		<div {...stylex.props(styles.outcome)}>
			<p {...stylex.props(styles.rowTitle)}>{result.payload.title}</p>
			<p {...stylex.props(styles.quote)}>{result.payload.body}</p>

			<ul {...stylex.props(styles.outcomes)}>
				{result.results.map((outcome: EmailTestOutcome) => (
					<li key={outcome.uid} {...stylex.props(styles.outcomeRow)}>
						<span {...stylex.props(styles.outcomeName, utils.truncate)}>{outcome.displayName}</span>
						<StatusPill tone={STATUS_TONE[outcome.status]}>{STATUS_LABEL[outcome.status]}</StatusPill>
					</li>
				))}
			</ul>
		</div>
	);
};

/**
 * The one send on this screen that reaches somebody other than the person
 * tapping it, which is why it asks first: a real email, right now, to a real
 * inbox, not a preview.
 */
const useEmailTest = (target: Target | undefined) => {
	const { notify, warn } = useToast();
	const confirm = useConfirm();
	const [result, setResult] = useState<TestEmailResult | null>(null);

	const sendTo = async (kind: AnyNotification, uids: string[]) => {
		if (uids.length === 0) return;

		const ok = await confirm({
			title: `Email ${counted(uids.length, 'person', 'people')}?`,
			message: 'This sends a real email right now, to their real inbox, not a preview.',
			confirmLabel: 'Send',
		});

		if (!ok) return;

		try {
			const sent = await sendTestEmail(kind, uids, target);

			setResult(sent);

			if (sent.sent > 0) notify(`Emailed ${sent.sent} of ${uids.length}.`);
			else warn('Nobody selected could be emailed, see the reasons below.');
		} catch (error) {
			console.error('Could not send the test email', error);
			warn(error instanceof Error ? error.message : "Couldn't send that email.");
		}
	};

	return { result, sendTo };
};

/**
 * Emailing real people.
 *
 * Unlike everything above, this reaches accounts other than your own, through
 * the same fallback transport a genuine send would use, so it proves delivery
 * and rendering rather than just the copy.
 */
const EmailCard = ({
	target,
	users,
	silentUids,
	showSilent,
}: {
	target: Target | undefined;
	users: AppUser[];
	silentUids: string[];
	showSilent: boolean;
}) => {
	const { result, sendTo } = useEmailTest(target);
	const [kind, setKind] = useState<AnyNotification>('reminder');
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const toggle = (uid: string) =>
		setSelected(previous => {
			const next = new Set(previous);

			if (next.has(uid)) next.delete(uid);
			else next.add(uid);

			return next;
		});

	return (
		<section {...stylex.props(surfaces.glass, styles.card, styles.stack)}>
			<div {...stylex.props(styles.head, styles.headTight)}>
				<EnvelopeIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
				<h2 {...stylex.props(styles.title)}>Email a selection of people</h2>
			</div>

			<p {...stylex.props(styles.body)}>
				Unlike everything above, this reaches real accounts other than your own, through the same fallback
				transport a genuine send would use, so it proves delivery and rendering, not just the copy.
			</p>

			<Field label='Kind'>
				<Select value={kind} onChange={event => setKind(event.target.value as AnyNotification)}>
					{NOTIFICATIONS.map(candidate => (
						<option key={candidate} value={candidate}>
							{titleFor(candidate)}
						</option>
					))}
				</Select>
			</Field>

			<RecipientPicker
				users={users}
				selected={selected}
				silentUids={silentUids}
				showSilent={showSilent}
				onToggle={toggle}
				onSet={uids => setSelected(new Set(uids))}
			/>

			<Button
				variant='primary'
				fullWidth
				disabled={selected.size === 0}
				onClick={() => sendTo(kind, Array.from(selected))}
			>
				{/* The count is hidden at zero rather than rendered as "0 people". The
				    button is disabled there, and "Email people" is the label for a
				    control you have not picked anybody for yet. */}
				Email {selected.size > 0 && selected.size} {plural(selected.size, 'person', 'people')}
			</Button>

			<EmailOutcome result={result} />
		</section>
	);
};

const DebugPage = () => {
	const { user } = useAuth();
	const { users } = useUsers();
	const { support, enabled } = usePushRegistration(user?.uid);
	const { seasons, seasonId, season, games, gameId, target, setChosenSeason, setChosenGame } = useDebugTarget();
	const { responses } = useResponses(seasonId, gameId);

	// Who a real reminder would actually nudge for this game, the quick way into
	// "email exactly the people who haven't answered" without hand-picking them
	// from the full roster.
	const silentUids = useMemo(() => (season ? getSilentMembers(season, responses) : []), [season, responses]);

	if (!user?.isAppAdmin) {
		return (
			<AppAdminOnly
				title='Debug'
				message='This screen sends real notifications, so it stays behind the global role.'
			/>
		);
	}

	return (
		<PageShell title='Debug' subtitle='Notifications, payments, and breaking things on purpose' backHref='/me'>
			<div {...stylex.props(styles.page)}>
				<DeviceCard support={support} enabled={enabled} />

				<TargetCard
					seasons={seasons}
					season={season}
					seasonId={seasonId}
					games={games}
					gameId={gameId}
					onSeason={setChosenSeason}
					onGame={setChosenGame}
				/>

				<SendOneCard target={target} />

				<EmailCard
					target={target}
					users={users}
					silentUids={silentUids}
					showSilent={Boolean(gameId) && silentUids.length > 0}
				/>

				<PaymentTriggers season={season} displayName={user.displayName} />

				<ErrorTriggers />
			</div>
		</PageShell>
	);
};

export default DebugPage;
