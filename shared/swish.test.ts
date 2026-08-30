import { swishAppUrl, swishQrPayload, toInternational, toLocal } from './swish';

describe('toInternational', () => {
	it('swaps a leading zero for the country code', () => {
		expect(toInternational('0701234567')).toBe('+46701234567');
	});

	it('leaves a number that already carries one alone', () => {
		expect(toInternational('+46701234567')).toBe('+46701234567');
	});

	it('reads 00 as the country code prefix it is', () => {
		expect(toInternational('0046701234567')).toBe('+46701234567');
	});

	it('drops the spaces and dashes people type numbers with', () => {
		expect(toInternational('070-123 45 67')).toBe('+46701234567');
	});

	it('assumes Sweden for a number written without any prefix', () => {
		expect(toInternational('701234567')).toBe('+46701234567');
	});
});

describe('toLocal', () => {
	it('is the inverse for a Swedish number', () => {
		expect(toLocal('+46701234567')).toBe('0701234567');
		expect(toLocal('0701234567')).toBe('0701234567');
	});

	it('keeps the digits of a number from somewhere else', () => {
		expect(toLocal('+4471234567')).toBe('4471234567');
	});
});

describe('swishQrPayload', () => {
	it('is the C-prefixed payload with everything locked', () => {
		expect(swishQrPayload({ payee: '0701234567', amount: 70, message: 'Frescati' })).toBe(
			'C0701234567;70;Frescati;0'
		);
	});

	it('uses the local form even when the number was given international', () => {
		expect(swishQrPayload({ payee: '+46701234567', amount: 70, message: '' })).toBe('C0701234567;70;;0');
	});

	it('url encodes a message with a space or a colon in it', () => {
		expect(swishQrPayload({ payee: '0701234567', amount: 70, message: 'Autumn: Anna Berg' })).toBe(
			'C0701234567;70;Autumn%3A%20Anna%20Berg;0'
		);
	});

	it('rounds to whole kronor', () => {
		expect(swishQrPayload({ payee: '0701234567', amount: 69.6, message: '' })).toBe('C0701234567;70;;0');
	});
});

describe('swishAppUrl', () => {
	const parse = (url: string): Record<string, unknown> =>
		JSON.parse(decodeURIComponent(url.replace('swish://payment?data=', '')));

	it('prefills the payee in international form and the amount as a number', () => {
		const data = parse(swishAppUrl({ payee: '0701234567', amount: 70, message: 'Frescati' }));

		expect(data).toEqual({
			version: 1,
			payee: { value: '+46701234567' },
			amount: { value: 70 },
			message: { value: 'Frescati' },
		});
	});

	it('leaves the message out entirely rather than sending it blank', () => {
		const data = parse(swishAppUrl({ payee: '0701234567', amount: 70, message: '' }));

		expect(data).not.toHaveProperty('message');
	});

	it('encodes the payload so the query string survives a reserved character', () => {
		const url = swishAppUrl({ payee: '0701234567', amount: 70, message: 'Autumn: Anna & Erik' });

		expect(url.startsWith('swish://payment?data=')).toBe(true);
		expect(url).not.toContain('&');
		expect(parse(url).message).toEqual({ value: 'Autumn: Anna & Erik' });
	});
});
