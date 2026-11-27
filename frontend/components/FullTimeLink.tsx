import { SparklesIcon } from '@heroicons/react/24/outline';
import { useTournamentResult } from '../hooks/useData';
import { useAuth } from '../lib/auth';
import LinkCard from './LinkCard';

/**
 * The way back to your full-time card once the takeover has been and gone.
 * Only on a played game, and only for somebody the result rated, so the result
 * is not read for a game still to come.
 */
const FullTimeLink = ({ seasonId, gameId, played }: { seasonId: string; gameId: string; played: boolean }) => {
	const { user } = useAuth();
	const { result } = useTournamentResult(played ? seasonId : null, played ? gameId : null);
	const rated = !!user && !!result?.changes.some(change => change.uid === user.uid);

	if (!played || !rated) return null;

	return (
		<LinkCard
			href={`/s/${seasonId}/g/${gameId}/full-time`}
			icon={<SparklesIcon />}
			title='Your full-time card'
			detail='Your night, your rating, and an image to share'
		/>
	);
};

export default FullTimeLink;
