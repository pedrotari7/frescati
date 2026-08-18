'use client';

import Link from 'next/link';
import type { AppUser, GameResponse } from '@shared/types';
import { isAbsent, isConfirmed, sortResponses } from '@shared/game';
import { personRow } from '../lib/people';
import Avatar from './Avatar';
import StatusPill from './StatusPill';
import Button from './Button';
import { classNames } from '../lib/utils/reactHelper';

export interface RosterEntry {
	uid: string;
	displayName: string;
	photoURL: string | null;
	response: GameResponse | undefined;
}

/**
 * Build the full picture for a game: everyone on the season roster (answered or
 * not) plus any extras who put their hand up.
 *
 * Members with no response are included deliberately — "who hasn't answered" is
 * half the reason to open this screen.
 *
 * A no-show comes out of the group they answered into and into one of its own,
 * members before extras like every other list here. Leaving them among the
 * people who turned up, marked, was the first thing tried and it reads as a
 * footnote — the whole point of recording this is that it is not one.
 */
export const buildRoster = (
	memberUids: string[],
	responses: GameResponse[],
	usersByUid: Map<string, AppUser>
): {
	playing: RosterEntry[];
	absent: RosterEntry[];
	out: RosterEntry[];
	awaiting: RosterEntry[];
	extras: RosterEntry[];
} => {
	const byUid = new Map(responses.map(response => [response.uid, response]));

	const entry = (uid: string): RosterEntry => ({ ...personRow(usersByUid, uid), response: byUid.get(uid) });

	const members = memberUids.map(entry);
	const extraResponses = sortResponses(responses.filter(response => response.role === 'extra'));

	const noShow = (candidate: RosterEntry): boolean => !!candidate.response && isAbsent(candidate.response);

	return {
		playing: members.filter(member => member.response?.status === 'in' && !noShow(member)),
		out: members.filter(member => member.response?.status === 'out'),
		awaiting: members.filter(member => !member.response),
		extras: extraResponses
			.filter(response => response.status === 'in' && !isAbsent(response))
			.map(response => entry(response.uid)),
		absent: [...members.filter(noShow), ...extraResponses.filter(isAbsent).map(response => entry(response.uid))],
	};
};

const Row = ({
	entry,
	tone,
	struck = false,
	trailing,
}: {
	entry: RosterEntry;
	tone: 'in' | 'out' | 'pending' | 'extra';
	struck?: boolean;
	trailing?: React.ReactNode;
}) => (
	<div className='flex items-center gap-3 py-2 pr-1'>
		{/* Only the name is the link, not the whole row: an admin's Drop button
		    sits in `trailing`, and a <button> inside an <a> is invalid and breaks
		    keyboard navigation. */}
		<Link
			href={`/u/${entry.uid}`}
			className='flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-white/5'
		>
			<Avatar displayName={entry.displayName} photoURL={entry.photoURL} size='sm' />
			<span
				className={classNames(
					'min-w-0 flex-1 truncate text-sm',
					tone === 'out' || tone === 'pending' ? 'text-muted' : 'text-ink',
					struck && 'line-through'
				)}
			>
				{entry.displayName}
			</span>
		</Link>
		{trailing}
	</div>
);

const Section = ({
	title,
	tone,
	entries,
	struck = false,
	note,
	renderTrailing,
}: {
	title: string;
	tone: 'in' | 'out' | 'pending' | 'extra';
	entries: RosterEntry[];
	struck?: boolean;
	note?: string;
	renderTrailing?: (entry: RosterEntry) => React.ReactNode;
}) => {
	if (entries.length === 0) return null;

	return (
		<section>
			<div className='mb-1 flex items-center gap-2 px-1'>
				<h3 className='text-faint text-xs font-semibold tracking-wider uppercase'>{title}</h3>
				<StatusPill tone={tone}>{entries.length}</StatusPill>
			</div>
			{note && <p className='text-faint mb-1 px-1 text-xs'>{note}</p>}
			<div className='divide-y divide-white/5'>
				{entries.map(entry => (
					<Row key={entry.uid} entry={entry} tone={tone} struck={struck} trailing={renderTrailing?.(entry)} />
				))}
			</div>
		</section>
	);
};

const RosterList = ({
	memberUids,
	responses,
	usersByUid,
	canManageExtras = false,
	canReportAbsence = false,
	onToggleExtra,
	onToggleAbsent,
}: {
	memberUids: string[];
	responses: GameResponse[];
	usersByUid: Map<string, AppUser>;
	canManageExtras?: boolean;
	/**
	 * Whether a no-show is something anybody could yet know about — from
	 * kick-off onwards, and a season admin's call. `canReportAbsence` in
	 * `shared/game.ts` is the half of that about the clock.
	 */
	canReportAbsence?: boolean;
	onToggleExtra?: (uid: string, confirmed: boolean) => Promise<void>;
	onToggleAbsent?: (uid: string, absent: boolean) => Promise<void>;
}) => {
	const { playing, extras, absent, out, awaiting } = buildRoster(memberUids, responses, usersByUid);
	const byUid = new Map(responses.map(response => [response.uid, response]));

	// The handler itself rather than a boolean beside it, so every use below is
	// narrowed by the same check that decides whether to offer the button at all.
	const reportAbsence = canReportAbsence ? onToggleAbsent : undefined;

	const noShowButton = (entry: RosterEntry) =>
		reportAbsence ? (
			<Button size='sm' variant='ghost' onClick={() => reportAbsence(entry.uid, true)}>
				No-show
			</Button>
		) : null;

	return (
		<div className='space-y-5'>
			<Section title='Squad in' tone='in' entries={playing} renderTrailing={noShowButton} />

			<Section
				title='Extras'
				tone='extra'
				entries={extras}
				renderTrailing={entry => {
					// Past kick-off, whether an extra holds a spot is settled — they
					// are either on the pitch or they are not — so the row offers the
					// only question left about them rather than two buttons in the
					// width of a phone.
					if (reportAbsence) return noShowButton(entry);

					const response = byUid.get(entry.uid);
					const confirmed = response ? isConfirmed(response) : true;

					if (!canManageExtras || !onToggleExtra) {
						return confirmed ? (
							<StatusPill tone='extra'>Extra</StatusPill>
						) : (
							<StatusPill tone='neutral'>Awaiting a spot</StatusPill>
						);
					}

					return (
						<Button size='sm' variant='ghost' onClick={() => onToggleExtra(entry.uid, !confirmed)}>
							{confirmed ? 'Drop' : 'Give a spot'}
						</Button>
					);
				}}
			/>

			{/* Straight after the people who did turn up, because that is the list
			    it is the exception to — and above "Yet to answer", which is a
			    different failure and a much smaller one. */}
			<Section
				title='Didn’t show'
				tone='out'
				entries={absent}
				struck
				note='Said they were in.'
				renderTrailing={entry =>
					reportAbsence ? (
						<Button size='sm' variant='ghost' onClick={() => reportAbsence(entry.uid, false)}>
							Undo
						</Button>
					) : (
						<StatusPill tone='out'>No-show</StatusPill>
					)
				}
			/>

			<Section title='Yet to answer' tone='pending' entries={awaiting} />

			<Section title='Out' tone='out' entries={out} />
		</div>
	);
};

export default RosterList;
