'use client';

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Game, Season } from '@shared/types';
import { counted, formatSek } from '@shared/format';
import { feesFor, isUnderway } from '@shared/finances';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useConfirm } from '../../../../../../components/ConfirmDialog';
import { useToast } from '../../../../../../components/Toast';
import { useWrite } from '../../../../../../hooks/useWrite';
import { useKit, useUsers } from '../../../../../../hooks/useData';
import {
	addLateSeasonMember,
	addSeasonAdmin,
	addSeasonMember,
	removeSeasonAdmin,
	removeSeasonMember,
} from '../../../../../../lib/db/seasons';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import LoadFailed from '../../../../../../components/LoadFailed';
import LateJoinSheet from '../../../../../../components/LateJoinSheet';
import Person from '../../../../../../components/Person';
import Button from '../../../../../../components/Button';
import StatusPill from '../../../../../../components/StatusPill';
import { NameSearch } from '../../../../../../components/Field';
import { ListCard, ListEmpty, listRow, SectionHeading } from '../../../../../../components/Section';
import { searchByName } from '../../../../../../lib/people';
import { colors } from '../../../../../tokens.stylex';

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
	   column one word wide. Overrides `Person`'s own body, which shrinks to
	   nothing, because this is the only row here carrying two of them. */
	body: { minWidth: 160 },
	note: { color: colors.faint, marginTop: 12, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
});

/**
 * Adding somebody. Before the first game that is a place in the squad and
 * nothing else, and the sweep charges them the same share as everybody. Once a
 * game has been played it asks when they start, so the entry fee covers the
 * games they will actually be there for. A season with no bill has nothing to
 * prorate and skips the question.
 */
const useAddToSquad = (seasonId: string, season: Season | null, games: Game[]) => {
	const write = useWrite();
	const { notify } = useToast();
	const [joining, setJoining] = useState<AppUser | null>(null);

	const add = (user: AppUser) => {
		if (season && isUnderway(games) && feesFor(season).total > 0) {
			setJoining(user);
			return;
		}

		void write(() => addSeasonMember(seasonId, user.uid), `Couldn't add ${user.displayName} to the squad.`);
	};

	const addLate = async (user: AppUser, entry: { amount: number; note: string }) => {
		let raised = false;

		const ok = await write(async () => {
			raised = await addLateSeasonMember(seasonId, user.uid, entry);
		}, `Couldn't add ${user.displayName} to the squad.`);

		if (!ok) return;

		if (raised) notify(`${user.displayName} is in the squad and owes ${formatSek(entry.amount)}.`);
		else if (entry.amount > 0)
			notify(`${user.displayName} is in the squad. They already had an entry fee, so it was left as it was.`);
	};

	return { joining, close: () => setJoining(null), add, addLate };
};

/** Everybody signed up who is not in the squad, each one an Add away from it. */
const EveryoneElse = ({
	others,
	search,
	onAdd,
}: {
	others: AppUser[];
	search: string;
	onAdd: (user: AppUser) => void;
}) => (
	<section>
		<SectionHeading sx={styles.heading}>Everyone else ({others.length})</SectionHeading>

		<ListCard>
			{others.length === 0 && (
				<ListEmpty>{search ? 'Nobody matches that search.' : 'Everyone signed up is already in.'}</ListEmpty>
			)}

			{others.map(user => (
				<div key={user.uid} {...stylex.props(listRow, styles.person)}>
					<Person person={user} sx={styles.body} />

					<Button size='sm' variant='primary' onClick={() => onAdd(user)}>
						Add
					</Button>
				</div>
			))}
		</ListCard>

		<p {...stylex.props(styles.note)}>
			People appear here once they&apos;ve signed in at least once. Anyone not in the squad can still put their
			hand up for individual games as an extra, but they only count towards the headcount once you give them a
			spot on the game screen.
		</p>
	</section>
);

const AdminMembersPage = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin } = useSeasonContext();
	const { users, loading: usersLoading } = useUsers();
	const { kit } = useKit(seasonId);
	const write = useWrite();
	const confirm = useConfirm();
	const [search, setSearch] = useState('');
	const squad = useAddToSquad(seasonId, season, games);

	const { members, others } = useMemo(() => {
		if (!season) return { members: [], others: [] };

		const matches = searchByName(users, search);

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
				<NameSearch value={search} onChange={setSearch} />

				<section>
					<SectionHeading sx={styles.heading}>In the squad ({members.length})</SectionHeading>

					<ListCard>
						{members.length === 0 && <ListEmpty>Nobody yet, add players from below.</ListEmpty>}

						{members.map(user => {
							const isSeasonAdmin = season.adminUids.includes(user.uid);

							return (
								<div key={user.uid} {...stylex.props(listRow, styles.person)}>
									<Person person={user} sx={styles.body}>
										{isSeasonAdmin && <StatusPill tone='brand'>Admin</StatusPill>}
									</Person>

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

				<EveryoneElse others={others} search={search} onAdd={squad.add} />
			</div>

			<LateJoinSheet
				user={squad.joining}
				season={season}
				games={games}
				onClose={squad.close}
				onAdd={squad.addLate}
			/>
		</SeasonShell>
	);
};

export default AdminMembersPage;
