import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './lib/firebase';

setGlobalOptions({ region: REGION, maxInstances: 10 });

export { onResponseWrite } from './onResponseWrite';
export { onGameWrite } from './onGameWrite';
export { sendReminders } from './sendReminders';
export { setAppAdmin } from './setAppAdmin';
