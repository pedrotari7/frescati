'use client';

import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { Fixture } from '@shared/tournament';
import type { TournamentMatch } from '@shared/types';
import { teamName } from './TeamCard';
import { classNames } from '../lib/utils/reactHelper';

const TEAM_TEXT = ['text-team-a', 'text-team-b', 'text-team-c', 'text-team-d'];

/** Big enough to hit with a cold thumb, in a coat, in the dark. */
const Stepper = ({
	value,
	onChange,
	disabled,
	label,
}: {
	value: number | null;
	onChange: (next: number) => void;
	disabled: boolean;
	label: string;
}) => (
	<div className='flex items-center gap-1'>
		<button
			type='button'
			aria-label={`${label} one fewer`}
			disabled={disabled || (value ?? 0) === 0}
			onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
			className='text-muted hover:text-ink flex size-9 items-center justify-center rounded-lg bg-white/5 transition-colors disabled:pointer-events-none disabled:opacity-30'
		>
			<MinusIcon className='size-4' aria-hidden='true' />
		</button>

		<span
			className={classNames(
				'w-8 text-center text-xl font-bold tabular-nums',
				value === null ? 'text-faint' : 'text-ink'
			)}
		>
			{value ?? '–'}
		</span>

		<button
			type='button'
			aria-label={`${label} one more`}
			disabled={disabled}
			onClick={() => onChange((value ?? 0) + 1)}
			className='text-muted hover:text-ink flex size-9 items-center justify-center rounded-lg bg-white/5 transition-colors disabled:pointer-events-none disabled:opacity-30'
		>
			<PlusIcon className='size-4' aria-hidden='true' />
		</button>
	</div>
);

/**
 * One fixture on the scoreboard.
 *
 * A match with no document has never been played, so both sides read `–`
 * rather than `0`. Tapping either stepper is what brings it into existence —
 * which is why the first tap on the away side still has to send a `0` for the
 * home side, not leave it null.
 */
const MatchScore = ({
	fixture,
	match,
	sideSize,
	canScore,
	onScore,
	onClear,
}: {
	fixture: Fixture;
	match: TournamentMatch | undefined;
	sideSize: number;
	canScore: boolean;
	onScore: (scoreA: number, scoreB: number) => Promise<void> | void;
	onClear: () => Promise<void> | void;
}) => {
	const [scoreA, scoreB] = [match?.scoreA ?? null, match?.scoreB ?? null];

	return (
		<li className='glass-card rounded-2xl p-3'>
			<div className='mb-2 flex items-center justify-between gap-2'>
				<span className='text-faint text-xs'>
					Match {fixture.order + 1} · {sideSize} a side
				</span>

				{match && canScore && (
					<button
						type='button'
						onClick={() => onClear()}
						className='text-faint hover:text-out text-xs transition-colors'
					>
						Clear
					</button>
				)}
			</div>

			<div className='flex items-center justify-between gap-2'>
				<span className={classNames('w-14 text-sm font-bold', TEAM_TEXT[fixture.teamA])}>
					{teamName(fixture.teamA)}
				</span>

				<Stepper
					value={scoreA}
					disabled={!canScore}
					label={`Team ${teamName(fixture.teamA)}`}
					onChange={next => onScore(next, scoreB ?? 0)}
				/>

				<span className='text-faint text-xs'>v</span>

				<Stepper
					value={scoreB}
					disabled={!canScore}
					label={`Team ${teamName(fixture.teamB)}`}
					onChange={next => onScore(scoreA ?? 0, next)}
				/>

				<span className={classNames('w-14 text-right text-sm font-bold', TEAM_TEXT[fixture.teamB])}>
					{teamName(fixture.teamB)}
				</span>
			</div>
		</li>
	);
};

export default MatchScore;
