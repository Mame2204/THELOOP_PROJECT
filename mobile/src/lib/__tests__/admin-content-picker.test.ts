import { filterPickerEntries, type AdminPickerEntry } from '@/lib/admin-content-picker';

const items: AdminPickerEntry[] = [
  { id: '1', kind: 'spot', title: 'Hôtel Baie d’Or', subtitle: 'Dixinn', slug: 'hotel' },
  { id: '2', kind: 'spot', title: 'Le Comptoir', subtitle: 'Kaloum', slug: 'comptoir' },
  { id: '3', kind: 'tool', title: 'Nago', subtitle: 'Mobilité', slug: 'nago' },
  { id: '4', kind: 'event', title: 'Jazz au Comptoir', subtitle: '14 nov.', slug: 'jazz' },
];

describe('filterPickerEntries', () => {
  it('liste tout le type quand la recherche est vide', () => {
    expect(filterPickerEntries(items, 'spot', '').map((item) => item.id)).toEqual(['1', '2']);
  });

  it('ignore les accents et cherche dans le détail', () => {
    expect(filterPickerEntries(items, 'spot', 'hotel baie').map((item) => item.id)).toEqual(['1']);
    expect(filterPickerEntries(items, 'spot', 'kaloum').map((item) => item.id)).toEqual(['2']);
  });

  it('ne mélange pas les types', () => {
    expect(filterPickerEntries(items, 'tool', 'comptoir')).toEqual([]);
    expect(filterPickerEntries(items, 'event', 'jazz').map((item) => item.id)).toEqual(['4']);
  });
});
