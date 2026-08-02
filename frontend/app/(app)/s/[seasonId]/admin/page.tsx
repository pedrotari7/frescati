'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDaysIcon, UsersIcon } from '@heroicons/react/24/outline';
import type { SeasonStatus, Weekday } from '@shared/types';
import { weekdayName } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { updateSeason } from '../../../../../lib/db/seasons';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import Button from '../../../../../components/Button';
import { Field, Select, TextInput } from '../../../../../components/Field';

const SeasonAdminPage = () => {
	const { seasonId, season, loading, isAdmin } = useSeasonContext();

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
	});
	const [saved, setSaved] = useState(false);

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
		});
	}, [season]);

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
		await updateSeason(seasonId, {
			name: form.name.trim(),
			status: form.status,
			venue: {
				name: form.venueName.trim(),
				...(form.venueAddress.trim() ? { address: form.venueAddress.trim() } : {}),
			},
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
		});

		setSaved(true);
		setTimeout(() => setSaved(false), 2500);
	};

	return (
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
							<TextInput
								type='date'
								value={form.startDate}
								onChange={e => setForm({ ...form, startDate: e.target.value })}
							/>
						</Field>

						<Field label='Season ends'>
							<TextInput
								type='date'
								value={form.endDate}
								onChange={e => setForm({ ...form, endDate: e.target.value })}
							/>
						</Field>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<Field label='Minutes' hint='Match length.'>
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

					<Button variant='primary' fullWidth onClick={handleSave}>
						{saved ? 'Saved' : 'Save settings'}
					</Button>

					<p className='text-faint text-xs'>
						Changing the day or time doesn&apos;t move games that already exist — regenerate them from the
						Games screen.
					</p>
				</section>
			</div>
		</SeasonShell>
	);
};

export default SeasonAdminPage;
