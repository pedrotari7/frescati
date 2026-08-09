'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellAlertIcon } from '@heroicons/react/24/outline';
import type { AppNotification, GameNotification, PushPayload } from '@shared/notifications';
import { NOTIFICATIONS, buildGamePush, buildNewPlayerPush } from '@shared/notifications';
import { formatGameWhen } from '@shared/format';
import { useAuth } from '../../../lib/auth';
import { checkPushSupport, isPushEnabled } from '../../../lib/push';
import type { PushSupport } from '../../../lib/push';
import { sendTestPush } from '../../../lib/db/testPush';
import { useGames, useSeasons } from '../../../hooks/useData';
import { useToast } from '../../../components/Toast';
import PageShell from '../../../components/PageShell';
import EmptyState from '../../../components/EmptyState';
import Button from '../../../components/Button';
import StatusPill from '../../../components/StatusPill';
import { Field, Select } from '../../../components/Field';

/**
 * Fires each of the app's real notifications at your own devices.
 *
 * Exists because push is the one thing in here that can't be exercised locally:
 * Firebase has no Cloud Messaging emulator, so a notification only becomes real
 * once the backend asks FCM for it. Staging the events by hand is worse than it
 * sounds — `atRisk` fires on an edge only somebody *else's* response can cross,
 * and reminders are an hourly sweep that records each window as sent forever.
 *
 * The copy comes back from the function rather than being composed here, so
 * what this screen shows is what was sent.
 */

/**
 * The title alone, for the row that hasn't been sent yet. Read off the real
 * builder rather than retyped — none of the titles interpolate, so an empty
 * context gives the exact string, and one that starts to will still render
 * something rather than quietly drifting from what gets sent.
 */
const titleFor = (kind: GameNotification | AppNotification) =>
	kind === 'newPlayer'
		? buildNewPlayerPush({ uid: '', displayName: '' }).title
		: buildGamePush(kind, { when: '', url: '', gameId: '' }).title;

const DESCRIPTIONS: Record<GameNotification | AppNotification, string> = {
	reminder: "The nudge before a game. Really goes to members who haven't answered yet.",
	atRisk: 'Sent once, the moment a game first drops below its minimum.',
	cancelled: 'Really goes to everyone who answered, either way.',
	restored: 'Really goes to every member of the season.',
	kickoffMoved: "Really goes to everyone who said they're in.",
	newPlayer: 'Really goes to every app admin, once, when somebody first signs in. Sends as if you had just joined.',
};

const DebugPage = () => {
	const { user } = useAuth();
	const { notify, warn } = useToast();
	const { seasons } = useSeasons();

	const [support, setSupport] = useState<PushSupport | null>(null);
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [chosenSeason, setChosenSeason] = useState<string | null>(null);
	const [chosenGame, setChosenGame] = useState<string | null>(null);
	const [sentPayloads, setSentPayloads] = useState<Partial<Record<GameNotification | AppNotification, PushPayload>>>(
		{}
	);

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
	// previous one selected — which would send a notification deep-linking
	// somewhere the picker isn't pointing.
	const gameId = chosenGame && byKickoff.some(game => game.id === chosenGame) ? chosenGame : defaultGameId;

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
			<PageShell title='Push debug' backHref='/me'>
				<EmptyState
					title='App admins only'
					message='This screen sends real notifications, so it stays behind the global role.'
				/>
			</PageShell>
		);
	}

	const season = seasons.find(candidate => candidate.id === seasonId) ?? null;

	const send = async (kind: GameNotification | AppNotification) => {
		try {
			const result = await sendTestPush(kind, seasonId && gameId ? { seasonId, gameId } : undefined);

			setSentPayloads(previous => ({ ...previous, [kind]: result.payload }));

			// Every one of these is invisible from the phone, and they look
			// identical from here — nothing arrives. Saying which it was is the
			// entire point of the screen.
			if (result.sent > 0) {
				notify(`Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}.`);
			} else if (result.emailed > 0) {
				// Checked before the two push failures below, because when the
				// fallback caught it neither of them is what happened.
				notify('No device could be reached, so it went to your email instead.');
			} else if (!result.prefEnabled) {
				// Ahead of the device count, unlike `getPushReach` — that
				// summarises whether somebody is reachable at all, where the
				// missing device is the root cause. This reports one send, and
				// the preference is what short-circuited it, before either
				// channel was consulted.
				warn('That kind is switched off in your notification preferences.');
			} else if (result.devices === 0) {
				warn('No registered devices, and no email went out either. Check the email fallback is configured.');
			} else {
				warn('FCM accepted none of your tokens — they are stale. Turn notifications off and on again.');
			}
		} catch (error) {
			console.error('Could not send the test notification', error);
			warn(error instanceof Error ? error.message : "Couldn't send that notification.");
		}
	};

	return (
		<PageShell title='Push debug' subtitle='Sends to your devices only' backHref='/me'>
			<div className='space-y-4 p-4'>
				<section className='glass rounded-2xl p-5'>
					<div className='mb-3 flex items-center gap-2'>
						<BellAlertIcon className='text-muted size-5' aria-hidden='true' />
						<h2 className='text-ink font-semibold'>This device</h2>
					</div>

					<div className='flex flex-wrap items-center gap-2'>
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
						<p className='text-muted mt-3 text-sm leading-relaxed'>
							Turn notifications on from the You screen, then come back — sends will report zero devices
							until this browser holds a token.
						</p>
					)}

					<p className='text-faint mt-3 text-xs leading-relaxed'>
						Anything sent here goes only to accounts you are signed in as, on every device you have
						registered. To test how the notification renders without involving FCM at all, use the Push box
						in DevTools under Application → Service Workers.
					</p>
				</section>

				<section className='glass space-y-4 rounded-2xl p-5'>
					<h2 className='text-ink font-semibold'>Target game</h2>

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
						<p className='text-pending text-sm leading-relaxed'>
							Without a game these send a sample payload linking to the season list. Pick one to test the
							deep link.
						</p>
					)}
				</section>

				<section className='glass rounded-2xl p-5'>
					<h2 className='text-ink mb-1 font-semibold'>Send one</h2>
					<p className='text-muted mb-4 text-sm leading-relaxed'>
						The same payload the real trigger builds, through the same preferences check. Sending does not
						change any game.
					</p>

					<div className='divide-y divide-white/5 border-t border-white/5'>
						{NOTIFICATIONS.map(kind => {
							const payload = sentPayloads[kind];

							return (
								<div key={kind} className='flex flex-wrap items-center gap-3 py-4'>
									<div className='min-w-40 flex-1'>
										<p className='text-ink text-sm font-medium'>
											{payload?.title ?? titleFor(kind)}
										</p>
										<p className='text-faint mt-0.5 text-xs leading-relaxed'>
											{DESCRIPTIONS[kind]}
										</p>

										{/* What actually went out, straight from the
										    function — not a preview built here. */}
										{payload && (
											<p className='text-muted mt-2 border-l-2 border-white/10 pl-2 text-xs leading-relaxed'>
												{payload.body}
											</p>
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
			</div>
		</PageShell>
	);
};

export default DebugPage;
