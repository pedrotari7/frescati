import { render, screen, within } from '@testing-library/react';
import FormGuide from './FormGuide';

const names = new Map([
	['ana', 'Ana'],
	['rui', 'Rui'],
]);

describe('FormGuide', () => {
	it('lists each result with a label a screen reader can say', () => {
		render(
			<FormGuide
				form={[{ uid: 'ana', results: ['W', 'D', 'L'] }]}
				personOf={uid => ({ uid, displayName: names.get(uid)!, photoURL: null })}
			/>
		);

		const row = screen.getByRole('listitem', { name: 'Ana' });
		expect(within(row).getByLabelText('won')).toHaveTextContent('W');
		expect(within(row).getByLabelText('drew')).toHaveTextContent('D');
		expect(within(row).getByLabelText('lost')).toHaveTextContent('L');
	});

	it('says debut for somebody who has never played', () => {
		render(
			<FormGuide
				form={[{ uid: 'rui', results: [] }]}
				personOf={uid => ({ uid, displayName: names.get(uid)!, photoURL: null })}
			/>
		);

		expect(within(screen.getByRole('listitem', { name: 'Rui' })).getByText('Debut')).toBeInTheDocument();
	});
});
