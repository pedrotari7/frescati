'use client';

import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, GameResponse } from '@shared/types';
import { isAbsent, isConfirmed, sortResponses } from '@shared/game';
import { personRow } from '../lib/people';
import Avatar from './Avatar';
import StatusPill from './StatusPill';
import Button from './Button';
import { useConfirm } from './ConfirmDialog';
import { bp, colors, tint } from '../app/tokens.stylex';
import { text, utils } from '../lib/styles';

const styles = stylex.create({
	sections: { display: 'flex', flexDirection: 'column', gap: 20 },

	head: { marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, paddingInline: 4 },
	note: { color: colors.faint, marginBottom: 4, paddingInline: 4, fontSize: 12, lineHeight: '16px' },

	row: {
		/* The line between two people, drawn on the lower of them. `divide-y`,
		   which StyleX cannot express from the container. */
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 8,
		paddingRight: 4,
	},
	person: {
		display: 'flex',
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		alignItems: 'center',
		gap: 12,
		borderRadius: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		paddingInline: 4,
		paddingBlock: 4,
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	name: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%', fontSize: 14, lineHeight: '20px' },
	struck: { textDecorationLine: 'line-through' },
});

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
 * Members with no response are included deliberately: "who hasn't answered" is
 * half the reason to open this screen.
 *
 * A no-show comes out of the group they answered into and into one of its own,
 * members before extras like every other list here. Leaving them among the
 * people who turned up, marked, was the first thing tried and it reads as a
 * footnote, the whole point of recording this is that it is not one.
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
	<div {...stylex.props(styles.row)}>
		{/* Only the name is the link, not the whole row: an admin's Drop button
		    sits in `trailing`, and a <button> inside an <a> is invalid and breaks
		    keyboard navigation. */}
		<Link href={`/u/${entry.uid}`} {...stylex.props(styles.person)}>
			<Avatar displayName={entry.displayName} photoURL={entry.photoURL} size='sm' />
			<span
				{...stylex.props(
					styles.name,
					utils.truncate,
					tone === 'out' || tone === 'pending' ? text.muted : text.ink,
					struck && styles.struck
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
			<div {...stylex.props(styles.head)}>
				<h3 {...stylex.props(text.sectionHeading)}>{title}</h3>
				<StatusPill tone={tone}>{entries.length}</StatusPill>
			</div>
			{note && <p {...stylex.props(styles.note)}>{note}</p>}
			<div>
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
	 * Whether a no-show is something anybody could yet know about: from
	 * kick-off onwards, and a season admin's call. `canReportAbsence` in
	 * `shared/game.ts` is the half of that about the clock.
	 */
	canReportAbsence?: boolean;
	onToggleExtra?: (uid: string, confirmed: boolean) => Promise<void>;
	onToggleAbsent?: (uid: string, absent: boolean) => Promise<void>;
}) => {
	const { playing, extras, absent, out, awaiting } = buildRoster(memberUids, responses, usersByUid);
	const byUid = new Map(responses.map(response => [response.uid, response]));
	const confirm = useConfirm();

	// The handler itself rather than a boolean beside it, so every use below is
	// narrowed by the same check that decides whether to offer the button at all.
	const reportAbsence = canReportAbsence ? onToggleAbsent : undefined;

	/**
	 * Weighted like the thing it is, and asked about before it lands.
	 *
	 * This sits at the end of a row for every single person who said they were
	 * in, on a screen an admin is thumbing through with a game going on, and it
	 * writes a public mark against a named person. As a ghost button it was the
	 * lightest thing on the row and a mistap away from accusing the wrong one.
	 * So it carries the same rose as the section it moves people into, and a
	 * second tap has to agree. Taking one back stays a single tap: nobody ever
	 * regretted clearing a mark.
	 */
	const noShowButton = (entry: RosterEntry) =>
		reportAbsence ? (
			<Button
				size='sm'
				variant='danger'
				onClick={async () => {
					const ok = await confirm({
						title: `Mark ${entry.displayName} as a no-show?`,
						message:
							'They said they were in. This says they never turned up, and the whole group can see it. Nothing else about the game moves, and you can take it back.',
						confirmLabel: 'Mark as a no-show',
						tone: 'danger',
					});

					if (ok) await reportAbsence(entry.uid, true);
				}}
			>
				No-show
			</Button>
		) : null;

	return (
		<div {...stylex.props(styles.sections)}>
			<Section title='Squad in' tone='in' entries={playing} renderTrailing={noShowButton} />

			<Section
				title='Extras'
				tone='extra'
				entries={extras}
				renderTrailing={entry => {
					const response = byUid.get(entry.uid);
					const confirmed = response ? isConfirmed(response) : true;

					// Past kick-off the row offers one question rather than two
					// buttons in the width of a phone, but which one depends on
					// whether they hold a spot, and that is also what tells the two
					// kinds of extra apart on a screen an admin is counting heads
					// from. Somebody who never held a spot cannot have failed to
					// use it, so the live question about them is still whether they
					// get one: they are the person who turned up in boots at five
					// past. For a confirmed extra it is whether they turned up at
					// all.
					if (reportAbsence && confirmed) return noShowButton(entry);

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
			    it is the exception to, and above "Yet to answer", which is a
			    different failure and a much smaller one. */}
			<Section
				title="Didn't show"
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
