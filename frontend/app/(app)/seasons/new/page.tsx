'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Weekday } from '@shared/types';
import { weekdayName } from '@shared/format';
import { useAuth } from '../../../../lib/auth';
import { createSeason } from '../../../../lib/db/seasons';
import { globalNavItems } from '../../../../components/BottomNav';
import PageShell from '../../../../components/PageShell';
import EmptyState from '../../../../components/EmptyState';
import Button from '../../../../components/Button';
import { Field, Select, TextInput } from '../../../../components/Field';

/** The group plays in Stockholm; a per-season picker can come later if needed. */
const TIMEZONE = 'Europe/Stockholm';

const NewSeasonPage = () => {
	const router = useRouter();
	const { user } = useAuth();

	const [form, setForm] = useState({
		name: '',
		venueName: 'Frescati IP',
		weekday: 2 as Weekday,
		time: '19:00',
		durationMinutes: 90,
		startDate: '',
		endDate: '',
		minPlayers: 10,
	});
	const [error, setError] = useState<string | null>(null);

	if (!user?.isAppAdmin) {
		return (
			<PageShell title='New season' backHref='/seasons' navItems={globalNavItems()}>
				<EmptyState
					title='App admins only'
					message='Creating a season needs the app admin role. Ask whoever set up the app.'
				/>
			</PageShell>
		);
	}

	const isValid = form.name.trim() && form.venueName.trim() && form.startDate && form.endDate;

	const handleCreate = async () => {
		setError(null);

		if (form.endDate < form.startDate) {
			setError('The end date is before the start date.');
			return;
		}

		try {
			const seasonId = await createSeason({
				name: form.name.trim(),
				status: 'active',
				startDate: form.startDate,
				endDate: form.endDate,
				venue: { name: form.venueName.trim() },
				slot: {
					weekday: form.weekday,
					time: form.time,
					durationMinutes: Number(form.durationMinutes),
					timezone: TIMEZONE,
				},
				minPlayers: Number(form.minPlayers),
				responseDeadlineHours: 24,
				reminderHours: [72, 24],
				// The creator has to be an admin of it, or the rules reject the write.
				memberUids: [user.uid],
				adminUids: [user.uid],
				createdAt: new Date().toISOString(),
				createdBy: user.uid,
			});

			router.replace(`/s/${seasonId}/admin/games`);
		} catch (createError) {
			console.error('Could not create season', createError);
			setError('Could not create the season. Check you still have admin rights.');
		}
	};

	return (
		<PageShell title='New season' backHref='/seasons' navItems={globalNavItems()}>
			<div className='space-y-4 p-4'>
				<section className='glass space-y-4 rounded-2xl p-5'>
					<Field label='Name' hint='Something you’ll recognise, e.g. “Autumn 2026”.'>
						<TextInput
							value={form.name}
							onChange={e => setForm({ ...form, name: e.target.value })}
							placeholder='Autumn 2026'
						/>
					</Field>

					<Field label='Venue'>
						<TextInput
							value={form.venueName}
							onChange={e => setForm({ ...form, venueName: e.target.value })}
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
						<Field label='Starts'>
							<TextInput
								type='date'
								value={form.startDate}
								onChange={e => setForm({ ...form, startDate: e.target.value })}
							/>
						</Field>

						<Field label='Ends'>
							<TextInput
								type='date'
								value={form.endDate}
								onChange={e => setForm({ ...form, endDate: e.target.value })}
							/>
						</Field>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<Field label='Minutes'>
							<TextInput
								type='number'
								inputMode='numeric'
								value={form.durationMinutes}
								onChange={e => setForm({ ...form, durationMinutes: Number(e.target.value) })}
							/>
						</Field>

						<Field label='Minimum players'>
							<TextInput
								type='number'
								inputMode='numeric'
								value={form.minPlayers}
								onChange={e => setForm({ ...form, minPlayers: Number(e.target.value) })}
							/>
						</Field>
					</div>

					{error && <p className='text-out text-sm'>{error}</p>}

					<Button variant='primary' fullWidth disabled={!isValid} onClick={handleCreate}>
						Create season
					</Button>

					<p className='text-faint text-xs'>
						You&apos;ll be added as the first squad member and admin. Games get generated on the next
						screen.
					</p>
				</section>
			</div>
		</PageShell>
	);
};

export default NewSeasonPage;
