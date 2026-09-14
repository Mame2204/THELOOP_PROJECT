import {
  accueilActiveToStatus,
  buildAdminAccueilContentList,
  cornerToAdminContentItem,
  logoToAdminContentItem,
  walkToAdminContentItem,
} from '@/lib/admin-accueil-content-list';
import type { AdminCreatorCorner, AdminHomePartnerLogo } from '@/lib/admin-accueil-store';
import type { LoopWalk } from '@/lib/loop-walks-store';

jest.mock('@/lib/admin-accueil-store', () => ({
  listAdminLoopWalks: jest.fn(),
  listAdminCreatorCorners: jest.fn(),
  listAdminChroniques: jest.fn(),
  listAdminHomePartnerLogos: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: jest.fn(() => true),
}));

const baseWalk: LoopWalk = {
  id: 'walk-1',
  slug: 'conakry-centre',
  title: 'Conakry Centre',
  coverImageUrl: 'https://example.com/cover.jpg',
  durationMinutes: 45,
  stepsCount: 3,
  category: 'culture',
  categoryLabel: 'Culture',
  summary: 'Résumé',
  description: null,
  steps: [],
  partnerIds: [],
  priceType: 'free',
  priceLabel: null,
  contactPhone: null,
  contactUrl: null,
  isFeaturedWeek: true,
  isPublished: true,
  sortOrder: 1,
  countryCode: 'GN',
};

const baseCorner: AdminCreatorCorner = {
  id: 'corner-1',
  slug: 'fatou-kaba',
  subjectName: 'Fatou Kaba',
  title: 'Mémoire orale vivante',
  category: 'Culture & Mémoire',
  locationLabel: 'Conakry',
  badgeTag: 'Transmission',
  coreQuote: null,
  impactDescription: 'Une initiative qui renoue avec le patrimoine oral.',
  mediaUrl: null,
  ctaLabel: 'Découvrir',
  relatedTargetType: null,
  relatedTargetId: null,
  relatedTargetSlug: null,
  usefulLinks: [],
  periodLabel: '2026-W33',
  isActive: false,
  countryCode: 'GN',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
};

const baseLogo: AdminHomePartnerLogo = {
  id: 'logo-1',
  name: 'Orange Guinée',
  logoUrl: 'https://example.com/logo.png',
  websiteUrl: 'https://orange.gn',
  sortOrder: 1,
  isActive: true,
  countryCode: 'GN',
};

describe('admin-accueil-content-list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mappe isPublished / isActive vers published / deactivated', () => {
    expect(accueilActiveToStatus(true)).toBe('published');
    expect(accueilActiveToStatus(false)).toBe('deactivated');
  });

  it('convertit un walk en AdminContentItem', () => {
    const item = walkToAdminContentItem(baseWalk);
    expect(item.kind).toBe('walk');
    expect(item.contentStatus).toBe('published');
    expect(item.isFeatured).toBe(true);
    expect(item.source).toBe('supabase');
    expect(item.subtitle).toContain('3 étapes');
  });

  it('convertit un corner désactivé', () => {
    const item = cornerToAdminContentItem(baseCorner);
    expect(item.kind).toBe('corner');
    expect(item.contentStatus).toBe('deactivated');
    expect(item.subtitle).toContain('Fatou Kaba');
    expect(item.featuredStartDate).toBe('2026-08-01');
  });

  it('convertit un logo actif', () => {
    const item = logoToAdminContentItem(baseLogo);
    expect(item.kind).toBe('logo');
    expect(item.contentStatus).toBe('published');
    expect(item.slug).toBeNull();
    expect(item.subtitle).toBe('orange.gn');
  });

  it('agrège walks, corners, chroniques et logos par pays', async () => {
    const { listAdminLoopWalks, listAdminCreatorCorners, listAdminChroniques, listAdminHomePartnerLogos } =
      jest.requireMock('@/lib/admin-accueil-store');

    (listAdminLoopWalks as jest.Mock).mockResolvedValue([baseWalk]);
    (listAdminCreatorCorners as jest.Mock).mockResolvedValue([baseCorner]);
    (listAdminChroniques as jest.Mock).mockResolvedValue([]);
    (listAdminHomePartnerLogos as jest.Mock).mockResolvedValue([baseLogo]);

    const data = await buildAdminAccueilContentList('GN', { force: true });

    expect(listAdminLoopWalks).toHaveBeenCalledWith('GN', { force: true });
    expect(data.walks).toHaveLength(1);
    expect(data.corners).toHaveLength(1);
    expect(data.chroniques).toHaveLength(0);
    expect(data.logos).toHaveLength(1);
    expect(data.walks[0].kind).toBe('walk');
  });
});
