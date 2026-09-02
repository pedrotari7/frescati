'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDaysIcon, CalendarIcon, UsersIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { SeasonStatus, Venue, Weekday } from '@shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '@shared/types';
import { SEASON_STATUS_LABELS, formatSek, weekdayName } from '@shared/format';
import { entryShare } from '@shared/finances';
import { parseReminderHours } from '@shared/game';
import { useAuth } from '../../../../../lib/auth';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useWrite } from '../../../../../hooks/useWrite';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import { useToast } from '../../../../../components/Toast';
import { deleteSeason, updateSeason } from '../../../../../lib/db/seasons';
import { updateVenueForUpcomingGames } from '../../../../../lib/db/games';
import SeasonShell from '../../../../../components/SeasonShell';
import CalendarSubscribeSheet from '../../../../../components/CalendarSubscribeSheet';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Button from '../../../../../components/Button';
import DatePicker from '../../../../../components/DatePicker';
import { Field, RangeInput, Select, TextInput } from '../../../../../components/Field';
import { EMPTY_FORM, INVALID_COUNT, formFromSeason, readCounts, sameForm } from '../../../../../lib/seasonForm';
import type { SeasonForm } from '../../../../../lib/seasonForm';
import { colors, tint } from '../../../../tokens.stylex';
import { surfaces } from '../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },

	/* The three shortcuts off the top of the screen. Two across at every width,
	   with the calendar link taking a row of its own, because its one line of
	   explanation is longer than the two above it put together. */
	tiles: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },
	tile: { borderRadius: 16, padding: 16 },
	/*
	 * The one tile that is a button rather than a link. `appearance: none` and
	 * the inherited font are what stop it looking like a form control next to
	 * the two links; the border and the background come from `glassCard`, so
	 * this must not touch either.
	 */
	tileButton: {
		appearance: 'none',
		gridColumn: 'span 2',
		color: 'inherit',
		fontFamily: 'inherit',
		textAlign: 'left',
		cursor: 'pointer',
	},
	tileIcon: { color: colors.brand, marginBottom: 8, width: 24, height: 24 },
	tileTitle: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	small: { color: colors.faint, fontSize: 12, lineHeight: '16px' },

	card: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 20 },
	cardTight: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16, padding: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },

	/* Two across even on the narrowest phone: these are the pairs read as one
	   question, day and kick-off, start and end, and the controls are a time, a
	   date and a two-digit number. Same call as the new-season form. */
	pair: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },

	/* A rule and a subheading, for the two groups of settings that are their own
	   subject rather than another field. */
	block: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: tint.white8, paddingTop: 16 },
	blockTitle: { color: colors.ink, marginBottom: 4, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	blockNote: { color: colors.faint, marginBottom: 16, fontSize: 12, lineHeight: '16px' },
	stack: { display: 'flex', flexDirection: 'column', gap: 16 },

	stale: {
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.pending25,
		backgroundColor: tint.pending8,
		borderRadius: 12,
		padding: 12,
	},
	staleBody: { color: colors.muted, fontSize: 14, lineHeight: 1.625 },
	staleAction: { marginTop: 12 },

	error: { color: colors.out, fontSize: 14, lineHeight: '20px' },
});

