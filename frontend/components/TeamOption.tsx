'use client';

import { CheckIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import StatusPill from './StatusPill';
import TeamBadge, { teamName } from './TeamBadge';
import { colors } from '../app/tokens.stylex';
import { press, utils } from '../lib/styles';

const styles = stylex.create({
	option: {
		display: 'flex',
		width: '100%',
		alignItems: 'center',
		gap: 12,
		borderRadius: 12,
		borderWidth: 0,
		backgroundColor: 'transparent',
		paddingInline: 8,
		paddingBlock: 10,
		textAlign: 'left',
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	/* Dimmed rather than greyed: the row a disabled option names is still the
	   answer to "where are they now", so it has to stay readable. */
	shut: { opacity: 0.6 },
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	letter: { color: colors.ink, display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	note: { color: colors.faint, display: 'block', fontSize: 12, lineHeight: '16px' },
	check: { width: 12, height: 12 },
});

/**
 * One team in a sheet that asks you to pick one: a badge, the letter, a line of
 * detail under it, and a pill on the row you are already on.
 *
 * `PlayerTeamSheet` and `TeamLetterSheet` ask different questions, where should
 * this player go and which letter should this team carry, and drew the answer
 * with the same thirty lines and the same six styles, identical but for two key
 * names. The questions stay in the sheets; this is the row.
 *
 * `note` is the second line, which is the only part that differs by more than
 * wording: one counts the players on a team, the other names who a swap would
 * move. `pill` is what the row you are on says about itself.
 */
const TeamOption = ({
	index,
	note,
	pill,
	disabled,
	onPick,
}: {
	index: number;
	note: ReactNode;
	pill?: string;
	disabled?: boolean;
	onPick: () => void | Promise<void>;
}) => (
	<li>
		<button
			type='button'
			disabled={disabled}
			onClick={onPick}
			{...stylex.props(styles.option, disabled ? styles.shut : press.wash)}
		>
			<TeamBadge index={index} size='md' />

			<span {...stylex.props(styles.body)}>
				<span {...stylex.props(styles.letter)}>Team {teamName(index)}</span>
				<span {...stylex.props(styles.note, utils.truncate)}>{note}</span>
			</span>

			{pill && (
				<StatusPill tone='brand'>
					<CheckIcon {...stylex.props(styles.check)} aria-hidden='true' />
					{pill}
				</StatusPill>
			)}
		</button>
	</li>
);

export default TeamOption;
