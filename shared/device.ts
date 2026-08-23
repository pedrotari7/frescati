/**
 * Reading a user agent string back into something a human can act on.
 *
 * Only the admin notification screen needs this, and only to answer one
 * question: when somebody says they aren't getting notifications, what are they
 * on and can that device even receive one? A registration token carries the
 * user agent it was created with, so the answer is already stored. It just
 * needs decoding.
 *
 * Deliberately coarse. This is not analytics and nothing branches on it: a
 * wrong guess makes a label read "Desktop" instead of "iPhone", and there is no
 * behaviour behind it to get wrong. That is the trade for parsing a string
 * nobody promises the shape of.
 */

export type DevicePlatform = 'ios' | 'android' | 'desktop' | 'unknown';

export interface DeviceDescription {
	platform: DevicePlatform;
	/** Browser family, or an empty string when nothing matched. */
	browser: string;
}

/**
 * Order matters twice over. Every Chromium browser puts `Chrome/` in its user
 * agent, so Edge, Opera and Samsung have to be recognised before it or they all
 * come back as Chrome; and every iOS browser is WebKit and appends
 * `Safari/`, so Safari can only be identified by what is *not* there.
 */
const BROWSERS: [RegExp, string][] = [
	[/Edg(iOS|A)?\//, 'Edge'],
	[/OPR\/|OPiOS\/|Opera/, 'Opera'],
	[/SamsungBrowser\//, 'Samsung Internet'],
	[/CriOS\/|Chrome\//, 'Chrome'],
	[/FxiOS\/|Firefox\//, 'Firefox'],
	[/Safari\//, 'Safari'],
];

/**
 * `iPad` disappeared from the user agent in iPadOS 13, which reports itself as
 * a Mac. There is no way to tell the two apart from the string alone. The
 * browser-side check adds `navigator.maxTouchPoints`, which nothing server-side
 * has. An iPad therefore reads as a desktop here, which is wrong but harmless.
 */
const platformOf = (userAgent: string): DevicePlatform => {
	if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
	if (/Android/.test(userAgent)) return 'android';
	if (/Mozilla|AppleWebKit|Gecko/.test(userAgent)) return 'desktop';

	return 'unknown';
};

export const describeUserAgent = (userAgent: string): DeviceDescription => ({
	platform: platformOf(userAgent),
	browser: BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? '',
});

const PLATFORM_LABELS: Record<DevicePlatform, string> = {
	ios: 'iPhone',
	android: 'Android',
	desktop: 'Desktop',
	unknown: 'Unknown device',
};

export const platformLabel = (platform: DevicePlatform): string => PLATFORM_LABELS[platform];

/** `iPhone · Safari`, or just the platform when the browser didn't match. */
export const describeDevice = ({ platform, browser }: DeviceDescription): string =>
	browser ? `${platformLabel(platform)} · ${browser}` : platformLabel(platform);
