'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { BeakerIcon } from '@heroicons/react/24/solid';
import { useAuth, signOutOfApp } from '../lib/auth';
import { DEV_MODE, loadDevUsers, signInAsDevUser } from '../lib/devUsers';
import type { DevUser, DevUserFile } from '../lib/devUsers';
import { classNames } from '../lib/utils/reactHelper';
import Avatar from './Avatar';
import Button from './Button';

/**
 * Become any seeded player, in two taps.
 *
 * Only exists when the app is pointed at the emulators — production has one way
 * in and this is not it. It sits above everything else because it has to work
 * on the login screen too, which is where you spend most of your time when the
 * thing you are testing is "what does an admin see that a member doesn't".
 */
const DevUserSwitcher = () => {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [file, setFile] = useState<DevUserFile | null>(null);
	const [query, setQuery] = useState('');

	useEffect(() => {
		if (DEV_MODE) void loadDevUsers().then(setFile);
	}, []);

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const users = file?.users ?? [];

		if (!needle) return users;

		return users.filter(candidate =>
			`${candidate.displayName} ${candidate.email} ${candidate.hint}`.toLowerCase().includes(needle)
		);
	}, [file, query]);

	// Hooks first: whether this renders at all is a build-time constant, but it
	// still has to be decided after they have run.
	if (!DEV_MODE) return null;

	const become = async (candidate: DevUser) => {
		await signInAsDevUser(candidate);
		setOpen(false);
		setQuery('');
	};

	return (
		<>
			<button
				type='button'
				onClick={() => setOpen(true)}
				aria-label='Switch seeded user'
				className='glass shadow-lift text-brand fixed right-4 bottom-24 z-40 flex size-11 items-center justify-center rounded-full lg:bottom-6'
			>
				<BeakerIcon className='size-5' aria-hidden='true' />
			</button>

			<Dialog open={open} onClose={() => setOpen(false)} className='relative z-50'>
				<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

				<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
					<DialogPanel className='glass shadow-lift animate-rise mb-safe flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl p-5'>
						<DialogTitle className='text-ink text-lg font-semibold'>Sign in as</DialogTitle>

						<p className='text-muted mt-1 text-xs leading-relaxed'>
							{file
								? `Scenario “${file.scenario}” · ${file.users.length} seeded accounts`
								: 'No seeded accounts found — run pnpm seed.'}
						</p>

						{user && (
							<p className='text-faint mt-2 text-xs'>
								Currently {user.displayName}
								{user.isAppAdmin && ' · app admin'}
							</p>
						)}

						{file && (
							<input
								type='search'
								value={query}
								onChange={event => setQuery(event.target.value)}
								placeholder='Filter by name, email or role'
								className='bg-raised text-ink placeholder:text-faint ring-line focus:ring-brand/50 mt-4 h-11 w-full rounded-xl px-3 text-sm ring-1 outline-none'
							/>
						)}

						<div className='-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2'>
							{matches.map(candidate => (
								<button
									key={candidate.uid}
									type='button'
									onClick={() => become(candidate)}
									className={classNames(
										'flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors',
										candidate.uid === user?.uid ? 'bg-brand/10' : 'hover:bg-white/5'
									)}
								>
									<Avatar displayName={candidate.displayName} photoURL={candidate.photoURL} />

									<span className='min-w-0 flex-1'>
										<span className='text-ink block truncate text-sm font-medium'>
											{candidate.displayName}
										</span>
										<span className='text-faint block truncate text-xs'>{candidate.hint}</span>
									</span>
								</button>
							))}

							{file && matches.length === 0 && (
								<p className='text-faint py-6 text-center text-sm'>Nobody matches “{query}”.</p>
							)}
						</div>

						<div className='mt-4 flex gap-3'>
							<Button variant='ghost' fullWidth onClick={() => setOpen(false)}>
								Close
							</Button>
							{user && (
								<Button
									variant='secondary'
									fullWidth
									onClick={async () => {
										await signOutOfApp();
										setOpen(false);
									}}
								>
									Sign out
								</Button>
							)}
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</>
	);
};

export default DevUserSwitcher;
