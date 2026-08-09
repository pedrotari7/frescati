/**
 * Clears call history between tests. Unlike the root jest.setup.ts (shared/,
 * rules/, frontend), there's no restore step: the mocks installed in
 * setup.ts are plain assignments, not spies, precisely so nothing —
 * including a test file's own `jest.restoreAllMocks()` — can revert them
 * back to the real methods that `firebase-functions/logger` cached a direct
 * reference to at import time. See setup.ts for the full reasoning.
 */
beforeEach(() => {
	(console.debug as jest.Mock).mockClear();
	(console.info as jest.Mock).mockClear();
	(console.log as jest.Mock).mockClear();
	(console.warn as jest.Mock).mockClear();
});
