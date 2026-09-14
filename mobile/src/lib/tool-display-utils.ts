export function getToolPlatformDisplay(
  ctaUrl?: string | null,
  website?: string | null,
): { label: string; emoji: string } | null {
  if (ctaUrl?.trim()) {
    return { label: 'App mobile', emoji: '📱' };
  }
  if (website?.trim()) {
    return { label: 'Web app', emoji: '🌐' };
  }
  return null;
}
