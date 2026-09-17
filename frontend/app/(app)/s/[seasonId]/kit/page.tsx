'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
	ExclamationTriangleIcon,
	PencilSquareIcon,
	PlusIcon,
	ShoppingBagIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Game, GameResponse, KitItem, KitKind, Season } from '@shared/types';
import type { GameLifecycle } from '@shared/game';
import { KIT_KINDS, KIT_KIND_LABELS, findStrandedKit, groupKitByKind } from '@shared/kit';
import { getGameLifecycle } from '@shared/game';
import { byDisplayName, formatGameDate } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useAuth } from '../../../../../lib/auth';
import { useKit, useResponses, useUsersByUid } from '../../../../../hooks/useData';
import type { PersonRow } from '../../../../../lib/people';
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
 * Open to everybody, and both of a member's controls with it. A ball changes
 * hands at the side of a pitch between two people, neither of whom is
 * necessarily an admin, and the person who turns up with a new one is the
 * person who knows it exists. Routing either through an admin means it never
 * gets recorded and the whole thing goes stale in a fortnight. Renaming,
 * re-kinding and removing stay with the admins, because those change what an
 * item already is for the whole squad.
 *
 * The next game sits at the top rather than the bottom: "who has the ball" is
 * only ever asked as a way of asking "is there a ball on Tuesday", and this is
 * the screen that can answer both.
 */
/** Why there is no register to show, drawn as the screen. */
const NoKit = ({
	reason,
	backHref,
	onRetry,
}: {
	reason: 'loading' | 'error' | 'missing';
	backHref: string;
	onRetry: () => void;
}) => (
	<SeasonShell title='Kit' backHref={backHref}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='the kit register' onRetry={onRetry} />}
		{reason === 'missing' && <EmptyState title='Season not found' />}
	</SeasonShell>
);

/**
 * Putting something new on the list.
 *
 * Nothing at all for an extra: they see the register and write nothing to it,
 * and offering them a button that always fails would be worse than not
 * offering one.
 */
const AddKit = ({
	seasonId,
	uid,
	squad,
	canWrite,
}: {
	seasonId: string;
	uid: string;
	squad: PersonRow[];
	canWrite: boolean;
}) => {
	const write = useWrite();
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState<{ name: string; kind: KitKind; holderUid: string }>({
		name: '',
		kind: 'ball',
		holderUid: '',
	});

	if (!canWrite) return null;

	if (!adding) {
		return (
			<Button variant='secondary' fullWidth onClick={() => setAdding(true)}>
				<PlusIcon {...stylex.props(styles.plus)} aria-hidden='true' />
				Add kit
			</Button>
		);
	}

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

	return (
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
				<Button variant='primary' fullWidth onClick={handleAdd} disabled={!form.name.trim() || !form.holderUid}>
					Add
				</Button>
				<Button variant='ghost' fullWidth onClick={() => setAdding(false)}>
					Cancel
				</Button>
			</div>
		</section>
	);
};

/**
 * What the register is for, above the list, because nobody opens this screen
 * out of curiosity about a bag. They open it before a game.
 *
 * A cancelled game is spelled out rather than left to the panel, which would
 * happily report that nobody is bringing a ball to a game called off on Sunday.
 * Both the next-game card and the game screen already suppress it for the same
 * reason. This screen, the one whose whole job is the ball, was the one that
 * did not.
 */
