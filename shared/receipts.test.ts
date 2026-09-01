import {
	RECEIPT_MAX_BYTES,
	defaultReceiptName,
	formatFileSize,
	receiptFileName,
	receiptKindLabel,
	receiptObjectPath,
	receiptProblem,
} from './receipts';

describe('receiptObjectPath', () => {
	it('is derived from the two ids and carries no extension', () => {
		expect(receiptObjectPath('season-1', 'abc123')).toBe('seasons/season-1/receipts/abc123');
	});
});

describe('receiptFileName', () => {
	it('appends the extension the content type says', () => {
		expect(receiptFileName({ name: 'Pitch invoice, spring 2026', contentType: 'application/pdf' })).toBe(
			'Pitch invoice, spring 2026.pdf'
		);
	});

	// Otherwise a file picked as `kvitto.jpeg` comes back as `kvitto.jpeg.jpg`.
	it('leaves a name that already spells the extension alone', () => {
		expect(receiptFileName({ name: 'kvitto.jpeg', contentType: 'image/jpeg' })).toBe('kvitto.jpeg');
		expect(receiptFileName({ name: 'KVITTO.PDF', contentType: 'application/pdf' })).toBe('KVITTO.PDF');
	});

	it('keeps Swedish letters and drops what a filesystem would argue with', () => {
		expect(receiptFileName({ name: 'Hyra för våren: bana 3/4', contentType: 'application/pdf' })).toBe(
			'Hyra för våren bana 3 4.pdf'
		);
	});

	it('falls back to a name when there is nothing left of one', () => {
		expect(receiptFileName({ name: '///', contentType: 'application/pdf' })).toBe('receipt.pdf');
	});

	// Nothing writes one, since the rules allow three types. It is here because
	// a name with no extension at all beats one that lies about the bytes.
	it('adds nothing to a type it does not know', () => {
		expect(receiptFileName({ name: 'mystery', contentType: 'application/zip' })).toBe('mystery');
	});
});

describe('defaultReceiptName', () => {
	it('turns a filename into a label', () => {
		expect(defaultReceiptName('pitch_invoice-spring_2026.pdf')).toBe('pitch invoice spring 2026');
	});

	it('leaves a name with no extension as it is', () => {
		expect(defaultReceiptName('Kvitto')).toBe('Kvitto');
	});
});

describe('formatFileSize', () => {
	it('counts in powers of ten, the way a phone does', () => {
		expect(formatFileSize(0)).toBe('0 B');
		expect(formatFileSize(940)).toBe('940 B');
		expect(formatFileSize(318_000)).toBe('318 kB');
		expect(formatFileSize(2_400_000)).toBe('2.4 MB');
	});

	// The limit is the number people read most often, and "10.0 MB" reads as a
	// measurement where "10 MB" reads as a rule.
	it('drops a trailing nought', () => {
		expect(formatFileSize(RECEIPT_MAX_BYTES)).toBe('10 MB');
	});
});

describe('receiptKindLabel', () => {
	it('names the three kinds and nothing else', () => {
		expect(receiptKindLabel('application/pdf')).toBe('PDF');
		expect(receiptKindLabel('image/png')).toBe('PNG');
		expect(receiptKindLabel('text/csv')).toBe('File');
	});
});

describe('receiptProblem', () => {
	it('passes a PDF inside the limit', () => {
		expect(receiptProblem({ type: 'application/pdf', size: 400_000 })).toBeNull();
	});

	it('refuses a type payroll will not open', () => {
		expect(receiptProblem({ type: 'application/zip', size: 1000 })).toMatch(/PDF/);
	});

	it('names the size and the limit when a file is too big', () => {
		const problem = receiptProblem({ type: 'image/jpeg', size: 40_000_000 });

		expect(problem).toContain('40 MB');
		expect(problem).toContain('10 MB');
	});

	it('refuses an empty file', () => {
		expect(receiptProblem({ type: 'application/pdf', size: 0 })).toBe('That file is empty.');
	});
});
