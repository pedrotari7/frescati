import { render, screen, within } from '@testing-library/react';
import FormGuide from './FormGuide';

const names = new Map([
	['ana', 'Ana'],
	['rui', 'Rui'],
]);

describe('FormGuide', () => {
	it('lists each result with a label a screen reader can say', () => {
		render(<FormGuide form={[{ uid: 'ana', results: ['W', 'D', 'L'] }]} nameOf={uid => names.get(uid)!} />);

		const row = screen.getByRole('listitem', { name: 'Ana' });
		expect(within(row).getByLabelText('won')).toHaveTextContent('W');
		expect(within(row).getByLabelText('drew')).toHaveTextContent('D');
		expect(within(row).getByLabelText('lost')).toHaveTextContent('L');
	});

	it('says debut for somebody who has never played', () => {
		render(<FormGuide form={[{ uid: 'rui', results: [] }]} nameOf={uid => names.get(uid)!} />);

		expect(within(screen.getByRole('listitem', { name: 'Rui' })).getByText('Debut')).toBeInTheDocument();
	});
});
