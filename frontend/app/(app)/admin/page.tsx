'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../lib/auth';
import { useUsers } from '../../../hooks/useData';
import { useWrite } from '../../../hooks/useWrite';
import { setAppAdmin } from '../../../lib/db/appAdmins';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import PageShell from '../../../components/PageShell';
import AppAdminOnly from '../../../components/AppAdminOnly';
import Skeleton from '../../../components/Skeleton';
import Avatar from '../../../components/Avatar';
import Button from '../../../components/Button';
import StatusPill from '../../../components/StatusPill';
import { TextInput } from '../../../components/Field';
import { ListCard, ListEmpty, SectionHeading } from '../../../components/Section';

/**
 * App admins — the global role, distinct from the per-season one.
 *
 * Kept on its own route rather than folded into a season screen because the two
 * roles are genuinely different: a season admin runs one season, an app admin
 * creates them and can promote anybody. Conflating them on the season members
 * page would make that hard to see.
 */
const AppAdminPage = () => {
	const { user } = useAuth();
	const { users, loading } = useUsers();
	const write = useWrite();
	const confirm = useConfirm();
	const { notify } = useToast();
	const [search, setSearch] = useState('');

	const { admins, others } = useMemo(() => {
		const term = search.trim().toLowerCase();
		const matches = users.filter(candidate => !term || candidate.displayName.toLowerCase().includes(term));

		return {
			admins: matches.filter(candidate => candidate.isAppAdmin),
			others: matches.filter(candidate => !candidate.isAppAdmin),
		};
	}, [users, search]);

	if (!user?.isAppAdmin) {
		return (
			<AppAdminOnly
				title='App admins'
				message='This screen manages who can create seasons and promote other admins.'
			/>
		);
	}

	if (loading) {
		return (
			<PageShell title='App admins' backHref='/me'>
				<Skeleton />
			</PageShell>
		);
	}

	const change = async (uid: string, displayName: string, isAdmin: boolean) => {
		const ok = await confirm({
			title: isAdmin ? `Make ${displayName} an app admin?` : `Remove ${displayName}'s admin rights?`,
			message: isAdmin
				? 'They will be able to create and delete seasons, and promote or demote anybody — including you.'
				: 'They keep any season-admin roles they hold; only the global rights go.',
			confirmLabel: isAdmin ? 'Promote' : 'Demote',
			tone: isAdmin ? 'primary' : 'danger',
		});

		if (!ok) return;

		const done = await write(
			() => setAppAdmin(uid, isAdmin),
			isAdmin ? `Couldn't promote ${displayName}.` : `Couldn't demote ${displayName}.`
		);

		if (done) notify(isAdmin ? `${displayName} is now an app admin.` : `${displayName} is no longer an app admin.`);
	};

	return (
		<PageShell title='App admins' subtitle={`${admins.length} with global rights`} backHref='/me'>
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
					<SectionHeading className='mb-2 px-1'>App admins ({admins.length})</SectionHeading>

					<ListCard>
						{admins.length === 0 && <ListEmpty>Nobody matches that search.</ListEmpty>}

						{admins.map(candidate => (
							<div key={candidate.uid} className='flex items-center gap-3 py-3'>
								<Avatar displayName={candidate.displayName} photoURL={candidate.photoURL} />

								<div className='min-w-0 flex-1'>
									<p className='text-ink truncate text-sm'>{candidate.displayName}</p>
									<StatusPill tone='brand'>App admin</StatusPill>
								</div>

								{/* The function refuses to demote the caller, so
								    there is always somebody left holding the keys. */}
								<Button
									size='sm'
									variant='danger'
									disabled={candidate.uid === user.uid}
									onClick={() => change(candidate.uid, candidate.displayName, false)}
								>
									{candidate.uid === user.uid ? 'You' : 'Demote'}
								</Button>
							</div>
						))}
					</ListCard>
				</section>

				<section>
					<SectionHeading className='mb-2 px-1'>Everyone else ({others.length})</SectionHeading>

					<ListCard>
						{others.length === 0 && (
							<ListEmpty>
								{search ? 'Nobody matches that search.' : 'Everyone signed up is already an admin.'}
							</ListEmpty>
						)}

						{others.map(candidate => (
							<div key={candidate.uid} className='flex items-center gap-3 py-3'>
								<Avatar displayName={candidate.displayName} photoURL={candidate.photoURL} />

								<div className='min-w-0 flex-1'>
									<p className='text-ink truncate text-sm'>{candidate.displayName}</p>
								</div>

								<Button
									size='sm'
									variant='secondary'
									onClick={() => change(candidate.uid, candidate.displayName, true)}
								>
									Make admin
								</Button>
							</div>
						))}
					</ListCard>

					<p className='text-faint mt-3 px-1 text-xs leading-relaxed'>
						App admins create and delete seasons and manage this list. Running a single season only needs a
						season admin, set from that season&apos;s squad screen. Rights take effect within ten minutes,
						when their app next refreshes its token.
					</p>
				</section>
			</div>
		</PageShell>
	);
};

export default AppAdminPage;
