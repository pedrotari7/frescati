import { NewspaperIcon } from '@heroicons/react/24/outline';
import { isGameDay } from '@shared/matchday';
import type { Game, Season } from '@shared/types';
import LinkCard from './LinkCard';

/** The game screen's way into the programme, on game day only. */
const ProgrammeLink = ({ game, season, now }: { game: Game; season: Season; now: Date }) => {
	if (!isGameDay(game, season, now)) return null;

	return (
		<LinkCard
			href={`/s/${season.id}/g/${game.id}/programme`}
			icon={<NewspaperIcon />}
			title='Matchday programme'
			detail="Tonight's odds, form and the rivalry"
		/>
	);
};

export default ProgrammeLink;
