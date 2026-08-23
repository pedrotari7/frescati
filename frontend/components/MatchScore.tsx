'use client';

import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { Fixture } from '@shared/tournament';
import type { TournamentMatch } from '@shared/types';
import TeamBadge, { teamName, teamStyle } from './TeamBadge';
import { classNames } from '../lib/utils/reactHelper';

/** Big enough to hit with a cold thumb, in a coat, in the dark. */
const Stepper = ({
	value,
	onChange,
	disabled,
	label,
	tone,
}: {
	value: number | null;
	onChange: (next: number) => void;
	disabled: boolean;
	label: string;
	/** The scoring team's colour, so the number itself says whose it is. */
	tone: string;
}) => (
	<div className='flex items-center gap-1'>
		<button
			type='button'
			aria-label={`${label} one fewer`}
			disabled={disabled || (value ?? 0) === 0}
			onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
			className='text-muted hover:text-ink tap-44 flex size-9 items-center justify-center rounded-lg bg-white/5 transition-colors disabled:pointer-events-none disabled:opacity-30'
		>
			<MinusIcon className='size-4' aria-hidden='true' />
		</button>

		{/* Named for the same reason the headcount is: it is a number an
		    end-to-end test has to read back to know a tap became a write, and
		    the alternative is finding it by its position between two buttons. */}
		<span
			data-testid={`score-${label}`}
			className={classNames(
				'w-7 text-center text-xl font-bold tabular-nums',
				value === null ? 'text-faint' : tone
			)}
		>
			{value ?? '–'}
		</span>

		<button
			type='button'
			aria-label={`${label} one more`}
			disabled={disabled}
			onClick={() => onChange((value ?? 0) + 1)}
			className='text-muted hover:text-ink tap-44 flex size-9 items-center justify-center rounded-lg bg-white/5 transition-colors disabled:pointer-events-none disabled:opacity-30'
		>
			<PlusIcon className='size-4' aria-hidden='true' />
		</button>
	</div>
);

/**
 * One fixture on the scoreboard.
 *
 * A match with no document has never been played, so both sides read `–`
 * rather than `0`. Tapping either stepper is what brings it into existence,
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
	const [styleA, styleB] = [teamStyle(fixture.teamA), teamStyle(fixture.teamB)];

	return (
		// Each half of the row is washed in the colour of the side that owns it,
		// so which stepper belongs to whom survives a glance rather than needing
		// the letter read. `glass-card` sets a background *colour*; this is an
		// image over it, so the frosting stays.
		<li
			className={classNames(
				'glass-card rounded-2xl bg-gradient-to-r via-transparent p-3',
				styleA.washFrom,
				styleB.washTo
			)}
		>
			<div className='mb-2 flex items-center justify-between gap-2'>
				<span className='text-faint text-xs'>
					Match {fixture.order + 1} · {sideSize} a side
				</span>

				{/* Named rather than left as "Clear", because a scoreboard draws
				    one of these per fixture and a screen reader handed four
				    identical buttons cannot say which match any of them is
				    about. `tap-44` because the label alone is about sixteen
				    pixels tall and this deletes a scoreline. */}
				{match && canScore && (
					<button
						type='button'
						onClick={() => onClear()}
						aria-label={`Clear the score for match ${fixture.order + 1}`}
						className='text-faint hover:text-out tap-44 -m-1.5 rounded-lg p-1.5 text-xs transition-colors active:bg-white/5'
					>
						Clear
					</button>
				)}
			</div>

			<div className='flex items-center justify-between gap-1'>
				<TeamBadge index={fixture.teamA} />

				<Stepper
					value={scoreA}
					disabled={!canScore}
					tone={styleA.text}
					label={`Team ${teamName(fixture.teamA)}`}
					onChange={next => onScore(next, scoreB ?? 0)}
				/>

				<span className='text-faint text-xs'>v</span>

				<Stepper
					value={scoreB}
					disabled={!canScore}
					tone={styleB.text}
					label={`Team ${teamName(fixture.teamB)}`}
					onChange={next => onScore(scoreA ?? 0, next)}
				/>

				<TeamBadge index={fixture.teamB} />
			</div>
		</li>
	);
};

export default MatchScore;
