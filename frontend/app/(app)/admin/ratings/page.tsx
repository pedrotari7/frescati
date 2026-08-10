'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { AppUser } from '@shared/types';
import { hasPlayed, toDisplayRating } from '@shared/rating';
import { useAuth } from '../../../../lib/auth';
import { useUsers } from '../../../../hooks/useData';
import { useWrite } from '../../../../hooks/useWrite';
import { setStartingRating } from '../../../../lib/db/ratings';
import { useToast } from '../../../../components/Toast';
import PageShell from '../../../../components/PageShell';
import Skeleton from '../../../../components/Skeleton';
import EmptyState from '../../../../components/EmptyState';
import Avatar from '../../../../components/Avatar';
import Button from '../../../../components/Button';
import StatusPill from '../../../../components/StatusPill';
import { RangeInput, TextInput } from '../../../../components/Field';

/**
 * Starting ratings — what an admin knows about a player before the ladder does.
 *
 * Its own screen rather than a column on the app-admin list, which is about a
 * role, or on a season's squad, which a rating outlives: a rating is global and
 * career-long, so a season is the wrong place to be editing one from.
 *
 * The split down the middle is the whole screen. Above the line are people
 * whose rating is still an estimate and still editable; below it are people the
 * ladder has had its say about, shown but not touchable — see
 * `setStartingRating` on the backend for why that isn't merely a house rule.
 */

/** Where the slider opens for somebody with no estimate yet: the middle. */
const DEFAULT_DISPLAY = 50;

/**
 * The rough shape of the scale, so an admin nudging a slider has something to
 * aim at rather than guessing what 70 is supposed to mean. Deliberately coarse,
 * and highest first so the first match wins — the number is an opening bid that
 * the first few games will correct anyway.
 */
const SCALE_HINT = [
	{ from: 80, label: 'Carries a team' },
	{ from: 65, label: 'One of the better players' },
	{ from: 50, label: 'Middle of the group' },
	{ from: 0, label: 'Still learning' },
];

const describeRating = (display: number): string =>
	SCALE_HINT.find(step => display >= step.from)!.label;

/**
 * The slider, mounted only while a row is open.
 *
 * Its own component so the draft is born from `current` each time it opens
 * rather than surviving in a row that never unmounts — otherwise clearing
 * somebody's rating and opening them again shows the number that was just
 * thrown away.
 */
const StartingRatingEditor = ({
	player,
	current,
	onDone,
}: {
	player: AppUser;
	current: number | null;
	onDone: () => void;
}) => {
	const write = useWrite();
	const { notify } = useToast();
	const [draft, setDraft] = useState(current ?? DEFAULT_DISPLAY);

	const save = async (next: number | null) => {
		const done = await write(
			() => setStartingRating(player.uid, next),
			`Couldn't set a starting rating for ${player.displayName}.`
		);

		if (!done) return;

		onDone();
		notify(
			next === null
				? `${player.displayName} is back on the group average.`
				: `${player.displayName} starts on ${next}.`
		);
	};

	return (
		<div className='mt-3 space-y-3 rounded-xl bg-white/5 p-3'>
			<RangeInput
				min={0}
				max={100}
				step={1}
				value={draft}
				aria-label={`Starting rating for ${player.displayName}`}
				onChange={event => setDraft(Number(event.target.value))}
			/>

			<p className='text-faint text-xs'>{describeRating(draft)}</p>

			<div className='flex gap-2'>
				<Button size='sm' variant='primary' className='flex-1' onClick={() => save(draft)}>
					Save
				</Button>

				{current !== null && (
					<Button size='sm' variant='danger' onClick={() => save(null)}>
						Clear
					</Button>
				)}
			</div>
		</div>
	);
};

/**
 * One editable player: the row, and the editor it opens into.
 *
 * Inline and one-at-a-time rather than a dialog, because setting these is a
 * pass down a list — open, drag, save, next — and a modal per person turns that
 * into a lot of tapping.
 */
const StartingRatingRow = ({
	player,
	open,
	onOpen,
	onClose,
}: {
	player: AppUser;
	open: boolean;
	onOpen: () => void;
	onClose: () => void;
}) => {
	const current = player.rating ? toDisplayRating(player.rating.elo) : null;

	return (
		<div className='py-3'>
			<div className='flex items-center gap-3'>
				<Avatar displayName={player.displayName} photoURL={player.photoURL} />

				<div className='min-w-0 flex-1'>
					<p className='text-ink truncate text-sm'>{player.displayName}</p>
					<p className='text-faint text-xs'>
						{current === null
							? 'On the group average'
							: `Starts on ${current} · ${describeRating(current)}`}
					</p>
				</div>

				{current !== null && <StatusPill tone='pending'>Estimate</StatusPill>}

				<Button size='sm' variant={open ? 'ghost' : 'secondary'} onClick={open ? onClose : onOpen}>
					{open ? 'Cancel' : current === null ? 'Set' : 'Change'}
				</Button>
			</div>

			{open && <StartingRatingEditor player={player} current={current} onDone={onClose} />}
		</div>
	);
};

