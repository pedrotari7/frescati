'use client';

import { useMemo, useState } from 'react';
import { ExclamationTriangleIcon, PlusIcon, ShoppingBagIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { KitItem, KitKind } from '@shared/types';
import { KIT_KINDS, KIT_KIND_LABELS, findStrandedKit, groupKitByKind } from '@shared/kit';
import { getGameLifecycle } from '@shared/game';
import { formatGameDate } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useAuth } from '../../../../../lib/auth';
import { useKit, useResponses, useUsers } from '../../../../../hooks/useData';
import { useNow } from '../../../../../hooks/useNow';
import { useWrite } from '../../../../../hooks/useWrite';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import { addKitItem, deleteKitItem, transferKitItem } from '../../../../../lib/db/kit';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import Avatar from '../../../../../components/Avatar';
import Button from '../../../../../components/Button';
import StatusPill from '../../../../../components/StatusPill';
import GameKit from '../../../../../components/GameKit';
import KitTransferSheet from '../../../../../components/KitTransferSheet';
import { Field, Select, TextInput } from '../../../../../components/Field';

/**
 * The register: what the group owns, and who has it right now.
 *
 * Open to everybody, and the handover control with it. A ball changes hands at
 * the side of a pitch between two people, neither of whom is necessarily an
 * admin — routing that through one means it never gets recorded and the whole
 * thing goes stale in a fortnight. Adding and removing items stays with the
 * admins, because that is a decision about the season rather than about a bag.
 *
 * The next game sits at the top rather than the bottom: "who has the ball" is
 * only ever asked as a way of asking "is there a ball on Tuesday", and this is
 * the screen that can answer both.
 */
