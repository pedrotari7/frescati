import '@testing-library/jest-dom';
import '../jest.setup';

// jsdom has no layout engine, so it implements neither observer. Headless
// UI's anchored popovers (DatePicker's calendar) reach for both to track the
// trigger's position, without a stub, opening one throws in every test.
class ObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

global.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;
global.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;
