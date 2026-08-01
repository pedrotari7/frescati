'use client';

import type { AppUser, GameResponse } from '@shared/types';
import { isConfirmed, sortResponses } from '@shared/game';
import { shortName } from '@shared/format';
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
 */
export const buildRoster = (
	memberUids: string[],
	responses: GameResponse[],
	usersByUid: Map<string, AppUser>
): { playing: RosterEntry[]; out: RosterEntry[]; awaiting: RosterEntry[]; extras: RosterEntry[] } => {
	const byUid = new Map(responses.map(response => [response.uid, response]));

	const entry = (uid: string): RosterEntry => {
		const user = usersByUid.get(uid);

		return {
			uid,
			displayName: user?.displayName ?? 'Unknown player',
			photoURL: user?.photoURL ?? null,
			response: byUid.get(uid),
		};
	};

	const members = memberUids.map(entry);
	const extraResponses = sortResponses(responses.filter(response => response.role === 'extra'));

	return {
		playing: members.filter(m => m.response?.status === 'in'),
		out: members.filter(m => m.response?.status === 'out'),
		awaiting: members.filter(m => !m.response),
		extras: extraResponses.filter(response => response.status === 'in').map(response => entry(response.uid)),
	};
};

const Row = ({
	entry,
	tone,
	trailing,
}: {
	entry: RosterEntry;
	tone: 'in' | 'out' | 'pending' | 'extra';
	trailing?: React.ReactNode;
}) => (
	<div className='flex items-center gap-3 px-1 py-2'>
		<Avatar displayName={entry.displayName} photoURL={entry.photoURL} size='sm' />
		<span
			className={classNames(
				'flex-1 truncate text-sm',
				tone === 'out' || tone === 'pending' ? 'text-muted' : 'text-ink'
			)}
		>
			{shortName(entry.displayName)}
		</span>
		{trailing}
	</div>
);

const Section = ({
	title,
	tone,
	entries,
	renderTrailing,
}: {
	title: string;
	tone: 'in' | 'out' | 'pending' | 'extra';
	entries: RosterEntry[];
	renderTrailing?: (entry: RosterEntry) => React.ReactNode;
}) => {
	if (entries.length === 0) return null;

	return (
		<section>
			<div className='mb-1 flex items-center gap-2 px-1'>
				<h3 className='text-faint text-xs font-semibold tracking-wider uppercase'>{title}</h3>
				<StatusPill tone={tone}>{entries.length}</StatusPill>
			</div>
			<div className='divide-y divide-white/5'>
				{entries.map(entry => (
					<Row key={entry.uid} entry={entry} tone={tone} trailing={renderTrailing?.(entry)} />
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
	onToggleExtra,
}: {
	memberUids: string[];
	responses: GameResponse[];
	usersByUid: Map<string, AppUser>;
	canManageExtras?: boolean;
	onToggleExtra?: (uid: string, confirmed: boolean) => Promise<void>;
}) => {
	const { playing, extras, out, awaiting } = buildRoster(memberUids, responses, usersByUid);
	const byUid = new Map(responses.map(response => [response.uid, response]));

	return (
		<div className='space-y-5'>
			<Section title='Squad in' tone='in' entries={playing} />

			<Section
				title='Extras'
				tone='extra'
				entries={extras}
				renderTrailing={entry => {
					const response = byUid.get(entry.uid);
					const confirmed = response ? isConfirmed(response) : true;

					if (!canManageExtras || !onToggleExtra) {
						return confirmed ? (
							<StatusPill tone='extra'>Extra</StatusPill>
						) : (
							<StatusPill tone='neutral'>Not needed</StatusPill>
						);
					}

					return (
						<Button size='sm' variant='ghost' onClick={() => onToggleExtra(entry.uid, !confirmed)}>
							{confirmed ? 'Drop' : 'Add back'}
						</Button>
					);
				}}
			/>

			<Section title='Yet to answer' tone='pending' entries={awaiting} />

			<Section title='Out' tone='out' entries={out} />
		</div>
	);
};

export default RosterList;
