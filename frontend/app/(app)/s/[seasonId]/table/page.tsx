'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { getRatingLadder, getSeasonTable, toDisplayMovement } from '@shared/leaderboard';
import type { SeasonResult, SeasonSort } from '@shared/leaderboard';
import { toDisplayRating } from '@shared/rating';
import { counted, formatGameDate, placeLabel, signed } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useSeasonLedger, useUsersByUid } from '../../../../../hooks/useData';
import { displayNameOf, nameByUid } from '../../../../../lib/people';
import { useAuth } from '../../../../../lib/auth';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';
import { bp, colors, tint } from '../../../../tokens.stylex';
import { focus, surfaces, utils } from '../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },

	tabs: { display: 'flex', gap: 4, borderRadius: 16, padding: 4 },
	tab: {
		appearance: 'none',
		borderWidth: 0,
		backgroundColor: 'transparent',
		height: 40,
		flexGrow: 1,
		borderRadius: 12,
		fontFamily: 'inherit',
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
		cursor: 'pointer',
		transitionProperty: 'background-color, color',
		transitionDuration: '0.2s',
	},
	/*
	 * One complete declaration per state rather than a hover layered over a
	 * base. A later style in a `stylex.props` call replaces a property outright,
	 * conditions and all, so `{ ':hover': ink }` on top of `{ default: muted }`
	 * would drop the resting colour instead of adding to it.
	 */
	tabOn: { backgroundColor: colors.brand, color: colors.canvas },
	tabOff: { color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } } },

	sortRow: { display: 'flex', alignItems: 'center', gap: 8, paddingInline: 4 },
	sortLabel: { color: colors.faint, fontSize: 12, lineHeight: '16px', fontWeight: 600 },
	sortGroup: { display: 'flex', gap: 4, borderRadius: 9999, padding: 4 },
	sortChip: {
		appearance: 'none',
		borderWidth: 0,
		backgroundColor: 'transparent',
		height: 36,
		borderRadius: 9999,
		paddingInline: 12,
		fontFamily: 'inherit',
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		cursor: 'pointer',
		transitionProperty: 'background-color, color',
		transitionDuration: '0.2s',
	},
	sortOn: { backgroundColor: tint.white12, color: colors.ink },
	sortOff: { color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } } },

	list: { overflow: 'hidden', borderRadius: 24 },
	/* The dividers `divide-y` drew, moved onto the rows: StyleX has no sibling
	   selector, so the rule has to hang off the row itself. Same shape as
	   `Section`'s `listRow`, a shade lighter, which is what this list had. */
	item: {
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white6,
	},
	row: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingInline: 16,
		paddingBlock: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	/* Your own row keeps its wash and brightens on hover. Under Tailwind the
	   hover rule won and took it from 6% to 5%, so pointing at yourself dimmed
	   the one row that was meant to stand out. */
	mine: { backgroundColor: { default: tint.white6, [bp.hover]: { default: null, ':hover': tint.white10 } } },

	place: {
		color: colors.faint,
		width: 36,
		flexShrink: 0,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		fontVariantNumeric: 'tabular-nums',
	},
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	played: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	figure: {
		color: colors.ink,
		width: 40,
		textAlign: 'right',
		fontSize: 18,
		lineHeight: '28px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},

	note: { color: colors.faint, paddingInline: 4, fontSize: 12, lineHeight: '16px' },

	form: { display: 'flex', width: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
	dot: { width: 6, height: 6, borderRadius: 9999 },
	won: { backgroundColor: colors.brand },
	lost: { backgroundColor: tint.white20 },
});

type Tab = 'season' | 'all-time';

/**
 * The three ways to read a season, in the order the control offers them, the
 * default first. `getSeasonTable` carries the argument for why that one leads.
 */
const SORTS: { key: SeasonSort; label: string }[] = [
	{ key: 'won', label: 'Won' },
	{ key: 'rating', label: 'Rating' },
	{ key: 'played', label: 'Played' },
];

/**
 * What each order means, said under the table it drew.
 *
 * A sentence per sort rather than one for all three, because the numbers on a
 * row never move, only their order does. Somebody who missed which column is
 * leading has nothing else on the screen to tell the three tables apart.
 */
const SORT_NOTES: Record<SeasonSort, string> = {
	won: 'Ordered on games won, then on how much rating you gained, who had a good season, rather than who is best.',
	rating: 'Ordered on rating gained, then on games won. How far the season moved you, where beating a stronger side counts for more than beating a weaker one.',
	played: 'Ordered on games played, then on games won. Who turned up, rather than how it went once they were there.',
};

/**
 * The last few games, oldest on the left, the way a form guide reads.
 *
 * Won or nothing, with no shade in between: a finishing place only means
 * something against the number of teams that played, and the ledger cannot say
 * how many there were, a tie for last is indistinguishable from a smaller
 * field. So the dot claims exactly what the win column beside it claims, and
 * the place goes in the title for anybody who wants it.
 *
 * Right-aligned in a fixed width so a newcomer's two dots line up under
 * everybody else's fifth, which is the one every eye goes to.
 */