const KitPage = () => {
	const { seasonId, season, games, loading, isAdmin, isMember } = useSeasonContext();
	const { kit, loading: kitLoading } = useKit(seasonId);
	const { users } = useUsers();
	const { user } = useAuth();
	const write = useWrite();
	const confirm = useConfirm();
	const now = useNow();

	const [transferring, setTransferring] = useState<KitItem | null>(null);
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState<{ name: string; kind: KitKind; holderUid: string }>({
		name: '',
		kind: 'ball',
		holderUid: '',
	});

	const usersByUid = useMemo(() => new Map(users.map(person => [person.uid, person])), [users]);

	const squad = useMemo(() => {
		if (!season) return [];

		return season.memberUids
			.map(uid => ({
				uid,
				displayName: usersByUid.get(uid)?.displayName ?? 'Unknown player',
				photoURL: usersByUid.get(uid)?.photoURL ?? null,
			}))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}, [season, usersByUid]);

	// The soonest game that hasn't been played, cancelled or not — the same one
	// the season home page calls "next", so the two screens can't disagree about
	// which game the warning is about.
	const nextGame = useMemo(
		() => (season ? (games.find(game => getGameLifecycle(game, season, now) !== 'finished') ?? null) : null),
		[games, season, now]
	);

	const { responses } = useResponses(seasonId, nextGame?.id ?? null);

	const stranded = useMemo(() => (season ? findStrandedKit(kit, season.memberUids) : []), [kit, season]);

	if (loading || kitLoading) {
		return (
			<SeasonShell title='Kit' backHref={`/s/${seasonId}`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Kit' backHref={`/s/${seasonId}`}>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	const uid = user?.uid ?? '';

	const handleAdd = async () => {
		const name = form.name.trim();
		if (!name || !form.holderUid) return;

		const ok = await write(
			() => addKitItem(seasonId, { name, kind: form.kind, holderUid: form.holderUid }, uid),
			"Couldn't add that to the kit list."
		);

		if (!ok) return;

		setForm({ name: '', kind: form.kind, holderUid: '' });
		setAdding(false);
	};

	const handleDelete = async (item: KitItem) => {
		const ok = await confirm({
			title: `Remove ${item.name}?`,
			message: 'It disappears from the register and stops counting towards any game.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => deleteKitItem(seasonId, item.id), `Couldn't remove ${item.name}.`);
	};

	// Members only, matching the rule. An extra sees the register and can't move
	// anything in it — offering them a button that always fails would be worse
	// than not offering one.
	const canTransfer = isMember || isAdmin;

	const addPanel = isAdmin ? (
		adding ? (
			<section className='glass space-y-4 rounded-2xl p-5'>
				<h2 className='text-ink font-semibold'>Add to the kit list</h2>

				<Field label='What is it'>
					<TextInput
						value={form.name}
						onChange={e => setForm({ ...form, name: e.target.value })}
						placeholder='Match ball'
						maxLength={60}
					/>
				</Field>

				<Field
					label='Kind'
					hint='Games are warned when nobody is bringing a ball or the vests. Other kit is tracked but never warned about.'
				>
					<Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as KitKind })}>
						{KIT_KINDS.map(kind => (
							<option key={kind} value={kind}>
								{KIT_KIND_LABELS[kind]}
							</option>
						))}
					</Select>
				</Field>

				<Field
					label='Who has it'
					hint='Everything on this list is with somebody. Pick whoever has it now — it can be handed on from this screen.'
				>
					<Select value={form.holderUid} onChange={e => setForm({ ...form, holderUid: e.target.value })}>
						<option value=''>Pick somebody</option>
						{squad.map(member => (
							<option key={member.uid} value={member.uid}>
								{member.displayName}
							</option>
						))}
					</Select>
				</Field>

				<div className='flex gap-3'>
					<Button
						variant='primary'
						fullWidth
						onClick={handleAdd}
						disabled={!form.name.trim() || !form.holderUid}
					>
						Add
					</Button>
					<Button variant='ghost' fullWidth onClick={() => setAdding(false)}>
						Cancel
					</Button>
				</div>
			</section>
		) : (
			<Button variant='secondary' fullWidth onClick={() => setAdding(true)}>
				<PlusIcon className='size-4' aria-hidden='true' />
				Add kit
			</Button>
		)
	) : null;

	return (
		<>
			<SeasonShell title='Kit' subtitle={season.name} backHref={`/s/${seasonId}`}>
				<div className='space-y-6 p-4'>
					{kit.length === 0 ? (
						<EmptyState
							icon={<ShoppingBagIcon />}
							title='Nothing on the list'
							message={
								isAdmin
									? 'Add the ball and the vests and the app will tell you when nobody is bringing them.'
									: 'An admin hasn’t listed the group’s balls or vests yet.'
							}
							action={addPanel}
						/>
					) : (
						<>
							{/* What the register is for. Above the list, because
							    nobody opens this screen out of curiosity about a
							    bag — they open it before a game. */}
							{nextGame && (
								<section>
									<h2 className='text-faint mb-2 px-1 text-xs font-semibold tracking-wider uppercase'>
										{formatGameDate(nextGame.kickoff, season.slot.timezone)}
									</h2>
									<GameKit
										seasonId={seasonId}
										items={kit}
										responses={responses}
										usersByUid={usersByUid}
									/>
								</section>
							)}

							{stranded.length > 0 && (
								<section className='border-pending/25 bg-pending/8 rounded-2xl border p-4'>
									<div className='flex items-center gap-2'>
										<ExclamationTriangleIcon
											className='text-pending size-4 shrink-0'
											aria-hidden='true'
										/>
										<h2 className='text-ink text-sm font-semibold'>
											Held by somebody who has left
										</h2>
									</div>
									<p className='text-muted mt-2 text-xs leading-relaxed'>
										{stranded.map(item => item.name).join(', ')} — the person holding{' '}
										{stranded.length > 1 ? 'these' : 'this'} is no longer in the squad. Nothing has
										been guessed on your behalf; hand {stranded.length > 1 ? 'them' : 'it'} on below
										once you know who has {stranded.length > 1 ? 'them' : 'it'}.
									</p>
								</section>
							)}

							<section className='space-y-4'>
								{groupKitByKind(kit).map(group => (
									<div key={group.kind}>
										<h2 className='text-faint mb-2 px-1 text-xs font-semibold tracking-wider uppercase'>
											{KIT_KIND_LABELS[group.kind]}
										</h2>

										<div className='glass divide-y divide-white/5 rounded-2xl px-4'>
											{group.items.map(item => {
												const holder = usersByUid.get(item.holderUid);
												const inSquad = season.memberUids.includes(item.holderUid);

												return (
													<div key={item.id} className='flex items-center gap-3 py-3'>
														<Avatar
															displayName={holder?.displayName ?? '?'}
															photoURL={holder?.photoURL ?? null}
														/>

														<div className='min-w-0 flex-1'>
															<p className='text-ink truncate text-sm font-medium'>
																{item.name}
															</p>
															<p className='text-faint mt-0.5 flex items-center gap-1.5 truncate text-xs'>
																{holder?.displayName ?? 'Unknown player'}
																{!inSquad && (
																	<StatusPill tone='pending'>
																		Left the squad
																	</StatusPill>
																)}
															</p>
														</div>

														{canTransfer && (
															<Button
																size='sm'
																variant='secondary'
																onClick={() => setTransferring(item)}
															>
																Hand over
															</Button>
														)}

														{isAdmin && (
															<Button
																size='sm'
																variant='danger'
																aria-label={`Remove ${item.name}`}
																onClick={() => handleDelete(item)}
															>
																<TrashIcon className='size-4' aria-hidden='true' />
															</Button>
														)}
													</div>
												);
											})}
										</div>
									</div>
								))}
							</section>

							{addPanel}

							<p className='text-faint px-1 text-xs leading-relaxed'>
								Anyone in the squad can hand a piece of kit on — no need to find an admin. A game is
								flagged when nobody bringing a ball or the vests has said they&apos;re playing.
							</p>
						</>
					)}
				</div>
			</SeasonShell>

			<KitTransferSheet
				item={transferring}
				squad={squad}
				open={!!transferring}
				onClose={() => setTransferring(null)}
				onTransfer={async holderUid => {
					if (!transferring) return;

					await write(
						() => transferKitItem(seasonId, transferring.id, holderUid, uid),
						`Couldn't hand ${transferring.name} over.`
					);
				}}
			/>
		</>
	);
};

export default KitPage;
