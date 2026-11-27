import { render, screen, within } from '@testing-library/react';
import Storylines from './Storylines';

describe('Storylines', () => {
	it('tells each storyline', () => {
		render(
			<Storylines
				storylines={[
					{ kind: 'winRun', uid: 'ana', count: 3 },
					{ kind: 'debut', uid: 'rui' },
				]}
				personOf={uid => ({ uid, displayName: uid === 'ana' ? 'Ana' : 'Rui', photoURL: null })}
			/>
		);

		expect(screen.getByText('Ana has won 3 in a row')).toBeInTheDocument();
		expect(screen.getByText('First game for Rui')).toBeInTheDocument();
	});

	it('tags each storyline with what kind it is, beside the player', () => {
		render(
			<Storylines
				storylines={[{ kind: 'milestone', uid: 'ana', target: 80 }]}
				personOf={uid => ({ uid, displayName: 'Ana', photoURL: null })}
			/>
		);

		const item = screen.getByRole('listitem');
		expect(within(item).getByText('Milestone')).toBeInTheDocument();
		expect(within(item).getByTitle('Ana')).toBeInTheDocument();
	});

	it('draws nothing without a storyline', () => {
		const { container } = render(
			<Storylines storylines={[]} personOf={uid => ({ uid, displayName: '', photoURL: null })} />
		);

		expect(container).toBeEmptyDOMElement();
	});
});
