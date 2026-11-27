'use client';

import { use } from 'react';
import FullTimeScreen from '../../../../../../../components/fullTime/FullTimeScreen';

const FullTimePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);

	return <FullTimeScreen seasonId={seasonId} gameId={gameId} />;
};

export default FullTimePage;
