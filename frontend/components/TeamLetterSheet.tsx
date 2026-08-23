'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { AppUser, TournamentTeam } from '@shared/types';
import { displayNameOf } from '../lib/people';
import { classNames } from '../lib/utils/reactHelper';
import Button from './Button';
import StatusPill from './StatusPill';
import TeamBadge, { teamName } from './TeamBadge';

/**
 * Which letter this squad should have.
 *
 * The question people actually arrive with is "team A is still tying their
 * laces, can we start with the other two", and the answer is not a fixture
 * editor, it is this: team A is the first index, the rotation always opens A
 * against B, so saying the squad that is ready is A puts them on first. One
 * idea instead of two, and the bibs, the scoreboard and the table all keep
 * agreeing because they all read the same index.
 *
 * Each row names two or three of the squad it would swap with, because a letter
 * on its own is not something anybody can pick between at the side of a pitch:
 * "make them A" is a decision about who team A currently is.
 */
const TeamLetterSheet = ({
	team,
	teams,
	usersByUid,
	open,
	onClose,
	onSwap,
}: {
	/** The squad whose letter is being changed. */
	team: TournamentTeam | null;
	teams: TournamentTeam[];
	usersByUid: Map<string, AppUser>;
	open: boolean;
	onClose: () => void;
	onSwap: (withIndex: number) => Promise<void>;
}) => {
	// Enough to recognise a side by, and no more, a full squad list per row
	// turns a four-team sheet into something you have to scroll and read.
	const nameFew = (squad: TournamentTeam): string => {
		const names = squad.uids.slice(0, 2).map(uid => displayNameOf(usersByUid.get(uid)).split(' ')[0]);
		const rest = squad.uids.length - names.length;

		return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ');
	};

	return (
		<Dialog open={open && !!team} onClose={onClose} className='relative z-50'>
			<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

			<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
				<DialogPanel className='glass shadow-lift animate-rise mb-safe flex max-h-[80vh] w-full max-w-sm flex-col rounded-3xl p-5'>
					<DialogTitle className='text-ink text-lg font-semibold'>
						Which team is {team ? nameFew(team) : ''}?
					</DialogTitle>

					<p className='text-muted mt-1 text-sm'>
						The first two teams kick off, so this is how you start with a side that is ready. They swap
						letters. Nobody changes team.
					</p>

					<ul className='-mx-1 mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto px-1'>
						{teams.map(candidate => {
							const isCurrent = candidate.index === team?.index;

							return (
								<li key={candidate.index}>
									<button
										type='button'
										disabled={isCurrent}
										onClick={async () => {
											await onSwap(candidate.index);
											onClose();
										}}
										className={classNames(
											'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
											isCurrent ? 'opacity-60' : 'hover:bg-white/5 active:bg-white/10'
										)}
									>
										<TeamBadge index={candidate.index} size='md' />
										<span className='min-w-0 flex-1'>
											<span className='text-ink block text-sm font-semibold'>
												Team {teamName(candidate.index)}
											</span>
											<span className='text-faint block truncate text-xs'>
												{isCurrent ? 'Where they are now' : `Swaps with ${nameFew(candidate)}`}
											</span>
										</span>
										{isCurrent && (
											<StatusPill tone='brand'>
												<CheckIcon className='size-3' aria-hidden='true' />
												Now
											</StatusPill>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					<Button variant='ghost' fullWidth onClick={onClose} className='mt-3 shrink-0'>
						Cancel
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default TeamLetterSheet;
