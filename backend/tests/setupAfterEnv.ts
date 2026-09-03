/**
 * Clears call history between tests. Unlike the root vitest.setup.ts (shared/,
 * rules/, frontend), there's no restore step: the mocks installed in
 * setup.ts are plain assignments, not spies, precisely so nothing,
 * including a test file's own `vi.restoreAllMocks()`, can revert them
 * back to the real methods that `firebase-functions/logger` cached a direct
 * reference to at import time. See setup.ts for the full reasoning.
 */
import { beforeEach } from 'vitest';
import type { Mock } from 'vitest';

beforeEach(() => {
	(console.debug as Mock).mockClear();
	(console.info as Mock).mockClear();
	(console.log as Mock).mockClear();
	(console.warn as Mock).mockClear();
});
