'use client';

import { useMemo, useState } from 'react';
import {
	ExclamationTriangleIcon,
	PencilSquareIcon,
	PlusIcon,
	ShoppingBagIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { KitItem, KitKind } from '@shared/types';
import { KIT_KINDS, KIT_KIND_LABELS, findStrandedKit, groupKitByKind } from '@shared/kit';
import { getGameLifecycle } from '@shared/game';
import { byDisplayName, formatGameDate } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useAuth } from '../../../../../lib/auth';
import { useKit, useResponses, useUsersByUid } from '../../../../../hooks/useData';
import { displayNameOf, personRow } from '../../../../../lib/people';
import { useNow } from '../../../../../hooks/useNow';
import { useWrite } from '../../../../../hooks/useWrite';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import { addKitItem, deleteKitItem, renameKitItem, transferKitItem } from '../../../../../lib/db/kit';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Avatar from '../../../../../components/Avatar';
import Button from '../../../../../components/Button';
import StatusPill from '../../../../../components/StatusPill';
import GameKit from '../../../../../components/GameKit';
import KitTransferSheet from '../../../../../components/KitTransferSheet';
import KitRenameSheet from '../../../../../components/KitRenameSheet';
import { Field, Select, TextInput } from '../../../../../components/Field';
import { ListCard, listRow, SectionHeading } from '../../../../../components/Section';
import { colors, tint } from '../../../../tokens.stylex';
import { press, surfaces, utils } from '../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },

	addCard: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 20 },
	addTitle: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	/* Add and Cancel side by side, both full width. Neither is destructive, and
	   the panel is only ever open because somebody meant to open it. */
	actions: { display: 'flex', gap: 12 },
	plus: { width: 16, height: 16 },

	nextHead: { marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, paddingInline: 4 },
	off: { color: colors.faint, paddingInline: 4, fontSize: 14, lineHeight: '20px' },

	stranded: {
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.pending25,
		backgroundColor: tint.pending8,
		borderRadius: 16,
		padding: 16,
	},
	strandedHead: { display: 'flex', alignItems: 'center', gap: 8 },
	warn: { color: colors.pending, width: 16, height: 16, flexShrink: 0 },
	strandedTitle: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	strandedBody: { color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 1.625 },

	groups: { display: 'flex', flexDirection: 'column', gap: 16 },
	heading: { marginBottom: 8, paddingInline: 4 },

	row: { display: 'flex', alignItems: 'center', gap: 12, paddingBlock: 12 },
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },

	/* The negative margins pull the tap target out over the row's own padding,
	   so the name reads as text sitting where it always did and the thing you
	   press is bigger than the word. `press.wash` carries the hover and the
	   press; it has to, since a `:hover` under a media query outranks a bare
	   `:active`. */
	rename: {
		appearance: 'none',
		borderWidth: 0,
		color: colors.ink,
		marginInline: -6,
		marginBlock: -4,
		display: 'flex',
		maxWidth: '100%',
		alignItems: 'center',
		gap: 6,
		borderRadius: 8,
		paddingInline: 6,
		paddingBlock: 4,
		fontFamily: 'inherit',
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 500,
		cursor: 'pointer',
		transitionProperty: 'background-color',
		transitionDuration: '0.15s',
	},
	pencil: { color: colors.faint, width: 14, height: 14, flexShrink: 0 },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 500 },
	holder: {
		color: colors.faint,
		marginTop: 2,
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 12,
		lineHeight: '16px',
	},
	trash: { width: 16, height: 16 },

	note: { color: colors.faint, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
});

/**
 * The register: what the group owns, and who has it right now.
 *
 * Open to everybody, and the handover control with it. A ball changes hands at
 * the side of a pitch between two people, neither of whom is necessarily an
 * admin. Routing that through one means it never gets recorded and the whole
 * thing goes stale in a fortnight. Adding, naming and removing items stays with
 * the admins, because that is a decision about the season rather than about a
 * bag.
 *
 * The next game sits at the top rather than the bottom: "who has the ball" is
 * only ever asked as a way of asking "is there a ball on Tuesday", and this is
 * the screen that can answer both.
 */
