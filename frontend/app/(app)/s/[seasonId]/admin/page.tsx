'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDaysIcon, CalendarIcon, UsersIcon } from '@heroicons/react/24/outline';
import type { SeasonStatus, Venue, Weekday } from '@shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '@shared/types';
import { weekdayName } from '@shared/format';
import { parseReminderHours } from '@shared/game';
import { useAuth } from '../../../../../lib/auth';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useWrite } from '../../../../../hooks/useWrite';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import { deleteSeason, updateSeason } from '../../../../../lib/db/seasons';
import { updateVenueForUpcomingGames } from '../../../../../lib/db/games';
import SeasonShell from '../../../../../components/SeasonShell';
import CalendarSubscribeSheet from '../../../../../components/CalendarSubscribeSheet';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import Button from '../../../../../components/Button';
import DatePicker from '../../../../../components/DatePicker';
import { Field, RangeInput, Select, TextInput } from '../../../../../components/Field';

const SeasonAdminPage = () => {
	const router = useRouter();
	const { user } = useAuth();
	const { seasonId, season, games, loading, isAdmin } = useSeasonContext();
	const write = useWrite();
	const confirm = useConfirm();

	const [form, setForm] = useState({
		name: '',
		status: 'active' as SeasonStatus,
		venueName: '',
		venueAddress: '',
		weekday: 2 as Weekday,
		time: '19:00',
		durationMinutes: 90,
		startDate: '',
		endDate: '',
		minPlayers: 10,
		responseDeadlineHours: 24,
		reminderHours: '72, 24',
		matchMinutes: DEFAULT_BALANCE_SETTINGS.matchMinutes,
		// Held as percentages because that is what the sliders speak; converted
		// back to the stored 0–1 on save.
		randomness: DEFAULT_BALANCE_SETTINGS.randomness * 100,
		repeatPenalty: DEFAULT_BALANCE_SETTINGS.repeatPenalty * 100,
		repeatLookback: DEFAULT_BALANCE_SETTINGS.repeatLookback,
	});
	const [saved, setSaved] = useState(false);
	const [subscribeOpen, setSubscribeOpen] = useState(false);

	// Seasons created before teams existed carry no levers at all, so the
	// defaults stand in rather than the form seeding itself with zeroes.
	const balance = useMemo(() => ({ ...DEFAULT_BALANCE_SETTINGS, ...season?.balance }), [season]);

	// Seed the form once the season arrives, and re-seed if someone else edits
	// it — the subscription keeps this screen live for every admin at once.
	useEffect(() => {
		if (!season) return;

		setForm({
			name: season.name,
			status: season.status,
			venueName: season.venue.name,
			venueAddress: season.venue.address ?? '',
			weekday: season.slot.weekday,
			time: season.slot.time,
			durationMinutes: season.slot.durationMinutes,
			startDate: season.startDate,
			endDate: season.endDate,
			minPlayers: season.minPlayers,
			responseDeadlineHours: season.responseDeadlineHours,
			reminderHours: (season.reminderHours ?? []).join(', '),
			matchMinutes: balance.matchMinutes,
			randomness: Math.round(balance.randomness * 100),
			repeatPenalty: Math.round(balance.repeatPenalty * 100),
			repeatLookback: balance.repeatLookback,
		});
	}, [season, balance]);

	if (loading) {
		return (
			<SeasonShell title='Admin' backHref={`/s/${seasonId}`}>
				<Skeleton />
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

	const handleSave = async () => {
		const venue: Venue = {
			name: form.venueName.trim(),
			...(form.venueAddress.trim() ? { address: form.venueAddress.trim() } : {}),
		};
		const venueChanged = venue.name !== season.venue.name || (venue.address ?? '') !== (season.venue.address ?? '');

		// Only claim it saved if it did — this used to say "Saved" whether or not
		// the write was accepted.
		const ok = await write(async () => {
			await updateSeason(seasonId, {
				name: form.name.trim(),
				status: form.status,
				venue,
				slot: {
					weekday: form.weekday,
					time: form.time,
					durationMinutes: Number(form.durationMinutes),
					timezone: season.slot.timezone,
				},
				startDate: form.startDate,
				endDate: form.endDate,
				minPlayers: Number(form.minPlayers),
				responseDeadlineHours: Number(form.responseDeadlineHours),
				reminderHours: parseReminderHours(form.reminderHours),
				balance: {
					matchMinutes: Number(form.matchMinutes),
					randomness: Number(form.randomness) / 100,
					repeatPenalty: Number(form.repeatPenalty) / 100,
					repeatLookback: Number(form.repeatLookback),
				},
			});

			if (venueChanged) {
				await updateVenueForUpcomingGames(seasonId, games, venue);
			}
		}, "Couldn't save the season settings.");

		if (!ok) return;

		setSaved(true);
		setTimeout(() => setSaved(false), 2500);
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
				<div className='space-y-4 p-4'>
					<div className='grid grid-cols-2 gap-3'>
						<Link href={`/s/${seasonId}/admin/members`} className='glass-card rounded-2xl p-4'>
							<UsersIcon className='text-brand mb-2 size-6' aria-hidden='true' />
							<p className='text-ink text-sm font-semibold'>Squad</p>
							<p className='text-faint text-xs'>{season.memberUids.length} players</p>
						</Link>

						<Link href={`/s/${seasonId}/admin/games`} className='glass-card rounded-2xl p-4'>
							<CalendarDaysIcon className='text-brand mb-2 size-6' aria-hidden='true' />
							<p className='text-ink text-sm font-semibold'>Games</p>
							<p className='text-faint text-xs'>Generate &amp; edit</p>
						</Link>

						<button
							type='button'
							onClick={() => setSubscribeOpen(true)}
							className='glass-card col-span-2 rounded-2xl p-4 text-left'
						>
							<CalendarIcon className='text-brand mb-2 size-6' aria-hidden='true' />
							<p className='text-ink text-sm font-semibold'>Calendar link</p>
							<p className='text-faint text-xs'>Get or rotate the season&apos;s subscribe link</p>
						</button>
					</div>

					<section className='glass space-y-4 rounded-2xl p-5'>
						<h2 className='text-ink font-semibold'>Season settings</h2>

						<Field label='Name'>
							<TextInput value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
						</Field>

						<Field label='Status' hint='Archived seasons stay readable but drop off the main list.'>
							<Select
								value={form.status}
								onChange={e => setForm({ ...form, status: e.target.value as SeasonStatus })}
							>
								<option value='draft'>Draft</option>
								<option value='active'>Active</option>
								<option value='archived'>Archived</option>
							</Select>
						</Field>

						<Field label='Venue'>
							<TextInput
								value={form.venueName}
								onChange={e => setForm({ ...form, venueName: e.target.value })}
							/>
						</Field>

						<Field label='Address' hint='Optional — shown on the game screen.'>
							<TextInput
								value={form.venueAddress}
								onChange={e => setForm({ ...form, venueAddress: e.target.value })}
							/>
						</Field>

						<div className='grid grid-cols-2 gap-3'>
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

						<div className='grid grid-cols-2 gap-3'>
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

						<div className='grid grid-cols-2 gap-3'>
							<Field label='Slot' hint='Minutes the pitch is booked.'>
								<TextInput
									type='number'
									inputMode='numeric'
									value={form.durationMinutes}
									onChange={e => setForm({ ...form, durationMinutes: Number(e.target.value) })}
								/>
							</Field>

							<Field label='Minimum' hint='Below this a game is flagged.'>
								<TextInput
									type='number'
									inputMode='numeric'
									value={form.minPlayers}
									onChange={e => setForm({ ...form, minPlayers: Number(e.target.value) })}
								/>
							</Field>
						</div>

						<Field label='Answers close' hint='Hours before kick-off.'>
							<TextInput
								type='number'
								inputMode='numeric'
								value={form.responseDeadlineHours}
								onChange={e => setForm({ ...form, responseDeadlineHours: Number(e.target.value) })}
							/>
						</Field>

						<Field
							label='Remind at'
							hint='Hours before kick-off, comma separated. Only members who haven’t answered get nudged. Leave empty for no reminders.'
						>
							<TextInput
								value={form.reminderHours}
								onChange={e => setForm({ ...form, reminderHours: e.target.value })}
								placeholder='72, 24'
								inputMode='numeric'
							/>
						</Field>

						<div className='border-t border-white/8 pt-4'>
							<h3 className='text-ink mb-1 text-sm font-semibold'>Team selection</h3>
							<p className='text-faint mb-4 text-xs'>
								Teams are picked automatically from who is in and re-picked whenever somebody changes
								their answer. These change how.
							</p>

							<div className='space-y-4'>
								<Field
									label='Match length'
									hint='Minutes per match. The rotation repeats to fill the slot, so shorter matches mean more of them.'
								>
									<TextInput
										type='number'
										inputMode='numeric'
										value={form.matchMinutes}
										onChange={e => setForm({ ...form, matchMinutes: Number(e.target.value) })}
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
										onChange={e => setForm({ ...form, repeatLookback: Number(e.target.value) })}
									/>
								</Field>
							</div>
						</div>

						<Button variant='primary' fullWidth onClick={handleSave}>
							{saved ? 'Saved' : 'Save settings'}
						</Button>

						<p className='text-faint text-xs'>
							Changing the day or time doesn&apos;t move games that already exist — regenerate them from
							the Games screen.
						</p>
					</section>

					{/* App-admin only, per the security rules — a season admin can run
				    the season but not erase it. */}
					{user?.isAppAdmin && (
						<section className='glass space-y-3 rounded-2xl p-5'>
							<h2 className='text-ink font-semibold'>Danger zone</h2>
							<p className='text-faint text-xs'>
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
