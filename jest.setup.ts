// Keep test output focused on failures: console.log/warn are silenced by
// default. A test can still assert a call happened (e.g.
// `expect(console.warn).toHaveBeenCalledWith(...)`) since these are spies,
// not stubs-with-no-record. Shared by every suite: the shared/, backend and
// rules configs point `setupFilesAfterEnv` straight at this file since they
// all resolve `<rootDir>` to the repo root; frontend/jest.setup.ts imports it
// because next/jest roots there instead.
beforeEach(() => {
	jest.spyOn(console, 'log').mockImplementation(() => {});
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	jest.restoreAllMocks();
});