const KitPage = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin, isMember } = useSeasonContext();
	const { kit, loading: kitLoading } = useKit(seasonId);
	const { usersByUid } = useUsersByUid();
	const { user } = useAuth();
	const write = useWrite();
	const confirm = useConfirm();
	const now = useNow();

	const [transferring, setTransferring] = useState<KitItem | null>(null);
	const [renaming, setRenaming] = useState<KitItem | null>(null);
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState<{ name: string; kind: KitKind; holderUid: string }>({
		name: '',
		kind: 'ball',
		holderUid: '',
	});

	const squad = useMemo(() => {
		if (!season) return [];

		return season.memberUids.map(uid => personRow(usersByUid, uid)).sort(byDisplayName);
	}, [season, usersByUid]);

	// The soonest game that hasn't been played, cancelled or not, the same one
	// the season home page calls "next", so the two screens can't disagree about
	// which game the warning is about.
	const nextGame = useMemo(
		() => (season ? (games.find(game => getGameLifecycle(game, season, now) !== 'finished') ?? null) : null),
		[games, season, now]
	);

	// Whether that game is actually on. `nextGame` deliberately includes a
	// cancelled one, the home screen's "next" does too, because a cancellation
	// is exactly what people open the app to find out, but a game that is off
	// has nothing to bring to it, which is the one thing the panel below says.
	const nextLifecycle = useMemo(
		() => (season && nextGame ? getGameLifecycle(nextGame, season, now) : null),
		[season, nextGame, now]
	);

	const { responses } = useResponses(seasonId, nextGame?.id ?? null);

	const stranded = useMemo(() => (season ? findStrandedKit(kit, season.memberUids) : []), [kit, season]);

	if (loading || kitLoading) {
		return (
			<SeasonShell title='Kit' backHref={`/s/${seasonId}/members`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Kit' backHref={`/s/${seasonId}/members`}>
				<LoadFailed what='the kit register' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Kit' backHref={`/s/${seasonId}/members`}>
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
	// anything in it. Offering them a button that always fails would be worse
	// than not offering one.
	const canTransfer = isMember || isAdmin;

	const addPanel = isAdmin ? (
		adding ? (
			<section {...stylex.props(surfaces.glass, styles.addCard)}>
				<h2 {...stylex.props(styles.addTitle)}>Add to the kit list</h2>

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
					hint='Everything on this list is with somebody. Pick whoever has it now, it can be handed on from this screen.'
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

				<div {...stylex.props(styles.actions)}>
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
				<PlusIcon {...stylex.props(styles.plus)} aria-hidden='true' />
				Add kit
			</Button>
		)
	) : null;

	return (
		<>
			<SeasonShell title='Kit' subtitle={season.name} backHref={`/s/${seasonId}/members`}>
				<div {...stylex.props(styles.page)}>
					{kit.length === 0 ? (
						<EmptyState
							icon={<ShoppingBagIcon />}
							title='Nothing on the list'
							message={
								isAdmin
									? 'Add the ball and the vests and the app will tell you when nobody is bringing them.'
									: "An admin hasn't listed the group's balls or vests yet."
							}
							action={addPanel}
						/>
					) : (
						<>
							{/* What the register is for. Above the list, because
							    nobody opens this screen out of curiosity about a
							    bag. They open it before a game. */}
							{nextGame && (
								<section>
									<div {...stylex.props(styles.nextHead)}>
										<SectionHeading>
											{formatGameDate(nextGame.kickoff, season.slot.timezone)}
										</SectionHeading>
										{nextLifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
									</div>

									{/* Spelled out rather than left to the panel, which
									    would happily report that nobody is bringing a
									    ball to a game called off on Sunday. Both the
									    next-game card and the game screen already
									    suppress it for the same reason. This screen,
									    the one whose whole job is the ball, was the
									    one that didn't. */}
									{nextLifecycle === 'cancelled' ? (
										<p {...stylex.props(styles.off)}>
											This game is off, so there is nothing to bring to it.
										</p>
									) : (
										<GameKit
											seasonId={seasonId}
											items={kit}
											responses={responses}
											usersByUid={usersByUid}
										/>
									)}
								</section>
							)}

							{stranded.length > 0 && (
								<section {...stylex.props(styles.stranded)}>
									<div {...stylex.props(styles.strandedHead)}>
										<ExclamationTriangleIcon {...stylex.props(styles.warn)} aria-hidden='true' />
										<h2 {...stylex.props(styles.strandedTitle)}>Held by somebody who has left</h2>
									</div>
									<p {...stylex.props(styles.strandedBody)}>
										{stranded.map(item => item.name).join(', ')}, the person holding{' '}
										{stranded.length > 1 ? 'these' : 'this'} is no longer in the squad. Nothing has
										been guessed on your behalf; hand {stranded.length > 1 ? 'them' : 'it'} on below
										once you know who has {stranded.length > 1 ? 'them' : 'it'}.
									</p>
								</section>
							)}

							<section {...stylex.props(styles.groups)}>
								{groupKitByKind(kit).map(group => (
									<div key={group.kind}>
										<SectionHeading sx={styles.heading}>
											{KIT_KIND_LABELS[group.kind]}
										</SectionHeading>

										<ListCard>
											{group.items.map(item => {
												const holder = usersByUid.get(item.holderUid);
												const inSquad = season.memberUids.includes(item.holderUid);

												return (
													<div key={item.id} {...stylex.props(listRow, styles.row)}>
														<Avatar
															displayName={holder?.displayName ?? '?'}
															photoURL={holder?.photoURL ?? null}
														/>

														<div {...stylex.props(styles.body)}>
															{/* The name is its own control for an
															    admin rather than a third button on
															    the row: this row already carries two
															    on a phone, and the thing being
															    renamed is the obvious place to tap. */}
															{isAdmin ? (
																<button
																	type='button'
																	onClick={() => setRenaming(item)}
																	aria-label={`Rename ${item.name}`}
																	{...stylex.props(styles.rename, press.wash)}
																>
																	<span {...stylex.props(utils.truncate)}>
																		{item.name}
																	</span>
																	<PencilSquareIcon
																		{...stylex.props(styles.pencil)}
																		aria-hidden='true'
																	/>
																</button>
															) : (
																<p {...stylex.props(styles.name, utils.truncate)}>
																	{item.name}
																</p>
															)}
															<p {...stylex.props(styles.holder, utils.truncate)}>
																{displayNameOf(holder)}
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
																<TrashIcon
																	{...stylex.props(styles.trash)}
																	aria-hidden='true'
																/>
															</Button>
														)}
													</div>
												);
											})}
										</ListCard>
									</div>
								))}
							</section>

							{addPanel}

							<p {...stylex.props(styles.note)}>
								Anyone in the squad can hand a piece of kit on, no need to find an admin. A game is
								flagged when nobody bringing a ball or the vests has said they&apos;re playing.
							</p>
						</>
					)}
				</div>
			</SeasonShell>

			<KitRenameSheet
				item={renaming}
				open={!!renaming}
				onClose={() => setRenaming(null)}
				onRename={async name => {
					if (!renaming) return;

					await write(
						() => renameKitItem(seasonId, renaming.id, name, uid),
						`Couldn't rename ${renaming.name}.`
					);
				}}
			/>

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