const RatingsAdminPage = () => {
	const { user } = useAuth();
	const { users, loading } = useUsers();
	const [search, setSearch] = useState('');
	const [editing, setEditing] = useState<string | null>(null);

	const { estimated, rated } = useMemo(() => {
		const term = search.trim().toLowerCase();
		const matches = users.filter(candidate => !term || candidate.displayName.toLowerCase().includes(term));

		return {
			estimated: matches.filter(candidate => !hasPlayed(candidate.rating)),
			// Best first, so the read-only half reads like the ladder it is.
			rated: matches
				.filter(candidate => hasPlayed(candidate.rating))
				.sort((a, b) => b.rating!.elo - a.rating!.elo),
		};
	}, [users, search]);

	if (!user?.isAppAdmin) {
		return (
			<PageShell title='Starting ratings' backHref='/me'>
				<EmptyState
					title='App admins only'
					message='This screen sets what a player is worth before they have played.'
				/>
			</PageShell>
		);
	}

	if (loading) {
		return (
			<PageShell title='Starting ratings' backHref='/me'>
				<Skeleton />
			</PageShell>
		);
	}

	return (
		<PageShell title='Starting ratings' subtitle={`${estimated.length} yet to play`} backHref='/me'>
			<div className='space-y-6 p-4'>
				<div className='relative'>
					<MagnifyingGlassIcon
						className='text-faint pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2'
						aria-hidden='true'
					/>
					<TextInput
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder='Search by name'
						className='pl-10'
						type='search'
					/>
				</div>

				<section>
					<h2 className='text-faint mb-2 px-1 text-xs font-semibold tracking-wider uppercase'>
						Yet to play ({estimated.length})
					</h2>

					<div className='glass divide-y divide-white/5 rounded-2xl px-4'>
						{estimated.length === 0 && (
							<p className='text-faint py-4 text-sm'>
								{search ? 'Nobody matches that search.' : 'Everybody signed up has played a rated game.'}
							</p>
						)}

						{estimated.map(player => (
							<StartingRatingRow
								key={player.uid}
								player={player}
								open={editing === player.uid}
								onOpen={() => setEditing(player.uid)}
								onClose={() => setEditing(null)}
							/>
						))}
					</div>

					<p className='text-faint mt-3 px-1 text-xs leading-relaxed'>
						Left alone, a new player is worth the average of the season&apos;s rated members — which is the
						right guess for somebody you know nothing about, and the wrong one for somebody you do. A
						starting rating counts from their first game: the balancer uses it, and their first few results
						move them fast either way. It stays off the ladder until they have actually played.
					</p>
				</section>

				<section>
					<h2 className='text-faint mb-2 px-1 text-xs font-semibold tracking-wider uppercase'>
						Rated ({rated.length})
					</h2>

					<div className='glass divide-y divide-white/5 rounded-2xl px-4'>
						{rated.length === 0 && (
							<p className='text-faint py-4 text-sm'>
								{search ? 'Nobody matches that search.' : 'Nobody has played a confirmed game yet.'}
							</p>
						)}

						{rated.map(player => (
							<div key={player.uid} className='flex items-center gap-3 py-3'>
								<Avatar displayName={player.displayName} photoURL={player.photoURL} />

								<div className='min-w-0 flex-1'>
									<p className='text-ink truncate text-sm'>{player.displayName}</p>
									<p className='text-faint text-xs'>
										{player.rating!.games} rated {player.rating!.games === 1 ? 'game' : 'games'}
									</p>
								</div>

								<span className='text-ink w-10 text-right text-lg font-bold tabular-nums'>
									{toDisplayRating(player.rating!.elo)}
								</span>
							</div>
						))}
					</div>

					<p className='text-faint mt-3 px-1 text-xs leading-relaxed'>
						These are earned, so they are not editable here. Every rated game records what each player
						carried into it, and a correction to any result rewinds and replays from there — an edit dropped
						on top would be undone by the next one. Fix a wrong rating by fixing the scores behind it.
					</p>
				</section>
			</div>
		</PageShell>
	);
};

export default RatingsAdminPage;
