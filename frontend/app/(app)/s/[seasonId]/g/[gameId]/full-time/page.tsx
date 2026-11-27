'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import FullTimeScreen from '../../../../../../../components/fullTime/FullTimeScreen';

/** `?preview=1&player=` is the debug screen's way to show an app admin somebody's card. */
const FullTimePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);
	const searchParams = useSearchParams();

	return (
		<FullTimeScreen
			seasonId={seasonId}
			gameId={gameId}
			preview={searchParams.get('preview') === '1'}
			player={searchParams.get('player') ?? undefined}
		/>
	);
};

export default FullTimePage;
