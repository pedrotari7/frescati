import { render, screen } from '@testing-library/react';
import type { CopiedSettings } from '@shared/seasonCopy';
import CopiedSettingsSummary from './CopiedSettingsSummary';

const settings: CopiedSettings = {
	venue: { name: 'Frescati IP' },
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
	minPlayers: 10,
	responseDeadlineHours: 24,
	reminderHours: [72, 24],
	balance: { randomness: 0.3, repeatPenalty: 0.4, repeatLookback: 4, matchMinutes: 5 },
	fees: { total: 31240, perGame: 100 },
	adminUids: ['me', 'ana', 'bo'],
	copiedFrom: 's1',
};

describe('CopiedSettingsSummary', () => {
	it('names the fees, the deadline, the reminders and the other admins', () => {
		render(<CopiedSettingsSummary settings={settings} creatorUid='me' names={new Map()} />);

		const text = screen.getByText(/Also copied/).textContent;

		expect(text).toContain('31 240 kr');
		expect(text).toContain('100 kr per extra game');
		expect(text).toContain('deadline 24 h');
		expect(text).toContain('reminders 72 h and 24 h');
		expect(text).toContain('team balance');
		expect(text).toContain('2 other admins');
	});

	it('says nothing about fees or balance when the source had none', () => {
		const { balance: _balance, fees: _fees, ...bare } = settings;

		render(<CopiedSettingsSummary settings={{ ...bare, adminUids: ['me'] }} creatorUid='me' names={new Map()} />);

		const text = screen.getByText(/Also copied/).textContent;

		expect(text).not.toContain('kr');
		expect(text).not.toContain('team balance');
		expect(text).not.toContain('admin');
	});

	it('names who each fee is paid to, and calls a typed number a custom one', () => {
		const names = new Map([
			['ana', 'Anna'],
			['mateo', 'Mateo'],
		]);
		const paid = (payees: NonNullable<CopiedSettings['fees']>['payees']) =>
			render(
				<CopiedSettingsSummary
					settings={{ ...settings, fees: { total: 31240, perGame: 100, payees } }}
					creatorUid='me'
					names={names}
				/>
			);

		const { unmount } = paid({ entry: { uid: 'ana' }, extras: { uid: 'mateo' } });
		expect(screen.getByText(/Also copied/).textContent).toContain('season fee to Anna, extras to Mateo');
		unmount();

		paid({ entry: { uid: 'ana' }, extras: { swish: '0701234567' } });
		const text = screen.getByText(/Also copied/).textContent;
		expect(text).toContain('season fee to Anna, extras to a custom number');
		expect(text).not.toContain('0701234567');
	});

	it('renders nothing for a blank start', () => {
		const { container } = render(<CopiedSettingsSummary settings={null} creatorUid='me' names={new Map()} />);

		expect(container).toBeEmptyDOMElement();
	});
});
