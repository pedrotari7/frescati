import { saveBlob } from './download';

describe('saveBlob', () => {
	const createObjectURL = vi.fn(() => 'blob:frescati/1');
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();

		// jsdom implements neither, and both are the whole mechanism here.
		Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
		Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('clicks an anchor carrying the download name', () => {
		const clicked: HTMLAnchorElement[] = [];
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement
		) {
			clicked.push(this);
		});

		saveBlob(new Blob(['x']), 'Pitch invoice.pdf');

		expect(click).toHaveBeenCalledTimes(1);
		expect(clicked[0].download).toBe('Pitch invoice.pdf');
		expect(clicked[0].href).toBe('blob:frescati/1');

		click.mockRestore();
	});

	// Left in the tree it is a stray anchor per download; revoked in the same
	// task Safari cancels the download it has not read yet.
	it('takes the anchor back out and lets the blob go a moment later', () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		saveBlob(new Blob(['x']), 'kvitto.pdf');

		expect(document.querySelector('a')).toBeNull();
		expect(revokeObjectURL).not.toHaveBeenCalled();

		vi.runAllTimers();

		expect(revokeObjectURL).toHaveBeenCalledWith('blob:frescati/1');

		click.mockRestore();
	});
});
