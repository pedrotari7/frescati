'use client';

import * as stylex from '@stylexjs/stylex';
import type { TeamStanding } from '@shared/types';
import { placeLabel } from '@shared/format';
import TeamBadge from './TeamBadge';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	scroller: { overflowX: 'auto' },
	table: { width: '100%', minWidth: 304, fontSize: 14, lineHeight: '20px' },
	headRow: {
		color: colors.faint,
		textAlign: 'left',
		fontSize: 11,
		letterSpacing: '0.025em',
		textTransform: 'uppercase',
	},
	th: { paddingBottom: 8, fontWeight: 600 },
	thCentre: { textAlign: 'center' },
	thRight: { textAlign: 'right' },

	row: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: tint.white6 },
	place: { color: colors.faint, paddingBlock: 8, fontVariantNumeric: 'tabular-nums' },
	badgeCell: { paddingBlock: 8, whiteSpace: 'nowrap' },
	stat: { color: colors.muted, paddingBlock: 8, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
	points: {
		color: colors.ink,
		paddingBlock: 8,
		textAlign: 'right',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},

	note: { color: colors.faint, marginTop: 12, fontSize: 12, lineHeight: '16px' },
});

/**
 * The table.
 *
 * Positions can repeat, teams nothing separates share a place, so the
 * ordinal is read from `position` rather than the row index, and a shared
 * place shows on both rows rather than silently promoting one of them.
 */
const StandingsTable = ({ standings, unequal }: { standings: TeamStanding[]; unequal: boolean }) => {
	const ordered = [...standings].sort((a, b) => a.position - b.position || a.team - b.team);

	return (
		<div>
			<div {...stylex.props(styles.scroller)}>
				<table {...stylex.props(styles.table)}>
					<thead>
						<tr {...stylex.props(styles.headRow)}>
							<th {...stylex.props(styles.th)}>Pos</th>
							<th {...stylex.props(styles.th)}>Team</th>
							<th {...stylex.props(styles.th, styles.thCentre)}>P</th>
							<th {...stylex.props(styles.th, styles.thCentre)}>W</th>
							<th {...stylex.props(styles.th, styles.thCentre)}>D</th>
							<th {...stylex.props(styles.th, styles.thCentre)}>L</th>
							<th {...stylex.props(styles.th, styles.thCentre)}>GD</th>
							<th {...stylex.props(styles.th, styles.thRight)}>Pts</th>
						</tr>
					</thead>

					<tbody>
						{ordered.map(row => {
							const shared = ordered.filter(other => other.position === row.position).length > 1;

							return (
								<tr key={row.team} {...stylex.props(styles.row)}>
									<td {...stylex.props(styles.place)}>{placeLabel(row.position, shared)}</td>
									<td {...stylex.props(styles.badgeCell)}>
										<TeamBadge index={row.team} />
									</td>
									<td {...stylex.props(styles.stat)}>{row.played}</td>
									<td {...stylex.props(styles.stat)}>{row.won}</td>
									<td {...stylex.props(styles.stat)}>{row.drawn}</td>
									<td {...stylex.props(styles.stat)}>{row.lost}</td>
									<td {...stylex.props(styles.stat)}>
										{row.goalDifference > 0 && '+'}
										{row.goalDifference}
									</td>
									<td {...stylex.props(styles.points)}>{row.points}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{unequal && (
				<p {...stylex.props(styles.note)}>
					Teams have played different numbers of matches, so the table is ordered on points per match.
				</p>
			)}
		</div>
	);
};

export default StandingsTable;
