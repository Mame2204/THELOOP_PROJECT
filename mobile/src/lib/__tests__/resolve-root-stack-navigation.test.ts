import { resolveRootStackNavigation } from '@/lib/resolve-root-stack-navigation';

describe('resolveRootStackNavigation', () => {
  it('remonte jusqu’à la pile contenant VisitorGateway', () => {
    const root = {
      getState: () => ({ routeNames: ['Tabs', 'EventDetail', 'VisitorGateway'] }),
      navigate: jest.fn(),
    };
    const tab = {
      getState: () => ({ routeNames: ['Accueil', 'Agenda'] }),
      getParent: () => root,
    };
    expect(resolveRootStackNavigation(tab)).toBe(root);
  });

  it('retourne la nav d’origine si aucune pile racine trouvée', () => {
    const leaf = { navigate: jest.fn() };
    expect(resolveRootStackNavigation(leaf)).toBe(leaf);
  });
});
