import { swishAppUrl, toAlias, toInternational, toLocal } from './swish';

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

describe('toAlias', () => {
	it('is the country code with no plus and no leading zero', () => {
		expect(toAlias('0701234567')).toBe('46701234567');
	});

	it('gets there from whichever form an admin typed', () => {
		expect(toAlias('+46701234567')).toBe('46701234567');
		expect(toAlias('0046701234567')).toBe('46701234567');
		expect(toAlias('070-123 45 67')).toBe('46701234567');
	});

	it('is digits and only digits, which is the whole point', () => {
		expect(toAlias('+46 70-123 45 67')).toMatch(/^\d+$/);
	});
});

describe('swishAppUrl', () => {
	it("is the whole prefilled payment on Swish's own universal link host", () => {
		expect(swishAppUrl({ payee: '0701234567', amount: 70, message: 'Frescati' })).toBe(
			'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=70&cur=SEK&msg=Frescati&src=qr'
		);
	});

	/** A `+` here is the malformed link the Swish app opens on an error dialog. */
	it('spells the payee as digits whichever form the season stored', () => {
		expect(swishAppUrl({ payee: '+46701234567', amount: 70, message: '' })).toContain('sw=46701234567');
		expect(swishAppUrl({ payee: '070-123 45 67', amount: 70, message: '' })).not.toContain('+');
	});

	it('leaves the message out entirely rather than sending it blank', () => {
		const url = swishAppUrl({ payee: '0701234567', amount: 70, message: '' });

		expect(url).toBe('https://app.swish.nu/1/p/sw/?sw=46701234567&amt=70&cur=SEK&src=qr');
	});

	it('rounds to whole kronor, the same as the code beside it', () => {
		expect(swishAppUrl({ payee: '0701234567', amount: 69.6, message: '' })).toContain('amt=70');
	});

	/**
	 * A space is `%20` and not `+`, because the reference is read by eye by the
	 * admin reconciling the payment, and the ampersand would end the parameter.
	 */
	it('encodes a reference with a space or an ampersand in it', () => {
		const url = swishAppUrl({ payee: '0701234567', amount: 70, message: 'Autumn: Anna & Erik' });

		expect(url).toContain('msg=Autumn%3A%20Anna%20%26%20Erik&src=qr');
		expect(new URL(url).searchParams.get('msg')).toBe('Autumn: Anna & Erik');
	});

	/**
	 * `searchParams` form-decodes, which is the same thing the Swish app does, so
	 * this reads back as a plus only because the plus is escaped rather than left
	 * as the space `URLSearchParams` would have spelled it.
	 */
	it('escapes a plus, which a form decoder would otherwise read as a space', () => {
		const url = swishAppUrl({ payee: '0701234567', amount: 70, message: 'Anna +1' });

		expect(url).toContain('msg=Anna%20%2B1');
		expect(new URL(url).searchParams.get('msg')).toBe('Anna +1');
	});

	/** Omitting `edit` is what locks every field. Naming one would unlock it. */
	it('never says a field is editable', () => {
		expect(swishAppUrl({ payee: '0701234567', amount: 70, message: 'Frescati' })).not.toContain('edit=');
	});

	/**
	 * The reason a QR code can carry this and the `C0701234567;70;;0` payload it
	 * replaced could not. A camera offers to open a URL and does nothing at all
	 * with a line of text, so the payload only ever worked inside Swish's own
	 * scanner.
	 */
	it('is an https url, which is what a phone camera can act on', () => {
		const url = new URL(swishAppUrl({ payee: '0701234567', amount: 70, message: 'Frescati' }));

		expect(url.protocol).toBe('https:');
		expect(url.host).toBe('app.swish.nu');
	});
});
