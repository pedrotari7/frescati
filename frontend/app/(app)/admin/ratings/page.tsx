'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { AppUser } from '@shared/types';
import { hasPlayed, toDisplayRating } from '@shared/rating';
import { counted } from '@shared/format';
import { useAuth } from '../../../../lib/auth';
import { useUsers } from '../../../../hooks/useData';
import { useWrite } from '../../../../hooks/useWrite';
import { setStartingRating } from '../../../../lib/db/ratings';
import { useToast } from '../../../../components/Toast';
import PageShell from '../../../../components/PageShell';
import AppAdminOnly from '../../../../components/AppAdminOnly';
import Skeleton from '../../../../components/Skeleton';
import Avatar from '../../../../components/Avatar';
import Button from '../../../../components/Button';
import StatusPill from '../../../../components/StatusPill';
import { RangeInput, SearchInput } from '../../../../components/Field';
import { ListCard, ListEmpty, listRow, SectionHeading } from '../../../../components/Section';
import { bp, colors, tint } from '../../../tokens.stylex';
import { utils } from '../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	heading: { marginBottom: 8, paddingInline: 4 },

	editor: {
		marginTop: 12,
		display: 'flex',
		flexDirection: 'column',
		gap: 12,
		borderRadius: 12,
		backgroundColor: tint.white5,
		padding: 12,
	},
	hint: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	actions: { display: 'flex', gap: 8 },
	/* Save takes the room and Clear keeps its own width, so the destructive one
	   is never the button under a thumb reaching for the other. */
	save: { flexGrow: 1, flexShrink: 1, flexBasis: '0%' },

	row: { paddingBlock: 12 },
	person: { display: 'flex', alignItems: 'center', gap: 12 },
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
	meta: { color: colors.faint, fontSize: 12, lineHeight: '16px' },

	rated: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	figure: {
		color: colors.ink,
		width: 40,
		textAlign: 'right',
		fontSize: 18,
		lineHeight: '28px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},

	note: { color: colors.faint, marginTop: 12, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
});

/**
 * Starting ratings: what an admin knows about a player before the ladder does.
 *
 * Its own screen rather than a column on the app-admin list, which is about a
 * role, or on a season's squad, which a rating outlives: a rating is global and
 * career-long, so a season is the wrong place to be editing one from.
 *
 * The split down the middle is the whole screen. Above the line are people
 * whose rating is still an estimate and still editable; below it are people the
 * ladder has had its say about, shown but not touchable: see
 * `setStartingRating` on the backend for why that isn't merely a house rule.
 */

/** Where the slider opens for somebody with no estimate yet: the middle. */
const DEFAULT_DISPLAY = 50;

/**
 * The rough shape of the scale, so an admin nudging a slider has something to
 * aim at rather than guessing what 70 is supposed to mean. Deliberately coarse,
 * and highest first so the first match wins, the number is an opening bid that
 * the first few games will correct anyway.
 */
const SCALE_HINT = [
	{ from: 80, label: 'Carries a team' },
	{ from: 65, label: 'One of the better players' },
	{ from: 50, label: 'Middle of the group' },
	{ from: 0, label: 'Still learning' },
];

const describeRating = (display: number): string => SCALE_HINT.find(step => display >= step.from)!.label;

/**
 * The slider, mounted only while a row is open.
 *
 * Its own component so the draft is born from `current` each time it opens
 * rather than surviving in a row that never unmounts, otherwise clearing
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
		<div {...stylex.props(styles.editor)}>
			<RangeInput
				min={0}
				max={100}
				step={1}
				value={draft}
				aria-label={`Starting rating for ${player.displayName}`}
				onChange={event => setDraft(Number(event.target.value))}
			/>

			<p {...stylex.props(styles.hint)}>{describeRating(draft)}</p>

			<div {...stylex.props(styles.actions)}>
				<Button size='sm' variant='primary' sx={styles.save} onClick={() => save(draft)}>
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
 * pass down a list: open, drag, save, next, and a modal per person turns that
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
		<div {...stylex.props(listRow, styles.row)}>
			<div {...stylex.props(styles.person)}>
				<Avatar displayName={player.displayName} photoURL={player.photoURL} />

				<div {...stylex.props(styles.body)}>
					<p {...stylex.props(styles.name, utils.truncate)}>{player.displayName}</p>
					<p {...stylex.props(styles.meta)}>
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
			<AppAdminOnly
				title='Starting ratings'
				message='This screen sets what a player is worth before they have played.'
			/>
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
			<div {...stylex.props(styles.page)}>
				<SearchInput
					label='Search by name'
					value={search}
					onChange={e => setSearch(e.target.value)}
					placeholder='Search by name'
				/>

				<section>
					<SectionHeading sx={styles.heading}>Yet to play ({estimated.length})</SectionHeading>

					<ListCard>
						{estimated.length === 0 && (
							<ListEmpty>
								{search
									? 'Nobody matches that search.'
									: 'Everybody signed up has played a rated game.'}
							</ListEmpty>
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
					</ListCard>

					<p {...stylex.props(styles.note)}>
						Left alone, a new player is worth the average of the season&apos;s rated members, which is the
						right guess for somebody you know nothing about, and the wrong one for somebody you do. A
						starting rating counts from their first game: the balancer uses it, and their first few results
						move them fast either way. It stays off the ladder until they have actually played.
					</p>
				</section>

				<section>
					<SectionHeading sx={styles.heading}>Rated ({rated.length})</SectionHeading>

					<ListCard>
						{rated.length === 0 && (
							<ListEmpty>
								{search ? 'Nobody matches that search.' : 'Nobody has played a confirmed game yet.'}
							</ListEmpty>
						)}

						{/* Only the earned side is a link: this is where an admin
						    asks whether a rating looks right, and the games behind
						    it are the answer. The estimated rows have a Set button,
						    and a <button> inside an <a> is invalid. */}
						{rated.map(player => (
							<Link key={player.uid} href={`/u/${player.uid}`} {...stylex.props(listRow, styles.rated)}>
								<Avatar displayName={player.displayName} photoURL={player.photoURL} />

								<div {...stylex.props(styles.body)}>
									<p {...stylex.props(styles.name, utils.truncate)}>{player.displayName}</p>
									<p {...stylex.props(styles.meta)}>{counted(player.rating!.games, 'rated game')}</p>
								</div>

								<span {...stylex.props(styles.figure)}>{toDisplayRating(player.rating!.elo)}</span>
							</Link>
						))}
					</ListCard>

					<p {...stylex.props(styles.note)}>
						These are earned, so they are not editable here. Every rated game records what each player
						carried into it, and a correction to any result rewinds and replays from there, an edit dropped
						on top would be undone by the next one. Fix a wrong rating by fixing the scores behind it.
					</p>
				</section>
			</div>
		</PageShell>
	);
};

export default RatingsAdminPage;
