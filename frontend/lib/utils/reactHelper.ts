export const classNames = (...classes: (string | false | null | undefined)[]): string =>
	classes.filter(Boolean).join(' ');

export const nowIso = (): string => new Date().toISOString();
