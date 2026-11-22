import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PayeeOption } from '@shared/types';
import type { PayeeChoice } from '../lib/seasonForm';
import PayeePicker from './PayeePicker';

const options: PayeeOption[] = [
	{ uid: 'ana', displayName: 'Anna', hasNumber: true },
	{ uid: 'mateo', displayName: 'Mateo', hasNumber: false },
];

const Harness = ({ initial, list = options }: { initial: PayeeChoice; list?: PayeeOption[] | null }) => {
	const [choice, setChoice] = useState(initial);

	return <PayeePicker label='Season fee paid to' choice={choice} onChange={setChoice} options={list} />;
};

describe('PayeePicker', () => {
	it('lists the admins by name and marks the ones with no number', () => {
		render(<Harness initial={{ kind: 'admin', uid: 'ana' }} />);

		const labels = screen.getAllByRole('option').map(option => option.textContent);

		expect(labels).toEqual(['Anna', 'Mateo (no number saved)', 'Custom number']);
		expect(screen.getByLabelText('Season fee paid to')).toHaveValue('ana');
		expect(screen.queryByLabelText('Swish number')).not.toBeInTheDocument();
	});

	it('reveals a text field on Custom number, limited to twenty characters', () => {
		render(<Harness initial={{ kind: 'admin', uid: 'ana' }} />);

		fireEvent.change(screen.getByLabelText('Season fee paid to'), { target: { value: '__custom' } });

		const input = screen.getByLabelText('Swish number');

		expect(input).toHaveAttribute('maxlength', '20');

		fireEvent.change(input, { target: { value: '0701234567' } });

		expect(input).toHaveValue('0701234567');
	});

	it('picks an admin from a custom number', () => {
		render(<Harness initial={{ kind: 'custom', swish: '0701234567' }} />);

		expect(screen.getByLabelText('Swish number')).toHaveValue('0701234567');

		fireEvent.change(screen.getByLabelText('Season fee paid to'), { target: { value: 'mateo' } });

		expect(screen.queryByLabelText('Swish number')).not.toBeInTheDocument();
	});

	it('says so while the admins load', () => {
		render(<Harness initial={{ kind: 'custom', swish: '' }} list={null} />);

		expect(screen.getByLabelText('Season fee paid to')).toBeDisabled();
	});
});
