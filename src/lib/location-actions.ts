import type { HomeLocation } from '@/lib/demo-data';

export function getLocationShareUrl(slug: string): string {
  return `${window.location.origin}/spots/${slug}`;
}

export function getLocationShareText(location: HomeLocation): string {
  return `${location.name} · ${location.district} · ${location.subtitle}`;
}

export function getLocationSharePayload(location: HomeLocation) {
  return {
    title: location.name,
    text: getLocationShareText(location),
    url: getLocationShareUrl(location.slug),
  };
}

export interface LocationPrimaryAction {
  href: string;
  label: string;
  external: boolean;
}

export function getLocationPrimaryAction(location: HomeLocation): LocationPrimaryAction {
  if (location.ctaUrl) {
    const external = /^https?:\/\//i.test(location.ctaUrl) || location.ctaUrl.startsWith('mailto:');
    return {
      href: external ? location.ctaUrl : location.ctaUrl.startsWith('/') ? location.ctaUrl : `/spots/${location.slug}`,
      label: location.ctaLabel ?? (external ? 'Visiter le lien' : 'Voir la fiche'),
      external,
    };
  }
  if (location.instagramUrl) {
    return { href: location.instagramUrl, label: location.ctaLabel ?? 'Instagram', external: true };
  }
  if (location.facebookUrl) {
    return { href: location.facebookUrl, label: location.ctaLabel ?? 'Facebook', external: true };
  }
  if (location.website) {
    return { href: location.website, label: location.ctaLabel ?? 'Site web', external: true };
  }
  return {
    href: `/spots/${location.slug}`,
    label: location.ctaLabel ?? 'Voir la fiche',
    external: false,
  };
}

export function formatFavoriteCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace('.0', '')}k`;
  return count.toLocaleString('fr-FR');
}
