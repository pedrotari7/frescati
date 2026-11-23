import { render, screen } from '@testing-library/react';
import type { SeasonRow } from '@shared/leaderboard';
import Podium from './Podium';

const row = (uid: string, position: number, wins: number) => ({ uid, position, wins }) as SeasonRow;
const names: Record<string, string> = { anna: 'Anna', bosse: 'Bosse', cia: 'Cia', dan: 'Dan' };
const nameOf = (uid: string) => names[uid];

describe('Podium', () => {
	// The winner stands in the middle, second on the left, third on the right.
	it('puts the winner in the middle', () => {
		render(<Podium rows={[row('anna', 0, 9), row('bosse', 1, 7), row('cia', 2, 5)]} nameOf={nameOf} />);

		const steps = screen.getAllByRole('listitem').map(step => step.textContent);

		expect(steps[0]).toContain('Bosse');
		expect(steps[1]).toContain('Anna');
		expect(steps[2]).toContain('Cia');
	});

	it('puts players level on the same step', () => {
		render(<Podium rows={[row('anna', 0, 9), row('bosse', 0, 9), row('cia', 2, 5)]} nameOf={nameOf} />);

		const steps = screen.getAllByRole('listitem');

		expect(steps).toHaveLength(2);
		expect(steps[0].textContent).toContain('Anna');
		expect(steps[0].textContent).toContain('Bosse');
		expect(steps[0].textContent).toContain('=1st');
		expect(steps[1].textContent).toContain('Cia');
	});

	it('says how many wins put them there', () => {
		render(<Podium rows={[row('anna', 0, 1)]} nameOf={nameOf} />);

		expect(screen.getByText('1 win')).toBeInTheDocument();
	});
});
