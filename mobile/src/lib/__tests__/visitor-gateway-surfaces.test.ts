import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parcours invité « favoris / rejoins le club » — tous doivent appeler
 * usePromptFavoritesSignup ou openSignupSheet (→ écran VisitorGateway, pas Modal racine).
 */
const SURFACES: Array<{ label: string; file: string; mustInclude: string[] }> = [
  { label: 'Accueil (listes + recherche)', file: 'screens/AccueilScreen.tsx', mustInclude: ['usePromptFavoritesSignup'] },
  { label: 'Agenda (liste)', file: 'screens/AgendaScreen.tsx', mustInclude: ['usePromptFavoritesSignup', 'USER_ANONYMOUS'] },
  { label: 'Spots (liste)', file: 'screens/SpotsScreen.tsx', mustInclude: ['usePromptFavoritesSignup', 'USER_ANONYMOUS'] },
  { label: 'Outils (liste)', file: 'screens/OutilsScreen.tsx', mustInclude: ['usePromptFavoritesSignup', 'USER_ANONYMOUS'] },
  { label: 'Fiche événement', file: 'screens/EventDetailScreen.tsx', mustInclude: ['usePromptFavoritesSignup', 'USER_ANONYMOUS'] },
  { label: 'Fiche spot / outil', file: 'screens/SpotDetailScreen.tsx', mustInclude: ['usePromptFavoritesSignup', 'USER_ANONYMOUS'] },
  { label: 'Fiche parcours', file: 'screens/LoopWalkDetailScreen.tsx', mustInclude: ['usePromptFavoritesSignup'] },
  { label: 'Liste parcours', file: 'screens/LoopWalksListScreen.tsx', mustInclude: ['usePromptFavoritesSignup'] },
  { label: 'Page partenaire publique', file: 'screens/PartnerPublicScreen.tsx', mustInclude: ['usePromptFavoritesSignup'] },
  { label: 'Privilèges sur fiche', file: 'components/ContentBenefitsSection.tsx', mustInclude: ['openSignupSheet'] },
  { label: 'Sondage Accueil', file: 'components/OneTapPoll.tsx', mustInclude: ['usePromptFavoritesSignup'] },
  { label: 'Onglet Profil invité', file: 'components/CustomTabBar.tsx', mustInclude: ['openSignupSheet'] },
];

/** Répertoire `mobile/src`. */
const mobileSrc = join(__dirname, '..', '..');

describe('VisitorGateway — surfaces favoris invité', () => {
  it('couvre tous les types de contenu listés', () => {
    expect(SURFACES.length).toBeGreaterThanOrEqual(10);
  });

  for (const surface of SURFACES) {
    it(surface.label, () => {
      const path = join(mobileSrc, surface.file);
      const source = readFileSync(path, 'utf8');
      for (const needle of surface.mustInclude) {
        expect(source).toContain(needle);
      }
    });
  }

  it('fiches détail catalogue utilisent withDetailPopup (iOS modal)', () => {
    const rootNav = readFileSync(join(mobileSrc, 'navigation/RootNavigator.tsx'), 'utf8');
    for (const name of ['EventDetail', 'SpotDetail', 'LoopWalkDetail', 'CreatorCornerDetail', 'FragmentDetail']) {
      expect(rootNav).toContain(`name="${name}"`);
    }
    expect(rootNav).toContain('withDetailPopup');
  });

  it("n'utilise plus Modal racine pour VisitorGatewaySheet", () => {
    const sheet = readFileSync(join(mobileSrc, 'components/VisitorGatewaySheet.tsx'), 'utf8');
    expect(sheet).not.toContain('<Modal');
    const ctx = readFileSync(join(mobileSrc, 'context/FavoritesSignupContext.tsx'), 'utf8');
    expect(ctx).toContain("navigateRoot('VisitorGateway')");
  });
});
