import { resolveRemoteImageUrl, resolveRemoteImageCandidates, resolveRemoteImageUrls } from '@/lib/resolve-image-url';

describe('resolveRemoteImageUrl', () => {
  const originalEnv = process.env.EXPO_PUBLIC_SUPABASE_URL;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://eeyhtulpixvftvhppinz.supabase.co';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalEnv;
  });

  it('retourne null pour valeurs vides', () => {
    expect(resolveRemoteImageUrl(null)).toBeNull();
    expect(resolveRemoteImageUrl('')).toBeNull();
  });

  it('conserve les URI locales pour prévisualisation sur appareil', () => {
    expect(resolveRemoteImageUrl('file:///tmp/photo.jpg')).toBe('file:///tmp/photo.jpg');
    expect(resolveRemoteImageUrl('ph://ABC-DEF/asset')).toBe('ph://ABC-DEF/asset');
  });

  it('normalise HTTP vers HTTPS (compatibilité iOS ATS)', () => {
    expect(resolveRemoteImageUrl('http://images.unsplash.com/photo-1?w=800')).toBe(
      'https://images.unsplash.com/photo-1?w=800',
    );
  });

  it('accepte les URLs https Supabase', () => {
    const https = 'https://eeyhtulpixvftvhppinz.supabase.co/storage/v1/object/public/content-media/events/a.jpg';
    expect(resolveRemoteImageUrl(https)).toBe(https);
  });

  it('complète les chemins Storage relatifs', () => {
    expect(resolveRemoteImageUrl('events/demo/cover.jpg')).toBe(
      'https://eeyhtulpixvftvhppinz.supabase.co/storage/v1/object/public/content-media/events/demo/cover.jpg',
    );
  });

  it('trim les espaces et gère protocol-relative', () => {
    expect(resolveRemoteImageUrl('  https://example.com/a.png  ')).toBe('https://example.com/a.png');
    expect(resolveRemoteImageUrl('//cdn.example.com/img.jpg')).toBe('https://cdn.example.com/img.jpg');
  });
});

describe('resolveRemoteImageCandidates', () => {
  it('propose https puis http en secours (Android)', () => {
    expect(resolveRemoteImageCandidates('https://a.com/1.jpg')).toEqual([
      'https://a.com/1.jpg',
      'http://a.com/1.jpg',
    ]);
  });

  it('convertit http source en https candidat principal', () => {
    expect(resolveRemoteImageCandidates('http://a.com/1.jpg')).toEqual([
      'https://a.com/1.jpg',
      'http://a.com/1.jpg',
    ]);
  });

  it('mode transform : render Supabase puis https direct', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://eeyhtulpixvftvhppinz.supabase.co';
    const direct =
      'https://eeyhtulpixvftvhppinz.supabase.co/storage/v1/object/public/content-media/spots/a.jpg';
    const candidates = resolveRemoteImageCandidates(direct, {
      allowHttpFallback: false,
      useSupabaseRender: true,
    });
    expect(candidates[0]).toContain('/storage/v1/render/image/public/');
    expect(candidates[1]).toBe(direct);
  });

  it('mode Free (sans transform) : https direct seul', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://eeyhtulpixvftvhppinz.supabase.co';
    const direct =
      'https://eeyhtulpixvftvhppinz.supabase.co/storage/v1/object/public/content-media/spots/a.jpg';
    const candidates = resolveRemoteImageCandidates(direct, {
      allowHttpFallback: false,
      useSupabaseRender: false,
    });
    expect(candidates).toEqual([direct]);
  });
});

describe('resolveRemoteImageUrls', () => {
  it('dédoublonne et ignore les URLs invalides', () => {
    expect(
      resolveRemoteImageUrls([
        'https://a.com/1.jpg',
        'https://a.com/1.jpg',
        '',
        null,
      ]),
    ).toEqual(['https://a.com/1.jpg']);
  });
});
