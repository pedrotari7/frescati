'use client';

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AppUser } from '@shared/types';
import { counted } from '@shared/format';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useConfirm } from '../../../../../../components/ConfirmDialog';
import { useWrite } from '../../../../../../hooks/useWrite';
import { useKit, useUsers } from '../../../../../../hooks/useData';
import {
	addSeasonAdmin,
	addSeasonMember,
	removeSeasonAdmin,
	removeSeasonMember,
} from '../../../../../../lib/db/seasons';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import LoadFailed from '../../../../../../components/LoadFailed';
import Avatar from '../../../../../../components/Avatar';
import Button from '../../../../../../components/Button';
import StatusPill from '../../../../../../components/StatusPill';
import { SearchInput } from '../../../../../../components/Field';
import { ListCard, ListEmpty, listRow, SectionHeading } from '../../../../../../components/Section';
import { colors } from '../../../../../tokens.stylex';
import { utils } from '../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	heading: { marginBottom: 8, paddingInline: 4 },
	/*
	 * Wraps, because a squad row carries two buttons after the name and a phone
	 * is 320px wide at its narrowest. Nothing shrinks: Demote and Remove keep
	 * their labels and drop to a second line under the name rather than becoming
	 * two icons nobody can tell apart.
	 */
	person: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingBlock: 12 },
	/* Wide enough to force the buttons onto their own line rather than into a
	   column one word wide. */
	body: { minWidth: 160, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
	note: { color: colors.faint, marginTop: 12, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
});

const AdminMembersPage = () => {
	const { seasonId, season, loading, error, retry, isAdmin } = useSeasonContext();
	const { users, loading: usersLoading } = useUsers();
	const { kit } = useKit(seasonId);
	const write = useWrite();
	const confirm = useConfirm();
	const [search, setSearch] = useState('');

	const { members, others } = useMemo(() => {
		if (!season) return { members: [], others: [] };

		const term = search.trim().toLowerCase();
		const matches = users.filter(user => !term || user.displayName.toLowerCase().includes(term));

		return {
			members: matches.filter(user => season.memberUids.includes(user.uid)),
			others: matches.filter(user => !season.memberUids.includes(user.uid)),
		};
	}, [season, users, search]);

	if (loading || usersLoading) {
		return (
			<SeasonShell title='Manage squad' backHref={`/s/${seasonId}/admin`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Manage squad' backHref={`/s/${seasonId}/admin`}>
				<LoadFailed what='the squad' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season || !isAdmin) {
		return (
			<SeasonShell title='Manage squad' backHref={`/s/${seasonId}/admin`}>
				<EmptyState title='Admins only' />
			</SeasonShell>
		);
	}

	// The rules refuse to leave a season without an admin, so block the last one
	// here too rather than letting the write fail with a permission error.
	const isLastAdmin = (uid: string) => season.adminUids.length === 1 && season.adminUids[0] === uid;

	/**
	 * Taking somebody off the roster, which every other destructive button in
	 * this app asks about first and this one didn't. Sitting a thumb's width
	 * from Demote, in a row about forty pixels tall.
	 *
	 * It is not trivially reversible either. Whatever kit they were holding is
	 * stranded the moment they leave: `findStrandedKit` reports it and
	 * deliberately refuses to guess a new holder, so an accidental removal
	 * leaves a warning on the kit screen that only somebody who knows where the
	 * ball actually is can clear. Worth naming here, while the answer is still
	 * "don't do it" rather than "now go and find out".
	 */
	const handleRemove = async (member: AppUser) => {
		const holding = kit.filter(item => item.holderUid === member.uid);

		const ok = await confirm({
			title: `Remove ${member.displayName} from the squad?`,
			message: [
				'They stop counting towards the headcount, and any answer they have already given is recorded as an extra.',
				holding.length > 0 &&
					`They are holding ${holding.map(item => item.name).join(' and ')}, so the register will report ${counted(holding.length, 'item')} as stranded until somebody hands it on.`,
				'They can be added back from below at any time.',
			]
				.filter(Boolean)
				.join(' '),
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		await write(
			() => removeSeasonMember(seasonId, member.uid),
			`Couldn't remove ${member.displayName} from the squad.`
		);
	};

	return (
		<SeasonShell
			title='Manage squad'
			subtitle={`${season.memberUids.length} in the squad`}
			backHref={`/s/${seasonId}/admin`}
		>
			<div {...stylex.props(styles.page)}>
				<SearchInput
					label='Search by name'
					value={search}
					onChange={e => setSearch(e.target.value)}
					placeholder='Search by name'
				/>

				<section>
					<SectionHeading sx={styles.heading}>In the squad ({members.length})</SectionHeading>

					<ListCard>
						{members.length === 0 && <ListEmpty>Nobody yet, add players from below.</ListEmpty>}

						{members.map(user => {
							const isSeasonAdmin = season.adminUids.includes(user.uid);

							return (
								<div key={user.uid} {...stylex.props(listRow, styles.person)}>
									<Avatar displayName={user.displayName} photoURL={user.photoURL} />

									<div {...stylex.props(styles.body)}>
										<p {...stylex.props(styles.name, utils.truncate)}>{user.displayName}</p>
										{isSeasonAdmin && <StatusPill tone='brand'>Admin</StatusPill>}
									</div>

									<Button
										size='sm'
										variant='ghost'
										disabled={isLastAdmin(user.uid)}
										onClick={() =>
											isSeasonAdmin
												? write(
														() => removeSeasonAdmin(seasonId, user.uid),
														`Couldn't demote ${user.displayName}.`
													)
												: write(
														() => addSeasonAdmin(seasonId, user.uid),
														`Couldn't make ${user.displayName} an admin.`
													)
										}
									>
										{isSeasonAdmin ? 'Demote' : 'Make admin'}
									</Button>

									<Button
										size='sm'
										variant='danger'
										disabled={isLastAdmin(user.uid)}
										onClick={() => handleRemove(user)}
									>
										Remove
									</Button>
								</div>
							);
						})}
					</ListCard>
				</section>

				<section>
					<SectionHeading sx={styles.heading}>Everyone else ({others.length})</SectionHeading>

					<ListCard>
						{others.length === 0 && (
							<ListEmpty>
								{search ? 'Nobody matches that search.' : 'Everyone signed up is already in.'}
							</ListEmpty>
						)}

						{others.map(user => (
							<div key={user.uid} {...stylex.props(listRow, styles.person)}>
								<Avatar displayName={user.displayName} photoURL={user.photoURL} />

								<div {...stylex.props(styles.body)}>
									<p {...stylex.props(styles.name, utils.truncate)}>{user.displayName}</p>
								</div>

								<Button
									size='sm'
									variant='primary'
									onClick={() =>
										write(
											() => addSeasonMember(seasonId, user.uid),
											`Couldn't add ${user.displayName} to the squad.`
										)
									}
								>
									Add
								</Button>
							</div>
						))}
					</ListCard>

					<p {...stylex.props(styles.note)}>
						People appear here once they&apos;ve signed in at least once. Anyone not in the squad can still
						put their hand up for individual games as an extra, but they only count towards the headcount
						once you give them a spot on the game screen.
					</p>
				</section>
			</div>
		</SeasonShell>
	);
};

export default AdminMembersPage;
