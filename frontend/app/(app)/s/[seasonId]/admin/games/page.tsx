'use client';

import { useMemo, useState } from 'react';
import { diffGeneratedGames, generateGameDates } from '@shared/schedule';
import { getGameLifecycle } from '@shared/game';
import { formatGameDate, formatGameTime } from '@shared/format';
import { parseCivilDate, zonedTimeToUtc } from '@shared/datetime';
import { useAuth } from '../../../../../../lib/auth';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useWrite } from '../../../../../../hooks/useWrite';
import { cancelGame, createGames, createOneOffGame, deleteGame, restoreGame } from '../../../../../../lib/db/games';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import Button from '../../../../../../components/Button';
import StatusPill from '../../../../../../components/StatusPill';
import { Field, TextInput } from '../../../../../../components/Field';

const AdminGamesPage = () => {
	const { user } = useAuth();
	const { seasonId, season, games, loading, isAdmin } = useSeasonContext();
	const write = useWrite();

	const [message, setMessage] = useState<string | null>(null);
	const [oneOff, setOneOff] = useState({ date: '', time: '' });

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

	if (loading) {
		return (
			<SeasonShell title='Games' backHref={`/s/${seasonId}/admin`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (!season || !isAdmin || !user) {
		return (
			<SeasonShell title='Games' backHref={`/s/${seasonId}/admin`}>
				<EmptyState title='Admins only' />
			</SeasonShell>
		);
	}

	const handleGenerate = async () => {
		if (!preview || preview.toCreate.length === 0) return;

		const created = preview.toCreate.length;
		const ok = await write(
			() => createGames(season, preview.toCreate, user.uid),
			"Couldn't add the games. Nothing was created."
		);

		if (ok) setMessage(`Added ${created} game${created === 1 ? '' : 's'}.`);
	};

	const handleAddOneOff = async () => {
		if (!oneOff.date || !oneOff.time) return;

		const { year, month, day } = parseCivilDate(oneOff.date);
		const [hours, minutes] = oneOff.time.split(':').map(Number);
		const kickoff = zonedTimeToUtc(year, month, day, hours, minutes, season.slot.timezone);

		const ok = await write(
			() =>
				createOneOffGame(
					season,
					{
						kickoff: kickoff.toISOString(),
						endsAt: new Date(kickoff.getTime() + season.slot.durationMinutes * 60 * 1000).toISOString(),
					},
					user.uid
				),
			"Couldn't add that game."
		);

		if (!ok) return;

		setOneOff({ date: '', time: '' });
		setMessage('One-off game added.');
	};

	return (
		<SeasonShell title='Games' subtitle={`${games.length} on the calendar`} backHref={`/s/${seasonId}/admin`}>
			<div className='space-y-4 p-4'>
				<section className='glass rounded-2xl p-5'>
					<h2 className='text-ink mb-1 font-semibold'>Generate the calendar</h2>
					<p className='text-muted mb-4 text-sm leading-relaxed'>
						Creates every {season.slot.time} game on the season&apos;s weekday between {season.startDate}{' '}
						and {season.endDate}. Games that already exist are left alone, so it&apos;s safe to run again
						after extending the season.
					</p>

					{preview && (
						<div className='mb-4 flex gap-2'>
							<StatusPill tone={preview.toCreate.length > 0 ? 'in' : 'neutral'}>
								{preview.toCreate.length} new
							</StatusPill>
							<StatusPill tone='neutral'>{preview.alreadyExisting.length} already there</StatusPill>
						</div>
					)}

					<Button
						variant='primary'
						fullWidth
						disabled={!preview || preview.toCreate.length === 0}
						onClick={handleGenerate}
					>
						{preview && preview.toCreate.length > 0
							? `Add ${preview.toCreate.length} game${preview.toCreate.length === 1 ? '' : 's'}`
							: 'Nothing to add'}
					</Button>
				</section>

				<section className='glass rounded-2xl p-5'>
					<h2 className='text-ink mb-4 font-semibold'>Add a one-off</h2>

					<div className='grid grid-cols-2 gap-3'>
						<Field label='Date'>
							<TextInput
								type='date'
								value={oneOff.date}
								onChange={e => setOneOff({ ...oneOff, date: e.target.value })}
							/>
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
						className='mt-4'
						disabled={!oneOff.date || !oneOff.time}
						onClick={handleAddOneOff}
					>
						Add game
					</Button>
				</section>

				{message && <p className='text-brand px-1 text-sm'>{message}</p>}

				<section>
					<h2 className='text-faint mb-2 px-1 text-xs font-semibold tracking-wider uppercase'>Calendar</h2>

					<div className='glass divide-y divide-white/5 rounded-2xl px-4'>
						{games.length === 0 && <p className='text-faint py-4 text-sm'>No games yet.</p>}

						{games.map(game => {
							const lifecycle = getGameLifecycle(game, season);
							const isCancelled = lifecycle === 'cancelled';

							return (
								<div key={game.id} className='flex items-center gap-2 py-3'>
									<div className='min-w-0 flex-1'>
										<p className='text-ink text-sm'>
											{formatGameDate(game.kickoff, season.slot.timezone)}{' '}
											<span className='text-faint tabular-nums'>
												{formatGameTime(game.kickoff, season.slot.timezone)}
											</span>
										</p>
										<div className='mt-1 flex gap-1.5'>
											<span className='text-faint text-xs'>{game.counts.playing} playing</span>
											{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
											{isCancelled && <StatusPill tone='out'>Cancelled</StatusPill>}
										</div>
									</div>

									<Button
										size='sm'
										variant='ghost'
										onClick={() =>
											isCancelled
												? write(
														() => restoreGame(seasonId, game.id),
														"Couldn't put that game back on."
													)
												: write(
														() =>
															cancelGame(seasonId, game.id, 'Called off by an admin'),
														"Couldn't cancel that game."
													)
										}
									>
										{isCancelled ? 'Restore' : 'Cancel'}
									</Button>

									{/* Deleting loses the answers; cancelling keeps them. */}
									<Button
										size='sm'
										variant='danger'
										onClick={() =>
											write(() => deleteGame(seasonId, game.id), "Couldn't delete that game.")
										}
									>
										Delete
									</Button>
								</div>
							);
						})}
					</div>
				</section>
			</div>
		</SeasonShell>
	);
};

export default AdminGamesPage;
