import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './lib/firebase';

setGlobalOptions({ region: REGION, maxInstances: 10 });

export { onResponseWrite } from './onResponseWrite';
export { onGameWrite } from './onGameWrite';
export { onSeasonWrite } from './onSeasonWrite';
export { rebuildTeams } from './rebuildTeams';
export { finaliseTournament, finaliseDueTournaments, onMatchWrite } from './finaliseTournament';
export { onGameDeleted, onSeasonDeleted } from './cascadeDeletes';
export { sendReminders } from './sendReminders';
export { setAppAdmin } from './setAppAdmin';
