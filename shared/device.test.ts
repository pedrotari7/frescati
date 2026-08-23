import { describeDevice, describeUserAgent, platformLabel } from './device';

/** Real strings, copied off real devices. Invented ones prove nothing here. */
const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';
const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_SAMSUNG =
	'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WINDOWS_EDGE =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('describeUserAgent', () => {
	it('reads an iPhone', () => {
		expect(describeUserAgent(IPHONE_SAFARI)).toEqual({ platform: 'ios', browser: 'Safari' });
	});

	// Every iOS browser is WebKit underneath and appends `Safari/`, so the
	// wrappers have to be matched before Safari or they all read as Safari.
	it('tells the iOS browser wrappers apart from Safari', () => {
		expect(describeUserAgent(IPHONE_CHROME)).toEqual({ platform: 'ios', browser: 'Chrome' });
		expect(describeUserAgent(IPHONE_FIREFOX)).toEqual({ platform: 'ios', browser: 'Firefox' });
	});

	it('reads an Android phone', () => {
		expect(describeUserAgent(ANDROID_CHROME)).toEqual({ platform: 'android', browser: 'Chrome' });
	});

	// Same trap in the other direction: every Chromium browser carries
	// `Chrome/`, so the ones with their own marker have to win.
	it('does not call every Chromium browser Chrome', () => {
		expect(describeUserAgent(ANDROID_SAMSUNG).browser).toBe('Samsung Internet');
		expect(describeUserAgent(WINDOWS_EDGE).browser).toBe('Edge');
	});

	it('reads desktops', () => {
		expect(describeUserAgent(MAC_SAFARI)).toEqual({ platform: 'desktop', browser: 'Safari' });
		expect(describeUserAgent(WINDOWS_EDGE).platform).toBe('desktop');
		expect(describeUserAgent(LINUX_FIREFOX)).toEqual({ platform: 'desktop', browser: 'Firefox' });
	});

	// Tokens written before the app stored a user agent, and anything that
	// isn't a browser at all. Neither may throw. This runs over every stored
	// token to build one admin screen.
	it('gives up quietly on a string it cannot read', () => {
		expect(describeUserAgent('')).toEqual({ platform: 'unknown', browser: '' });
		expect(describeUserAgent('curl/8.4.0')).toEqual({ platform: 'unknown', browser: '' });
	});
});

describe('describeDevice', () => {
	it('joins the platform and the browser', () => {
		expect(describeDevice(describeUserAgent(IPHONE_SAFARI))).toBe('iPhone · Safari');
	});

	it('drops the separator when the browser is unknown', () => {
		expect(describeDevice({ platform: 'android', browser: '' })).toBe('Android');
		expect(describeDevice(describeUserAgent(''))).toBe('Unknown device');
	});
});

describe('platformLabel', () => {
	it('names every platform', () => {
		expect(platformLabel('ios')).toBe('iPhone');
		expect(platformLabel('android')).toBe('Android');
		expect(platformLabel('desktop')).toBe('Desktop');
		expect(platformLabel('unknown')).toBe('Unknown device');
	});
});