const NextGamePanel = ({
	game,
	lifecycle,
	timezone,
	seasonId,
	kit,
	responses,
	usersByUid,
}: {
	game: Game | null;
	lifecycle: GameLifecycle | null;
	timezone: string;
	seasonId: string;
	kit: KitItem[];
	responses: GameResponse[];
	usersByUid: Map<string, AppUser>;
}) => {
	if (!game) return null;

	return (
		<section>
			<div {...stylex.props(styles.nextHead)}>
				<SectionHeading>{formatGameDate(game.kickoff, timezone)}</SectionHeading>
				{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
			</div>

			{lifecycle === 'cancelled' ? (
				<p {...stylex.props(styles.off)}>This game is off, so there is nothing to bring to it.</p>
			) : (
				<GameKit seasonId={seasonId} items={kit} responses={responses} usersByUid={usersByUid} />
			)}
		</section>
	);
};

/**
 * Kit whose holder has left the squad.
 *
 * Nothing is guessed on anybody's behalf, so this says what is adrift and
 * leaves the handover to whoever knows where it went.
 */
const StrandedNotice = ({ stranded }: { stranded: KitItem[] }) => {
	if (stranded.length === 0) return null;

	const [these, them] = stranded.length > 1 ? ['these', 'them'] : ['this', 'it'];

	return (
		<section {...stylex.props(styles.stranded)}>
			<div {...stylex.props(styles.strandedHead)}>
				<ExclamationTriangleIcon {...stylex.props(styles.warn)} aria-hidden='true' />
				<h2 {...stylex.props(styles.strandedTitle)}>Held by somebody who has left</h2>
			</div>
			<p {...stylex.props(styles.strandedBody)}>
				{stranded.map(item => item.name).join(', ')}, the person holding {these} is no longer in the squad.
				Nothing has been guessed on your behalf; hand {them} on below once you know who has {them}.
			</p>
		</section>
	);
};

/** One piece of kit, and who has it. */
const KitRow = ({
	item,
	holder,
	inSquad,
	isAdmin,
	canWrite,
	onRename,
	onTransfer,
	onDelete,
}: {
	item: KitItem;
	holder: AppUser | undefined;
	inSquad: boolean;
	isAdmin: boolean;
	canWrite: boolean;
	onRename: () => void;
	onTransfer: () => void;
	onDelete: () => void;
}) => (
	<div {...stylex.props(listRow, styles.row)}>
		<Avatar displayName={holder?.displayName ?? '?'} photoURL={holder?.photoURL ?? null} />

		<div {...stylex.props(styles.body)}>
			{/* The name is its own control for an admin rather than a third button on
			    the row: this row already carries two on a phone, and the thing being
			    renamed is the obvious place to tap. */}
			{isAdmin ? (
				<button
					type='button'
					onClick={onRename}
					aria-label={`Rename ${item.name}`}
					{...stylex.props(styles.rename, press.wash)}
				>
					<span {...stylex.props(utils.truncate)}>{item.name}</span>
					<PencilSquareIcon {...stylex.props(styles.pencil)} aria-hidden='true' />
				</button>
			) : (
				<p {...stylex.props(styles.name, utils.truncate)}>{item.name}</p>
			)}
			<p {...stylex.props(styles.holder, utils.truncate)}>
				{displayNameOf(holder)}
				{!inSquad && <StatusPill tone='pending'>Left the squad</StatusPill>}
			</p>
		</div>

		{canWrite && (
			<Button size='sm' variant='secondary' onClick={onTransfer}>
				Hand over
			</Button>
		)}

		{isAdmin && (
			<Button size='sm' variant='danger' aria-label={`Remove ${item.name}`} onClick={onDelete}>
				<TrashIcon {...stylex.props(styles.trash)} aria-hidden='true' />
			</Button>
		)}
	</div>
);

/**
 * The four things this screen works out for itself.
 *
 * `nextGame` is the soonest game that has not been played, cancelled or not,
 * the same one the season home page calls "next", so the two screens cannot
 * disagree about which game the warning is about. `nextLifecycle` is whether
 * that game is actually on: a cancelled one is deliberately still the next one,
 * because a cancellation is exactly what people open the app to find out, but a
 * game that is off has nothing to bring to it, which is the one thing the panel
 * says.
 */
const useKitScreen = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin, isMember } = useSeasonContext();
	const { kit, loading: kitLoading } = useKit(seasonId);
	const { usersByUid } = useUsersByUid();
	const { user } = useAuth();
	const now = useNow();

	const squad = useMemo(
		() => (season ? season.memberUids.map(uid => personRow(usersByUid, uid)).sort(byDisplayName) : []),
		[season, usersByUid]
	);

	const nextGame = useMemo(
		() => (season ? (games.find(game => getGameLifecycle(game, season, now) !== 'finished') ?? null) : null),
		[games, season, now]
	);

	const nextLifecycle = useMemo(
		() => (season && nextGame ? getGameLifecycle(nextGame, season, now) : null),
		[season, nextGame, now]
	);

	const stranded = useMemo(() => (season ? findStrandedKit(kit, season.memberUids) : []), [kit, season]);

	const { responses } = useResponses(seasonId, nextGame?.id ?? null);

	return {
		seasonId,
		season,
		kit,
		usersByUid,
		responses,
		uid: user?.uid ?? '',
		loading: loading || kitLoading,
		error,
		retry,
		isAdmin,
		isMember,
		squad,
		nextGame,
		nextLifecycle,
		stranded,
	};
};

