'use client';

import { use } from 'react';
import Programme from '../../../../../../../components/programme/Programme';

const ProgrammePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { seasonId, gameId } = use(params);

	return <Programme seasonId={seasonId} gameId={gameId} />;
};

export default ProgrammePage;