const SeasonAdminPage = () => {
	const router = useRouter();
	const { user } = useAuth();
	const { seasonId, season, games, loading, error, retry, isAdmin } = useSeasonContext();
	const write = useWrite();
	const confirm = useConfirm();
	const { notify } = useToast();

	const [form, setForm] = useState<SeasonForm>(EMPTY_FORM);
	const [countError, setCountError] = useState<string | null>(null);
	const [subscribeOpen, setSubscribeOpen] = useState(false);

	// Seasons created before teams existed carry no levers at all, so the
	// defaults stand in rather than the form seeding itself with zeroes.
	const balance = useMemo(() => ({ ...DEFAULT_BALANCE_SETTINGS, ...season?.balance }), [season]);

	const live = useMemo(() => (season ? formFromSeason(season, balance) : null), [season, balance]);

	/**
	 * What the form was last filled from, on arrival, and again on a save.
	 *
	 * Anything the stored season now says that differs from this is somebody
	 * else's edit rather than one of ours, which is the only way to tell those
	 * two apart and the reason this is kept at all.
	 */
	const baseline = useRef<SeasonForm | null>(null);
	const seededFor = useRef<string | null>(null);

	/**
	 * Seeded once per season, not on every snapshot.
	 *
	 * This was keyed on the season itself, which meant it re-ran whenever the
	 * document changed, and this screen is live for every admin at once. So a
	 * second admin touching the venue overwrote all nineteen fields under
	 * whoever was mid-sentence in the first, not just the one they had moved.
	 * Two admins on a Sunday evening is not a hypothetical.
	 *
	 * `live` moving is now reported rather than applied. See `changedElsewhere`
	 * below.
	 */
	useEffect(() => {
		if (!season || !live || seededFor.current === season.id) return;

		seededFor.current = season.id;
		baseline.current = live;
		setForm(live);
	}, [season, live]);

	if (loading) {
		return (
			<SeasonShell title='Admin' backHref={`/s/${seasonId}`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Admin' backHref={`/s/${seasonId}`}>
				<LoadFailed what='this season' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Admin' backHref={`/s/${seasonId}`}>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	if (!isAdmin) {
		return (
			<SeasonShell title='Admin' backHref={`/s/${seasonId}`}>
				<EmptyState title='Admins only' message='Ask a season admin if you need something changed.' />
			</SeasonShell>
		);
	}

	// Save refuses on any box that doesn't hold a whole number and says which,
	// better than writing a season with `minPlayers: 0`, in which no game can
	// ever be short.
	const { counts, invalid } = readCounts(form);

	// What the bill on the form would come to per person, said out loud, because
	// nobody types a total and does the division in their head. An empty squad is
	// its own sentence rather than a share of nothing: the bill is real, there is
	// just nobody to split it between yet.
	const describeShare =
		season.memberUids.length === 0
			? 'Nobody in the squad to split it between yet.'
			: `${formatSek(entryShare(counts.seasonCost ?? 0, season.memberUids.length))} each across ${season.memberUids.length} ${season.memberUids.length === 1 ? 'member' : 'members'}.`;

	// The stored season has moved since this form was filled from it. Compared
	// against the baseline rather than against `form`, which would also be true
	// of every character this admin has typed.
	const changedElsewhere = !!live && !!baseline.current && !sameForm(live, baseline.current);

	const handleSave = async () => {
		if (invalid) {
			setCountError(INVALID_COUNT[invalid]);
			return;
		}

		setCountError(null);

		const venue: Venue = {
			name: form.venueName.trim(),
			...(form.venueAddress.trim() ? { address: form.venueAddress.trim() } : {}),
		};
		const venueChanged = venue.name !== season.venue.name || (venue.address ?? '') !== (season.venue.address ?? '');

		// Only claim it saved if it did. This used to say "Saved" whether or not
		// the write was accepted.
		const ok = await write(async () => {
			await updateSeason(seasonId, {
				name: form.name.trim(),
				status: form.status,
				venue,
				slot: {
					weekday: form.weekday,
					time: form.time,
					durationMinutes: counts.durationMinutes!,
					timezone: season.slot.timezone,
				},
				startDate: form.startDate,
				endDate: form.endDate,
				minPlayers: counts.minPlayers!,
				responseDeadlineHours: counts.responseDeadlineHours!,
				reminderHours: parseReminderHours(form.reminderHours),
				balance: {
					matchMinutes: counts.matchMinutes!,
					randomness: Number(form.randomness) / 100,
					repeatPenalty: Number(form.repeatPenalty) / 100,
					repeatLookback: counts.repeatLookback!,
				},
				// A nested map like `balance`, and written whole for the same
				// reason: the rules check the shape of `fees` as one object, so a
				// partial write would have to satisfy a check over fields it is
				// not sending. `swish` is left off rather than written empty,
				// since an empty string is a number the payment screen would try
				// to build a QR code out of.
				fees: {
					total: counts.seasonCost!,
					perGame: counts.perGameFee!,
					...(form.swish.trim() ? { swish: form.swish.trim() } : {}),
				},
			});

			if (venueChanged) {
				await updateVenueForUpcomingGames(seasonId, games, venue);
			}
		}, "Couldn't save the season settings.");

		if (!ok) return;

		// Our own write comes back down the listener like anybody else's would,
		// so the baseline has to move with it or the notice below would announce
		// the change this admin just made.
		baseline.current = form;

		notify('Season settings saved.');
	};

	const handleDelete = async () => {
		const ok = await confirm({
			title: `Delete ${season.name}?`,
			message:
				"Every game, response and tournament result in this season goes with it, and this can't be undone.",
			confirmLabel: 'Delete season',
			tone: 'danger',
		});

		if (!ok) return;

		const done = await write(() => deleteSeason(seasonId), "Couldn't delete this season.");

		if (done) router.replace('/seasons?browse=1');
	};

	return (
		<>
			<SeasonShell title='Admin' subtitle={season.name} backHref={`/s/${seasonId}`}>
				<div {...stylex.props(styles.page)}>
					<div {...stylex.props(styles.tiles)}>
						<Link href={`/s/${seasonId}/admin/members`} {...stylex.props(surfaces.glassCard, styles.tile)}>
							<UsersIcon {...stylex.props(styles.tileIcon)} aria-hidden='true' />
							<p {...stylex.props(styles.tileTitle)}>Squad</p>
							<p {...stylex.props(styles.small)}>{season.memberUids.length} players</p>
						</Link>

						<Link href={`/s/${seasonId}/admin/games`} {...stylex.props(surfaces.glassCard, styles.tile)}>
							<CalendarDaysIcon {...stylex.props(styles.tileIcon)} aria-hidden='true' />
							<p {...stylex.props(styles.tileTitle)}>Games</p>
							<p {...stylex.props(styles.small)}>Generate &amp; edit</p>
						</Link>

						<button
							type='button'
							onClick={() => setSubscribeOpen(true)}
							{...stylex.props(surfaces.glassCard, styles.tile, styles.tileButton)}
						>
							<CalendarIcon {...stylex.props(styles.tileIcon)} aria-hidden='true' />
							<p {...stylex.props(styles.tileTitle)}>Calendar link</p>
							<p {...stylex.props(styles.small)}>Get or rotate the season&apos;s subscribe link</p>
						</button>
					</div>

					<section {...stylex.props(surfaces.glass, styles.card)}>
						<h2 {...stylex.props(styles.title)}>Season settings</h2>

						<Field label='Name'>
							<TextInput value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
						</Field>

						<Field label='Status' hint='Archived seasons stay readable but drop off the main list.'>
							<Select
								value={form.status}
								onChange={e => setForm({ ...form, status: e.target.value as SeasonStatus })}
							>
								{(Object.keys(SEASON_STATUS_LABELS) as SeasonStatus[]).map(status => (
									<option key={status} value={status}>
										{SEASON_STATUS_LABELS[status]}
									</option>
								))}
							</Select>
						</Field>

						<Field label='Venue'>
							<TextInput
								value={form.venueName}
								onChange={e => setForm({ ...form, venueName: e.target.value })}
							/>
						</Field>

						<Field label='Address' hint='Optional, shown on the game screen.'>
							<TextInput
								value={form.venueAddress}
								onChange={e => setForm({ ...form, venueAddress: e.target.value })}
							/>
						</Field>

						<div {...stylex.props(styles.pair)}>
							<Field label='Day'>
								<Select
									value={form.weekday}
									onChange={e => setForm({ ...form, weekday: Number(e.target.value) as Weekday })}
								>
									{[1, 2, 3, 4, 5, 6, 0].map(day => (
										<option key={day} value={day}>
											{weekdayName(day)}
										</option>
									))}
								</Select>
							</Field>

							<Field label='Kick-off'>
								<TextInput
									type='time'
									value={form.time}
									onChange={e => setForm({ ...form, time: e.target.value })}
								/>
							</Field>
						</div>

						<div {...stylex.props(styles.pair)}>
							<Field label='Season starts'>
								<DatePicker
									value={form.startDate}
									onChange={startDate => setForm({ ...form, startDate })}
								/>
							</Field>

							<Field label='Season ends'>
								<DatePicker value={form.endDate} onChange={endDate => setForm({ ...form, endDate })} />
							</Field>
						</div>

						<div {...stylex.props(styles.pair)}>
							<Field label='Slot' hint='Minutes the pitch is booked.'>
								<TextInput
									type='number'
									inputMode='numeric'
									min={1}
									value={form.durationMinutes}
									onChange={e => setForm({ ...form, durationMinutes: e.target.value })}
								/>
							</Field>

							<Field label='Minimum' hint='Below this a game is flagged.'>
								<TextInput
									type='number'
									inputMode='numeric'
									min={1}
									value={form.minPlayers}
									onChange={e => setForm({ ...form, minPlayers: e.target.value })}
								/>
							</Field>
						</div>

						<Field label='Answers close' hint='Hours before kick-off.'>
							<TextInput
								type='number'
								inputMode='numeric'
								min={0}
								value={form.responseDeadlineHours}
								onChange={e => setForm({ ...form, responseDeadlineHours: e.target.value })}
							/>
						</Field>

						<Field
							label='Remind at'
							hint="Hours before kick-off, comma separated. Only members who haven't answered get nudged. Leave empty for no reminders."
						>
							<TextInput
								value={form.reminderHours}
								onChange={e => setForm({ ...form, reminderHours: e.target.value })}
								placeholder='72, 24'
								inputMode='numeric'
							/>
						</Field>

						<div {...stylex.props(styles.block)}>
							<h3 {...stylex.props(styles.blockTitle)}>Team selection</h3>
							<p {...stylex.props(styles.blockNote)}>
								Teams are picked automatically from who is in and re-picked whenever somebody changes
								their answer. These change how.
							</p>

							<div {...stylex.props(styles.stack)}>
								<Field
									label='Match length'
									hint='Minutes per match. The rotation repeats to fill the slot, so shorter matches mean more of them.'
								>
									<TextInput
										type='number'
										inputMode='numeric'
										min={1}
										value={form.matchMinutes}
										onChange={e => setForm({ ...form, matchMinutes: e.target.value })}
									/>
								</Field>

								<Field
									label='Variety'
									hint='At zero the same players get the same teams every week. Higher accepts slightly less even sides in exchange for a fresh mix.'
								>
									<RangeInput
										min={0}
										max={100}
										step={5}
										value={form.randomness}
										valueLabel={`${form.randomness}%`}
										onChange={e => setForm({ ...form, randomness: Number(e.target.value) })}
									/>
								</Field>

								<Field
									label='Split up regulars'
									hint='How hard to avoid pairing players who were teammates recently.'
								>
									<RangeInput
										min={0}
										max={100}
										step={5}
										value={form.repeatPenalty}
										valueLabel={`${form.repeatPenalty}%`}
										onChange={e => setForm({ ...form, repeatPenalty: Number(e.target.value) })}
									/>
								</Field>

								<Field label='Looking back' hint='How many past games count as recent.'>
									<TextInput
										type='number'
										inputMode='numeric'
										min={1}
										value={form.repeatLookback}
										onChange={e => setForm({ ...form, repeatLookback: e.target.value })}
									/>
								</Field>
							</div>
						</div>

						<div {...stylex.props(styles.block)}>
							<h3 {...stylex.props(styles.blockTitle)}>The money</h3>
							<p {...stylex.props(styles.blockNote)}>
								What the season costs and what an extra pays. Who has paid it is on the finances screen.
							</p>

							<div {...stylex.props(styles.stack)}>
								<Field
									label='Season cost'
									hint={`Kronor for the whole season, split equally between the members. ${describeShare}`}
								>
									<TextInput
										type='number'
										inputMode='numeric'
										min={0}
										value={form.seasonCost}
										onChange={e => setForm({ ...form, seasonCost: e.target.value })}
									/>
								</Field>

								<Field
									label="An extra's fee"
									hint='Kronor per game, charged to an extra who was confirmed and turned up. Zero if extras play free.'
								>
									<TextInput
										type='number'
										inputMode='numeric'
										min={0}
										value={form.perGameFee}
										onChange={e => setForm({ ...form, perGameFee: e.target.value })}
									/>
								</Field>

								<Field
									label='Swish number'
									hint='The number that collects. Anybody paying gets a QR code for it with the amount and the reference already filled in.'
								>
									<TextInput
										value={form.swish}
										onChange={e => setForm({ ...form, swish: e.target.value })}
										placeholder='0701234567'
										inputMode='tel'
										maxLength={20}
									/>
								</Field>
							</div>
						</div>

						{/* Seeding once means this form can go stale, so it says so
						    rather than letting an admin save an hour-old copy over
						    somebody else's change without ever knowing. Loading
						    theirs is the same write the seed does, it just takes
						    a deliberate tap now instead of happening under the
						    cursor. */}
						{changedElsewhere && (
							<div {...stylex.props(styles.stale)}>
								<p {...stylex.props(styles.staleBody)}>
									Somebody else has changed these settings since you opened this screen. Saving now
									writes what is on this form over theirs.
								</p>
								<Button
									variant='secondary'
									size='sm'
									sx={styles.staleAction}
									onClick={() => {
										if (!live) return;

										baseline.current = live;
										setForm(live);
									}}
								>
									Load their changes
								</Button>
							</div>
						)}

						{countError && <p {...stylex.props(styles.error)}>{countError}</p>}

						<Button variant='primary' fullWidth onClick={handleSave}>
							Save settings
						</Button>

						<p {...stylex.props(styles.small)}>
							Changing the day or time doesn&apos;t move games that already exist. Regenerate them from
							the Games screen.
						</p>
					</section>

					{/* App-admin only, per the security rules, a season admin can run
				    the season but not erase it. */}
					{user?.isAppAdmin && (
						<section {...stylex.props(surfaces.glass, styles.cardTight)}>
							<h2 {...stylex.props(styles.title)}>Danger zone</h2>
							<p {...stylex.props(styles.small)}>
								Deletes the season and every game, response and tournament result in it. This can&apos;t
								be undone.
							</p>
							<Button variant='danger' fullWidth onClick={handleDelete}>
								Delete season
							</Button>
						</section>
					)}
				</div>
			</SeasonShell>

			<CalendarSubscribeSheet
				seasonId={seasonId}
				open={subscribeOpen}
				onClose={() => setSubscribeOpen(false)}
				canRotate
			/>
		</>
	);
};

export default SeasonAdminPage;
