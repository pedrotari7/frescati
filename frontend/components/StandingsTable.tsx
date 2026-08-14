'use client';

import type { TeamStanding } from '@shared/types';
import { placeLabel } from '@shared/format';
import TeamBadge from './TeamBadge';

/**
 * The table.
 *
 * Positions can repeat — teams nothing separates share a place — so the
 * ordinal is read from `position` rather than the row index, and a shared
 * place shows on both rows rather than silently promoting one of them.
 */
const StandingsTable = ({ standings, unequal }: { standings: TeamStanding[]; unequal: boolean }) => {
	const ordered = [...standings].sort((a, b) => a.position - b.position || a.team - b.team);

	return (
		<div>
			<div className='overflow-x-auto'>
				<table className='w-full min-w-[19rem] text-sm'>
					<thead>
						<tr className='text-faint text-left text-[11px] tracking-wide uppercase'>
							<th className='pb-2 font-semibold'>Pos</th>
							<th className='pb-2 font-semibold'>Team</th>
							<th className='pb-2 text-center font-semibold'>P</th>
							<th className='pb-2 text-center font-semibold'>W</th>
							<th className='pb-2 text-center font-semibold'>D</th>
							<th className='pb-2 text-center font-semibold'>L</th>
							<th className='pb-2 text-center font-semibold'>GD</th>
							<th className='pb-2 text-right font-semibold'>Pts</th>
						</tr>
					</thead>

					<tbody>
						{ordered.map(row => {
							const shared = ordered.filter(other => other.position === row.position).length > 1;

							return (
								<tr key={row.team} className='border-t border-white/6'>
									<td className='text-faint py-2 tabular-nums'>{placeLabel(row.position, shared)}</td>
									<td className='py-2 whitespace-nowrap'>
										<TeamBadge index={row.team} />
									</td>
									<td className='text-muted py-2 text-center tabular-nums'>{row.played}</td>
									<td className='text-muted py-2 text-center tabular-nums'>{row.won}</td>
									<td className='text-muted py-2 text-center tabular-nums'>{row.drawn}</td>
									<td className='text-muted py-2 text-center tabular-nums'>{row.lost}</td>
									<td className='text-muted py-2 text-center tabular-nums'>
										{row.goalDifference > 0 && '+'}
										{row.goalDifference}
									</td>
									<td className='text-ink py-2 text-right font-bold tabular-nums'>{row.points}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{unequal && (
				<p className='text-faint mt-3 text-xs'>
					Teams have played different numbers of matches, so the table is ordered on points per match.
				</p>
			)}
		</div>
	);
};

export default StandingsTable;
