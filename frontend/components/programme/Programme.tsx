'use client';

import * as stylex from '@stylexjs/stylex';
import { formatGameDateLong, formatGameTime } from '@shared/format';
import { colors } from '../../app/tokens.stylex';
import { useUsersByUid } from '../../hooks/useData';
import { useProgramme } from '../../hooks/useProgramme';
import { nameByUid } from '../../lib/people';
import EmptyState from '../EmptyState';
import LoadFailed from '../LoadFailed';
import { useSeasonContext } from '../SeasonProvider';
import SeasonShell from '../SeasonShell';
import Skeleton from '../Skeleton';
import FormGuide from './FormGuide';
import Odds from './Odds';
import RivalryPanel from './RivalryPanel';
import Storylines from './Storylines';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },
	kicker: { color: colors.brand, fontSize: 13, fontWeight: 600, margin: 0 },
});

/**
 * The matchday programme: tonight's odds, everybody's form, the rivalry and the
 * storylines, in the order a printed one would put them.
 *
 * Works on any day, so a link passed around still opens. Only the ways in are
 * kept to game day.
 */
const Programme = ({ seasonId, gameId }: { seasonId: string; gameId: string }) => {
	const { season, games, loading: seasonLoading } = useSeasonContext();
	const { usersByUid } = useUsersByUid();
	const { programme, loading, error, retry } = useProgramme(seasonId, gameId, true);
	const game = games.find(candidate => candidate.id === gameId);

	const backHref = `/s/${seasonId}/g/${gameId}`;
	const subtitle =
		season && game
			? `${formatGameDateLong(game.kickoff, season.slot.timezone)} · ${formatGameTime(game.kickoff, season.slot.timezone)}`
			: undefined;

	if (error) {
		return (
			<SeasonShell title='Matchday' backHref={backHref}>
				<LoadFailed what='the programme' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!seasonLoading && season && !game) {
		return (
			<SeasonShell title='Matchday' backHref={backHref}>
				<EmptyState title='Game not found' message='It may have been deleted from the calendar.' />
			</SeasonShell>
		);
	}

	if (loading || !programme) {
		return (
			<SeasonShell title='Matchday' backHref={backHref}>
				<Skeleton />
			</SeasonShell>
		);
	}

	const nameOf = (uid: string) => nameByUid(usersByUid, uid);

	return (
		<SeasonShell title='Matchday' subtitle={subtitle} backHref={backHref}>
			<div {...stylex.props(styles.page)}>
				{programme.pool.length === 0 ? (
					<EmptyState
						title='Nobody has said they are in yet'
						message='The programme fills in as people answer.'
					/>
				) : (
					<>
						<p {...stylex.props(styles.kicker)}>The programme</p>
						{programme.odds && <Odds odds={programme.odds} />}
						<Storylines storylines={programme.storylines} nameOf={nameOf} />
						{programme.rivalry && <RivalryPanel rivalry={programme.rivalry} nameOf={nameOf} />}
						<FormGuide form={programme.form} nameOf={nameOf} />
					</>
				)}
			</div>
		</SeasonShell>
	);
};

export default Programme;