/** An empty register, which reads differently to somebody who can fill it. */
const NothingListed = ({ canWrite, addPanel }: { canWrite: boolean; addPanel: ReactNode }) => (
	<EmptyState
		icon={<ShoppingBagIcon />}
		title='Nothing on the list'
		message={
			canWrite
				? 'Add the ball and the vests and the app will tell you when nobody is bringing them.'
				: "Nobody has listed the group's balls or vests yet."
		}
		action={addPanel}
	/>
);

/** Renaming a piece of kit, and handing one on. Both open over the register. */
const KitSheets = ({
	seasonId,
	uid,
	squad,
	renaming,
	transferring,
	onClose,
}: {
	seasonId: string;
	uid: string;
	squad: PersonRow[];
	renaming: KitItem | null;
	transferring: KitItem | null;
	onClose: (item: null) => void;
}) => {
	const write = useWrite();

	return (
		<>
			<KitRenameSheet
				item={renaming}
				open={!!renaming}
				onClose={() => onClose(null)}
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
				onClose={() => onClose(null)}
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

/**
 * Taking something off the register.
 *
 * Asked first, because it stops counting towards every game as well as
 * disappearing from the list.
 */
const useRemoveKit = (seasonId: string) => {
	const write = useWrite();
	const confirm = useConfirm();

	return async (item: KitItem) => {
		const ok = await confirm({
			title: `Remove ${item.name}?`,
			message: 'It disappears from the register and stops counting towards any game.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => deleteKitItem(seasonId, item.id), `Couldn't remove ${item.name}.`);
	};
};

/** The register, a heading per kind of thing. */
const KitGroups = ({
	kit,
	memberUids,
	usersByUid,
	isAdmin,
	canWrite,
	onRename,
	onTransfer,
	onDelete,
}: {
	kit: KitItem[];
	memberUids: string[];
	usersByUid: Map<string, AppUser>;
	isAdmin: boolean;
	canWrite: boolean;
	onRename: (item: KitItem) => void;
	onTransfer: (item: KitItem) => void;
	onDelete: (item: KitItem) => void;
}) => (
	<section {...stylex.props(styles.groups)}>
		{groupKitByKind(kit).map(group => (
			<div key={group.kind}>
				<SectionHeading sx={styles.heading}>{KIT_KIND_LABELS[group.kind]}</SectionHeading>

				<ListCard>
					{group.items.map(item => (
						<KitRow
							key={item.id}
							item={item}
							holder={usersByUid.get(item.holderUid)}
							inSquad={memberUids.includes(item.holderUid)}
							isAdmin={isAdmin}
							canWrite={canWrite}
							onRename={() => onRename(item)}
							onTransfer={() => onTransfer(item)}
							onDelete={() => onDelete(item)}
						/>
					))}
				</ListCard>
			</div>
		))}
	</section>
);

/**
 * The register itself: what to bring to the next game, anything adrift, and
 * everything on the list by kind.
 */
const Register = ({
	seasonId,
	season,
	kit,
	responses,
	usersByUid,
	nextGame,
	nextLifecycle,
	stranded,
	isAdmin,
	isMember,
	uid,
	squad,
	onRename,
	onTransfer,
	onDelete,
}: {
	seasonId: string;
	season: Season;
	kit: KitItem[];
	responses: GameResponse[];
	usersByUid: Map<string, AppUser>;
	nextGame: Game | null;
	nextLifecycle: GameLifecycle | null;
	stranded: KitItem[];
	isAdmin: boolean;
	isMember: boolean;
	uid: string;
	squad: PersonRow[];
	onRename: (item: KitItem) => void;
	onTransfer: (item: KitItem) => void;
	onDelete: (item: KitItem) => void;
}) => {
	// What a member may write, matching the rules: hand any item to any other
	// member, and put a new one on the list. An extra sees the register and writes
	// nothing to it, and offering them a button that always fails would be worse
	// than not offering one.
	const canWrite = isMember || isAdmin;
	const addPanel = <AddKit seasonId={seasonId} uid={uid} squad={squad} canWrite={canWrite} />;

	if (kit.length === 0) {
		return (
			<div {...stylex.props(styles.page)}>
				<NothingListed canWrite={canWrite} addPanel={addPanel} />
			</div>
		);
	}

	return (
		<div {...stylex.props(styles.page)}>
			<NextGamePanel
				game={nextGame}
				lifecycle={nextLifecycle}
				timezone={season.slot.timezone}
				seasonId={seasonId}
				kit={kit}
				responses={responses}
				usersByUid={usersByUid}
			/>

			<StrandedNotice stranded={stranded} />

			<KitGroups
				kit={kit}
				memberUids={season.memberUids}
				usersByUid={usersByUid}
				isAdmin={isAdmin}
				canWrite={canWrite}
				onRename={onRename}
				onTransfer={onTransfer}
				onDelete={onDelete}
			/>

			{addPanel}

			<p {...stylex.props(styles.note)}>
				Anyone in the squad can add a piece of kit or hand one on, no need to find an admin. A game is flagged
				when nobody bringing a ball or the vests has said they&apos;re playing.
			</p>
		</div>
	);
};

const KitPage = () => {
	const {
		seasonId,
		season,
		kit,
		usersByUid,
		responses,
		uid,
		loading,
		error,
		retry,
		isAdmin,
		isMember,
		squad,
		nextGame,
		nextLifecycle,
		stranded,
	} = useKitScreen();
	const remove = useRemoveKit(seasonId);

	const [transferring, setTransferring] = useState<KitItem | null>(null);
	const [renaming, setRenaming] = useState<KitItem | null>(null);

	const closeSheets = () => {
		setRenaming(null);
		setTransferring(null);
	};

	const club = `/s/${seasonId}/members`;

	if (loading) return <NoKit reason='loading' backHref={club} onRetry={retry} />;
	if (error) return <NoKit reason='error' backHref={club} onRetry={retry} />;
	if (!season) return <NoKit reason='missing' backHref={club} onRetry={retry} />;

	return (
		<>
			<SeasonShell title='Kit' subtitle={season.name} backHref={`/s/${seasonId}/members`}>
				<Register
					seasonId={seasonId}
					season={season}
					kit={kit}
					responses={responses}
					usersByUid={usersByUid}
					nextGame={nextGame}
					nextLifecycle={nextLifecycle}
					stranded={stranded}
					isAdmin={isAdmin}
					isMember={isMember}
					uid={uid}
					squad={squad}
					onRename={setRenaming}
					onTransfer={setTransferring}
					onDelete={remove}
				/>
			</SeasonShell>

			<KitSheets
				seasonId={seasonId}
				uid={uid}
				squad={squad}
				renaming={renaming}
				transferring={transferring}
				onClose={closeSheets}
			/>
		</>
	);
};

export default KitPage;
