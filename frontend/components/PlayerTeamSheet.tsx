'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CheckIcon, UserMinusIcon } from '@heroicons/react/24/outline';
import type { TournamentTeam } from '@shared/types';
import { counted } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';
import Button from './Button';
import StatusPill from './StatusPill';
import TeamBadge, { teamName } from './TeamBadge';

/**
 * Putting one player somewhere else.
 *
 * A sheet rather than a drag, because this is used one-handed at the side of a
 * pitch in the rain: a tap on a name and a tap on a letter is the whole
 * interaction, and there is no drop target small enough to miss.
 *
 * The squad they are already on stays in the list, marked, rather than being
 * filtered out — the same reason `KitTransferSheet` keeps the current holder.
 * Seeing where somebody is while choosing where they go is the context for the
 * choice, and a letter missing from A–D reads as a bug.
 *
 * "Off the team sheet" is last and separated, because it is the one option that
 * is not a move. It is here at all for the player who said In and never turned
 * up, and for the one who has to leave at half seven — both of whom are on a
 * squad the rotation is about to send onto the pitch.
 */
const PlayerTeamSheet = ({
	displayName,
	teams,
	currentIndex,
	open,
	onClose,
	onMove,
}: {
	displayName: string;
	teams: TournamentTeam[];
	/** Where they are now, or `-1` when they are on no squad. */
	currentIndex: number;
	open: boolean;
	onClose: () => void;
	onMove: (teamIndex: number | null) => Promise<void>;
}) => {
	// The last player out of a squad is refused by `setPlayerTeam` — an empty
	// team is a fixture against nobody — so the buttons that would hit that
	// refusal say why instead of failing.
	const isTheirLastTeammate = currentIndex >= 0 && teams[currentIndex]?.uids.length === 1;

	return (
		<Dialog open={open} onClose={onClose} className='relative z-50'>
			<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

			<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
				<DialogPanel className='glass shadow-lift animate-rise mb-safe flex max-h-[80vh] w-full max-w-sm flex-col rounded-3xl p-5'>
					<DialogTitle className='text-ink text-lg font-semibold'>Where is {displayName}?</DialogTitle>

					<p className='text-muted mt-1 text-sm'>
						{isTheirLastTeammate
							? 'They are the last one on their team, so this is a swap for another day — a team with nobody on it still gets a fixture.'
							: 'The teams stop being re-picked once you move somebody, so from here the sheet is yours to keep straight.'}
					</p>

					<ul className='-mx-1 mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto px-1'>
						{teams.map(team => {
							const isCurrent = team.index === currentIndex;

							return (
								<li key={team.index}>
									<button
										type='button'
										disabled={isCurrent || isTheirLastTeammate}
										onClick={async () => {
											await onMove(team.index);
											onClose();
										}}
										className={classNames(
											'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
											isCurrent || isTheirLastTeammate
												? 'opacity-60'
												: 'hover:bg-white/5 active:bg-white/10'
										)}
									>
										<TeamBadge index={team.index} size='md' />
										<span className='min-w-0 flex-1'>
											<span className='text-ink block text-sm font-semibold'>
												Team {teamName(team.index)}
											</span>
											<span className='text-faint block text-xs'>
												{counted(team.uids.length, 'player')}
											</span>
										</span>
										{isCurrent && (
											<StatusPill tone='brand'>
												<CheckIcon className='size-3' aria-hidden='true' />
												Here now
											</StatusPill>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					{currentIndex >= 0 && (
						<Button
							variant='danger'
							fullWidth
							disabled={isTheirLastTeammate}
							className='mt-3 shrink-0'
							onClick={async () => {
								await onMove(null);
								onClose();
							}}
						>
							<UserMinusIcon className='size-4' aria-hidden='true' />
							Off the team sheet
						</Button>
					)}

					<Button variant='ghost' fullWidth onClick={onClose} className='mt-2 shrink-0'>
						Cancel
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default PlayerTeamSheet;