const FormDots = ({ form, timezone }: { form: SeasonResult[]; timezone: string }) => (
	<span
		role='img'
		// Read out as places rather than as won-and-not-won, which is the one
		// thing a dot can say and a sentence doesn't have to.
		aria-label={`Last ${counted(form.length, 'game')}, oldest first: ${form
			.map(game => placeLabel(game.position))
			.join(', ')}`}
		{...stylex.props(styles.form)}
	>
		{form.map(game => (
			<span
				key={game.gameId}
				title={`${placeLabel(game.position)} · ${formatGameDate(game.kickoff, timezone)}`}
				{...stylex.props(styles.dot, game.won ? styles.won : styles.lost)}
			/>
		))}
	</span>
);

const LeaderboardPage = () => {
	const { seasonId, season, loading, error, retry } = useSeasonContext();
	const { entries, loading: ledgerLoading } = useSeasonLedger(seasonId);
	const { users, usersByUid } = useUsersByUid();
	const { user } = useAuth();
	const [tab, setTab] = useState<Tab>('season');
	const [sort, setSort] = useState<SeasonSort>('won');

	const seasonTable = useMemo(() => getSeasonTable(entries, seasonId, sort), [entries, seasonId, sort]);
	const ladder = useMemo(() => getRatingLadder(users), [users]);

	if (loading || ledgerLoading) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<LoadFailed what='the table' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Table' backHref={`/s/${seasonId}`}>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	const rows = tab === 'season' ? seasonTable : ladder;

	const name = (uid: string) => nameByUid(usersByUid, uid);

	return (
		<SeasonShell title='Table' subtitle={season.name} backHref={`/s/${seasonId}`}>
			<div {...stylex.props(styles.page)}>
				{/* A pair of toggles rather than a tablist, which would want
				    `aria-controls` and a `tabpanel` for a table that is just the
				    rest of the page. `aria-pressed` is what says which one is on:
				    without it the active tab was a colour and nothing else, so a
				    screen reader got "This season, button. All time, button" with
				    no way to tell which table was underneath. */}
				<div {...stylex.props(surfaces.glass, styles.tabs)} role='group' aria-label='Which table to show'>
					{(
						[
							['season', 'This season'],
							['all-time', 'All time'],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type='button'
							aria-pressed={tab === key}
							onClick={() => setTab(key)}
							{...stylex.props(styles.tab, focus.ring, tab === key ? styles.tabOn : styles.tabOff)}
						>
							{label}
						</button>
					))}
				</div>

				{/* Over the season table only, which is the one with three
				    numbers to choose between. The all-time ladder is the rating
				    ladder by definition, and it has no wins column to offer
				    anyway. Smaller and rounder than the toggle above it, and grey
				    rather than green when it is on, so two rows of buttons don't
				    read as two sets of tabs. */}
				{tab === 'season' && (
					<div {...stylex.props(styles.sortRow)}>
						<span id='season-sort-label' {...stylex.props(styles.sortLabel)}>
							Sort
						</span>

						<div
							{...stylex.props(surfaces.glass, styles.sortGroup)}
							role='group'
							aria-labelledby='season-sort-label'
						>
							{SORTS.map(({ key, label }) => (
								<button
									key={key}
									type='button'
									aria-pressed={sort === key}
									onClick={() => setSort(key)}
									// h-9 because it is a thumb, not a pointer. The text
									// is small to keep this behind the toggle above it.
									// The target it sits in is not.
									{...stylex.props(
										styles.sortChip,
										focus.ring,
										sort === key ? styles.sortOn : styles.sortOff
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				)}

				{rows.length === 0 ? (
					<EmptyState
						icon={<TrophyIcon />}
						title='Nothing to show yet'
						message={
							tab === 'season'
								? 'The table fills in as games get confirmed.'
								: 'Ratings appear once somebody has played a confirmed game.'
						}
					/>
				) : (
					<ul {...stylex.props(surfaces.glass, styles.list)}>
						{rows.map(row => {
							const shared = rows.filter(other => other.position === row.position).length > 1;
							const profile = usersByUid.get(row.uid);

							return (
								<li key={row.uid} {...stylex.props(styles.item)}>
									<Link
										href={`/u/${row.uid}`}
										{...stylex.props(styles.row, row.uid === user?.uid && styles.mine)}
									>
										<span {...stylex.props(styles.place)}>{placeLabel(row.position, shared)}</span>

										<Avatar
											displayName={displayNameOf(profile)}
											photoURL={profile?.photoURL}
											size='sm'
										/>

										<div {...stylex.props(styles.body)}>
											<p {...stylex.props(styles.name, utils.truncate)}>{name(row.uid)}</p>
											<p {...stylex.props(styles.played)}>
												{'wins' in row
													? `${row.appearances} played · ${row.wins} won`
													: `${row.games} played`}
											</p>
										</div>

										{'form' in row && row.form.length > 0 && (
											<FormDots form={row.form} timezone={season.slot.timezone} />
										)}

										{'provisional' in row && row.provisional && (
											<StatusPill tone='pending'>Settling</StatusPill>
										)}

										<span {...stylex.props(styles.figure)}>
											{'elo' in row
												? toDisplayRating(row.elo)
												: signed(toDisplayMovement(row.movement))}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}

				<p {...stylex.props(styles.note)}>
					{tab === 'season'
						? `${SORT_NOTES[sort]} The dots are the last five games, oldest first, and a filled one is a win. The number reads the whole season and rounds once, so adding up the per game changes on a profile can land a point or two either side of it.`
						: 'Your rating follows you across every season. It moves on how your team did against how it was expected to, so beating a stronger side is worth more, and beating them comfortably more again.'}
				</p>
			</div>
		</SeasonShell>
	);
};

export default LeaderboardPage;
