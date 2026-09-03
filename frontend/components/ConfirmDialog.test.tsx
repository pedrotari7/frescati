import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';

const Trigger = ({ onResult }: { onResult: (value: boolean) => void }) => {
	const confirm = useConfirm();

	return (
		<button
			type='button'
			onClick={async () => {
				const result = await confirm({ title: 'Delete this game?', message: 'This cannot be undone.' });
				onResult(result);
			}}
		>
			ask
		</button>
	);
};

describe('useConfirm', () => {
	it('defaults to resolving true outside a provider, so a test never hangs on a dialog nobody shows', async () => {
		const onResult = vi.fn();

		render(<Trigger onResult={onResult} />);

		await act(async () => {
			fireEvent.click(screen.getByText('ask'));
		});

		expect(onResult).toHaveBeenCalledWith(true);
	});
});

describe('ConfirmProvider', () => {
	it('shows the title and message once asked', () => {
		render(
			<ConfirmProvider>
				<Trigger onResult={vi.fn()} />
			</ConfirmProvider>
		);

		fireEvent.click(screen.getByText('ask'));

		expect(screen.getByText('Delete this game?')).toBeInTheDocument();
		expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
	});

	it('resolves false and closes the dialog on cancel', async () => {
		const onResult = vi.fn();

		render(
			<ConfirmProvider>
				<Trigger onResult={onResult} />
			</ConfirmProvider>
		);

		fireEvent.click(screen.getByText('ask'));

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		});

		expect(onResult).toHaveBeenCalledWith(false);
		expect(screen.queryByText('Delete this game?')).not.toBeInTheDocument();
	});

	it('resolves true and closes the dialog on confirm', async () => {
		const onResult = vi.fn();

		render(
			<ConfirmProvider>
				<Trigger onResult={onResult} />
			</ConfirmProvider>
		);

		fireEvent.click(screen.getByText('ask'));

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
		});

		expect(onResult).toHaveBeenCalledWith(true);
		expect(screen.queryByText('Delete this game?')).not.toBeInTheDocument();
	});

	it('uses a custom confirm label when one is given', () => {
		const Custom = () => {
			const confirm = useConfirm();
			return (
				<button type='button' onClick={() => confirm({ title: 'Remove player?', confirmLabel: 'Remove' })}>
					ask
				</button>
			);
		};

		render(
			<ConfirmProvider>
				<Custom />
			</ConfirmProvider>
		);

		fireEvent.click(screen.getByText('ask'));

		expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
	});
});
