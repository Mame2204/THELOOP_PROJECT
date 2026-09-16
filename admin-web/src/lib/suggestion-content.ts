import type { CommunitySuggestion, SuggestionType } from './suggestions';

export function suggestionMapsToContent(type: SuggestionType): type is 'event' | 'spot' | 'tool' {
  return type === 'event' || type === 'spot' || type === 'tool';
}

export function suggestionEditorPath(s: CommunitySuggestion): string | null {
  if (!suggestionMapsToContent(s.suggestionType)) return null;

  const params = new URLSearchParams();
  params.set('suggestion', s.id);
  const title = s.title?.trim() || s.placeName?.trim();
  if (title) params.set('title', title);
  if (s.placeName?.trim()) params.set('place', s.placeName.trim());
  if (s.description.trim()) params.set('desc', s.description.trim().slice(0, 500));
  if (s.countryCode) params.set('country', s.countryCode);

  return `/contenu/editer/${s.suggestionType}?${params.toString()}`;
}
