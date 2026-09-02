'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellAlertIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AnyNotification, PushPayload } from '@shared/notifications';
import { NOTIFICATIONS, buildDuesPush, buildGamePush, buildNewPlayerPush } from '@shared/notifications';
import { getSilentMembers } from '@shared/game';
import { SAMPLE_DEBT } from '@shared/debug';
import { counted, formatGameWhen, plural } from '@shared/format';
import { useAuth } from '../../../lib/auth';
import { checkPushSupport, isPushEnabled } from '../../../lib/push';
import type { PushSupport } from '../../../lib/push';
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
 * `duesReminder` is the first title that interpolates. An empty context still
 * renders, it just renders `0 kr`, so this one gets `SAMPLE_DEBT`, the same
 * figures `buildTestPayload` sends with. Otherwise the row would relabel itself
 * the moment a send came back.
 */
const titleFor = (kind: AnyNotification) => {
	if (kind === 'newPlayer') return buildNewPlayerPush({ uid: '', displayName: '', seasonId: null }).title;

	if (kind === 'duesReminder') {
		return buildDuesPush({ seasonId: '', seasonName: '', ...SAMPLE_DEBT, blocked: true }).title;
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
};

const STATUS_TONE: Record<EmailTestStatus, PillTone> = { sent: 'in', noAddress: 'out', emailOff: 'neutral' };

const STATUS_LABEL: Record<EmailTestStatus, string> = {
	sent: 'Emailed',
	noAddress: 'No address',
	emailOff: 'Email off',
};

const DebugPage = () => {
	const { user } = useAuth();
	const { notify, warn } = useToast();
	const confirm = useConfirm();
	const { seasons } = useSeasons();
	const { users } = useUsers();

	const [support, setSupport] = useState<PushSupport | null>(null);
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [chosenSeason, setChosenSeason] = useState<string | null>(null);
	const [chosenGame, setChosenGame] = useState<string | null>(null);
	const [sentPayloads, setSentPayloads] = useState<Partial<Record<AnyNotification, PushPayload>>>({});
	const [emailKind, setEmailKind] = useState<AnyNotification>('reminder');
	const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
	const [emailResult, setEmailResult] = useState<TestEmailResult | null>(null);

	// Fall back to the first season rather than holding the selection in an
	// effect: the list arrives after the first render, and syncing it back into
	// state means a frame where nothing is selected.
	const seasonId = chosenSeason ?? seasons[0]?.id ?? null;
	const { games } = useGames(seasonId);

	const byKickoff = useMemo(() => [...games].sort((a, b) => a.kickoffMillis - b.kickoffMillis), [games]);

	// The next game is the one whose notifications are worth looking at. Falling
	// back to the last means a finished season still gives a real deep link.
	const defaultGameId = useMemo(() => {
		const now = Date.now();

		return (byKickoff.find(game => game.kickoffMillis >= now) ?? byKickoff[byKickoff.length - 1])?.id ?? null;
	}, [byKickoff]);

	// Derived, not stored, so switching season can't leave a game id from the
	// previous one selected, which would send a notification deep-linking
	// somewhere the picker isn't pointing.
	const gameId = chosenGame && byKickoff.some(game => game.id === chosenGame) ? chosenGame : defaultGameId;

	// What both send buttons aim at. The season travels on its own when there is
	// no game to name, because `duesReminder` is about a season rather than a
	// game and a season with no games generated yet would otherwise be told to
	// pick one. The game kinds fall back to their stand-in context, as they
	// already do when nothing is picked at all.
	const target = seasonId ? { seasonId, gameId: gameId ?? undefined } : undefined;

	const season = seasons.find(candidate => candidate.id === seasonId) ?? null;
	const { responses } = useResponses(seasonId, gameId);

	// Who a real reminder would actually nudge for this game, the quick way
	// into "email exactly the people who haven't answered" without hand-picking
	// them from the full roster.
	const silentUids = useMemo(() => (season ? getSilentMembers(season, responses) : []), [season, responses]);

	const uid = user?.uid;

	useEffect(() => {
		checkPushSupport().then(setSupport);
	}, []);

	useEffect(() => {
		if (!uid) return;

		let cancelled = false;
		isPushEnabled(uid).then(on => {
			if (!cancelled) setEnabled(on);
		});

		return () => {
			cancelled = true;
		};
	}, [uid]);

	if (!user?.isAppAdmin) {
		return (
			<AppAdminOnly
				title='Debug'
				message='This screen sends real notifications, so it stays behind the global role.'
			/>
		);
	}

	const send = async (kind: AnyNotification) => {
		try {
			const result = await sendTestPush(kind, target);

			setSentPayloads(previous => ({ ...previous, [kind]: result.payload }));

			// Every one of these is invisible from the phone, and they look
			// identical from here, nothing arrives. Saying which it was is the
			// entire point of the screen.
			if (result.sent > 0) {
				notify(`Sent to ${counted(result.sent, 'device')}.`);
			} else if (result.emailed > 0) {
				// Checked before the two push failures below, because when the
				// fallback caught it neither of them is what happened.
				notify('No device could be reached, so it went to your email instead.');
			} else if (!result.prefEnabled) {
				// Ahead of the device count, unlike `getPushReach`. That
				// summarises whether somebody is reachable at all, where the
				// missing device is the root cause. This reports one send, and
				// the preference is what short-circuited it, before either
				// channel was consulted.
				warn('That kind is switched off in your notification preferences.');
			} else if (result.devices === 0) {
				warn('No registered devices, and no email went out either. Check the email fallback is configured.');
			} else {
				warn('FCM accepted none of your tokens. They are stale, turn notifications off and on again.');
			}
		} catch (error) {
			console.error('Could not send the test notification', error);
			warn(error instanceof Error ? error.message : "Couldn't send that notification.");
		}
	};

	const toggleRecipient = (target: string) =>
		setSelectedUids(previous => {
			const next = new Set(previous);
			if (next.has(target)) next.delete(target);
			else next.add(target);
			return next;
		});

	const sendEmailTest = async () => {
		const uids = Array.from(selectedUids);
		if (uids.length === 0) return;

		// The one send on this screen that reaches somebody other than the
		// person tapping it, worth a second tap before it actually goes.
		const ok = await confirm({
			title: `Email ${counted(uids.length, 'person', 'people')}?`,
			message: 'This sends a real email right now, to their real inbox, not a preview.',
			confirmLabel: 'Send',
		});
		if (!ok) return;

		try {
			const result = await sendTestEmail(emailKind, uids, target);

			setEmailResult(result);

			if (result.sent > 0) {
				notify(`Emailed ${result.sent} of ${uids.length}.`);
			} else {
				warn('Nobody selected could be emailed, see the reasons below.');
			}
		} catch (error) {
			console.error('Could not send the test email', error);
			warn(error instanceof Error ? error.message : "Couldn't send that email.");
		}
	};

	return (
		<PageShell title='Debug' subtitle='Notifications, payments, and breaking things on purpose' backHref='/me'>
			<div {...stylex.props(styles.page)}>
				<section {...stylex.props(surfaces.glass, styles.card)}>
					<div {...stylex.props(styles.head, styles.headGap)}>
						<BellAlertIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
						<h2 {...stylex.props(styles.title)}>This device</h2>
					</div>

					<div {...stylex.props(styles.pills)}>
						{support === null && <StatusPill tone='neutral'>Checking…</StatusPill>}
						{support === 'needs-install' && (
							<StatusPill tone='pending'>Add to home screen first</StatusPill>
						)}
						{support === 'unsupported' && <StatusPill tone='out'>Browser can&apos;t do push</StatusPill>}
						{support === 'supported' && enabled === true && <StatusPill tone='in'>Registered</StatusPill>}
						{support === 'supported' && enabled === false && (
							<StatusPill tone='out'>Not registered</StatusPill>
						)}
					</div>

					{support === 'supported' && enabled === false && (
						<p {...stylex.props(styles.body, styles.bodyGap)}>
							Turn notifications on from the You screen, then come back. Sends will report zero devices
							until this browser holds a token.
						</p>
					)}

					<p {...stylex.props(styles.note)}>
						Anything sent here goes only to accounts you are signed in as, on every device you have
						registered. To test how the notification renders without involving FCM at all, use the Push box
						in DevTools under Application → Service Workers.
					</p>
				</section>

				<section {...stylex.props(surfaces.glass, styles.card, styles.stack)}>
					{/* Both, since the payments panel below reads the season's fees off
					    the same selection the notifications deep-link into. */}
					<h2 {...stylex.props(styles.title)}>Target season and game</h2>

					<Field label='Season'>
						<Select value={seasonId ?? ''} onChange={event => setChosenSeason(event.target.value)}>
							{seasons.length === 0 && <option value=''>No seasons yet</option>}
							{seasons.map(candidate => (
								<option key={candidate.id} value={candidate.id}>
									{candidate.name}
								</option>
							))}
						</Select>
					</Field>

					<Field label='Game' hint='The notification deep-links here, so tapping it lands on a real game.'>
						<Select
							value={gameId ?? ''}
							onChange={event => setChosenGame(event.target.value)}
							disabled={byKickoff.length === 0}
						>
							{byKickoff.length === 0 && <option value=''>No games in this season</option>}
							{byKickoff.map(game => (
								<option key={game.id} value={game.id}>
									{season ? formatGameWhen(game.kickoff, season.slot.timezone) : game.kickoff}
									{game.status === 'cancelled' ? ' · cancelled' : ''}
								</option>
							))}
						</Select>
					</Field>

					{!gameId && (
						<p {...stylex.props(styles.warn)}>
							Without a game these send a sample payload linking to the season list. Pick one to test the
							deep link.
						</p>
					)}
				</section>

				<section {...stylex.props(surfaces.glass, styles.card)}>
					<h2 {...stylex.props(styles.title, styles.titleGap)}>Send one</h2>
					<p {...stylex.props(styles.lead)}>
						The same payload the real trigger builds, through the same preferences check. Sending does not
						change any game.
					</p>

					<div>
						{NOTIFICATIONS.map(kind => {
							const payload = sentPayloads[kind];

							return (
								<div key={kind} {...stylex.props(styles.row)}>
									<div {...stylex.props(styles.rowBody)}>
										<p {...stylex.props(styles.rowTitle)}>{payload?.title ?? titleFor(kind)}</p>
										<p {...stylex.props(styles.rowNote)}>{DESCRIPTIONS[kind]}</p>

										{/* What actually went out, straight from the
										    function, not a preview built here. */}
										{payload && (
											<p {...stylex.props(styles.quote, styles.quoteGap)}>{payload.body}</p>
										)}
									</div>

									<Button size='sm' variant='secondary' onClick={() => send(kind)}>
										Send
									</Button>
								</div>
							);
						})}
					</div>
				</section>

				<section {...stylex.props(surfaces.glass, styles.card, styles.stack)}>
					<div {...stylex.props(styles.head, styles.headTight)}>
						<EnvelopeIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
						<h2 {...stylex.props(styles.title)}>Email a selection of people</h2>
					</div>

					<p {...stylex.props(styles.body)}>
						Unlike everything above, this reaches real accounts other than your own, through the same
						fallback transport a genuine send would use, so it proves delivery and rendering, not just the
						copy.
					</p>

					<Field label='Kind'>
						<Select
							value={emailKind}
							onChange={event => setEmailKind(event.target.value as AnyNotification)}
						>
							{NOTIFICATIONS.map(kind => (
								<option key={kind} value={kind}>
									{titleFor(kind)}
								</option>
							))}
						</Select>
					</Field>

					<div>
						<div {...stylex.props(styles.pickerHead)}>
							<span {...stylex.props(styles.pickerLabel)}>Recipients</span>

							<div {...stylex.props(styles.pickerActions)}>
								{gameId && silentUids.length > 0 && (
									<Button
										size='sm'
										variant='ghost'
										onClick={() => setSelectedUids(new Set(silentUids))}
									>
										Hasn&apos;t answered ({silentUids.length})
									</Button>
								)}
								{selectedUids.size > 0 && (
									<Button size='sm' variant='ghost' onClick={() => setSelectedUids(new Set())}>
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
										checked={selectedUids.has(candidate.uid)}
										onChange={() => toggleRecipient(candidate.uid)}
									/>
									<Avatar
										displayName={candidate.displayName}
										photoURL={candidate.photoURL}
										size='sm'
									/>
									<span {...stylex.props(styles.personName, utils.truncate)}>
										{candidate.displayName}
									</span>
								</label>
							))}
						</div>
					</div>

					<Button variant='primary' fullWidth disabled={selectedUids.size === 0} onClick={sendEmailTest}>
						{/* The count is hidden at zero rather than rendered as "0 people".
						    the button is disabled there, and "Email people" is the label
						    for a control you haven't picked anybody for yet. */}
						Email {selectedUids.size > 0 && selectedUids.size}{' '}
						{plural(selectedUids.size, 'person', 'people')}
					</Button>

					{emailResult && (
						<div {...stylex.props(styles.outcome)}>
							<p {...stylex.props(styles.rowTitle)}>{emailResult.payload.title}</p>
							<p {...stylex.props(styles.quote)}>{emailResult.payload.body}</p>

							<ul {...stylex.props(styles.outcomes)}>
								{emailResult.results.map((outcome: EmailTestOutcome) => (
									<li key={outcome.uid} {...stylex.props(styles.outcomeRow)}>
										<span {...stylex.props(styles.outcomeName, utils.truncate)}>
											{outcome.displayName}
										</span>
										<StatusPill tone={STATUS_TONE[outcome.status]}>
											{STATUS_LABEL[outcome.status]}
										</StatusPill>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>

				<PaymentTriggers season={season} displayName={user.displayName} />

				<ErrorTriggers />
			</div>
		</PageShell>
	);
};

export default DebugPage;
