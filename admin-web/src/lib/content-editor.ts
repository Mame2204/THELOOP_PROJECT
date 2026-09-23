import { supabase } from './supabase';
import type { CatalogKind, ContentStatus } from './content';

export interface EditorResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface EventEditorForm {
  title: string;
  description: string;
  category: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  coverImageUrl: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  organizerName: string;
  entryPrice: string;
  isInvitationOnly: boolean;
  contentStatus: ContentStatus;
  countryCode: string;
}

export interface SpotEditorForm {
  name: string;
  description: string;
  address: string;
  subCategory: string;
  phone: string;
  website: string;
  coverImageUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  organizerName: string;
  contentStatus: ContentStatus;
  countryCode: string;
}

export interface ToolEditorForm {
  name: string;
  description: string;
  phone: string;
  website: string;
  logoUrl: string;
  toolCategory: string;
  developer: string;
  isVerified: boolean;
  instagramUrl: string;
  facebookUrl: string;
  ctaUrl: string;
  contentStatus: ContentStatus;
  countryCode: string;
}

function eventRpcPayload(form: EventEditorForm): Record<string, unknown> {
  const entryPrice = form.entryPrice.trim() ? Number(form.entryPrice) : null;
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim() || 'corporate',
    categories: [form.category.trim() || 'corporate'],
    starts_at: form.startsAt,
    ends_at: form.endsAt.trim() || null,
    venue_name: form.venueName.trim(),
    entry_price: form.isInvitationOnly ? null : entryPrice,
    is_invitation_only: form.isInvitationOnly,
    website_url: form.websiteUrl.trim() || null,
    instagram_url: form.instagramUrl.trim() || null,
    facebook_url: form.facebookUrl.trim() || null,
    cover_image_url: form.coverImageUrl.trim() || null,
    gallery_images: form.coverImageUrl.trim() ? [form.coverImageUrl.trim()] : [],
    organizer_name: form.organizerName.trim() || null,
    content_origin: 'admin',
    country_code: form.countryCode,
    content_status: form.contentStatus,
  };
}

function spotRpcPayload(form: SpotEditorForm): Record<string, unknown> {
  const sub = form.subCategory.trim() || 'restaurant';
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    address: form.address.trim(),
    sub_category: sub,
    categories: [sub],
    phone: form.phone.trim() || null,
    website: form.website.trim() || null,
    cover_image_url: form.coverImageUrl.trim() || null,
    gallery_images: form.coverImageUrl.trim() ? [form.coverImageUrl.trim()] : [],
    instagram_url: form.instagramUrl.trim() || null,
    facebook_url: form.facebookUrl.trim() || null,
    organizer_name: form.organizerName.trim() || null,
    content_origin: 'admin',
    country_code: form.countryCode,
    content_status: form.contentStatus,
  };
}

function toolRpcPayload(form: ToolEditorForm): Record<string, unknown> {
  const cat = form.toolCategory.trim() || 'productivity';
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    phone: form.phone.trim() || null,
    website: form.website.trim() || null,
    logo_url: form.logoUrl.trim() || null,
    cover_image_url: form.logoUrl.trim() || null,
    gallery_images: form.logoUrl.trim() ? [form.logoUrl.trim()] : [],
    instagram_url: form.instagramUrl.trim() || null,
    facebook_url: form.facebookUrl.trim() || null,
    cta_url: form.ctaUrl.trim() || null,
    categories: [cat],
    tool_category: cat,
    developer: form.developer.trim() || null,
    is_verified: form.isVerified,
    content_origin: 'admin',
    country_code: form.countryCode,
    content_status: form.contentStatus,
  };
}

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(value: string): string {
  if (!value.trim()) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function emptyEventForm(countryCode: string): EventEditorForm {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const end = new Date(now);
  end.setHours(end.getHours() + 2);
  return {
    title: '',
    description: '',
    category: 'corporate',
    startsAt: now.toISOString(),
    endsAt: end.toISOString(),
    venueName: '',
    coverImageUrl: '',
    websiteUrl: '',
    instagramUrl: '',
    facebookUrl: '',
    organizerName: '',
    entryPrice: '',
    isInvitationOnly: false,
    contentStatus: 'draft',
    countryCode,
  };
}

export function emptySpotForm(countryCode: string): SpotEditorForm {
  return {
    name: '',
    description: '',
    address: '',
    subCategory: 'restaurant',
    phone: '',
    website: '',
    coverImageUrl: '',
    instagramUrl: '',
    facebookUrl: '',
    organizerName: '',
    contentStatus: 'draft',
    countryCode,
  };
}

export function emptyToolForm(countryCode: string): ToolEditorForm {
  return {
    name: '',
    description: '',
    phone: '',
    website: '',
    logoUrl: '',
    toolCategory: 'productivity',
    developer: '',
    isVerified: false,
    instagramUrl: '',
    facebookUrl: '',
    ctaUrl: '',
    contentStatus: 'draft',
    countryCode,
  };
}

export async function loadEventForEdit(id: string): Promise<EventEditorForm | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'title, description, start_date, end_date, custom_location_name, banner_url, website_url, instagram_url, facebook_url, category_slugs, content_status, country_code, organizer_name, ticket_price, is_invitation_only, is_free',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;

  const categories = Array.isArray(data.category_slugs)
    ? (data.category_slugs as unknown[]).map(String)
    : [];

  return {
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    category: categories[0] ?? 'corporate',
    startsAt: String(data.start_date ?? new Date().toISOString()),
    endsAt: data.end_date ? String(data.end_date) : '',
    venueName: String(data.custom_location_name ?? ''),
    coverImageUrl: data.banner_url ? String(data.banner_url) : '',
    websiteUrl: data.website_url ? String(data.website_url) : '',
    instagramUrl: data.instagram_url ? String(data.instagram_url) : '',
    facebookUrl: data.facebook_url ? String(data.facebook_url) : '',
    organizerName: data.organizer_name ? String(data.organizer_name) : '',
    entryPrice:
      data.is_invitation_only || data.is_free || data.ticket_price == null
        ? ''
        : String(data.ticket_price),
    isInvitationOnly: Boolean(data.is_invitation_only),
    contentStatus: (data.content_status as ContentStatus) ?? 'draft',
    countryCode: String(data.country_code ?? 'GN'),
  };
}

export async function loadSpotForEdit(id: string): Promise<SpotEditorForm | null> {
  const { data, error } = await supabase
    .from('establishments')
    .select(
      'name, description, category_slugs, phone_contact, website_url, instagram_url, facebook_url, content_status, country_code, organizer_name',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;

  const { data: photos } = await supabase
    .from('establishment_photos')
    .select('photo_url, is_primary')
    .eq('establishment_id', id)
    .order('is_primary', { ascending: false })
    .limit(1);

  const categories = Array.isArray(data.category_slugs)
    ? (data.category_slugs as unknown[]).map(String)
    : [];
  const cover =
    photos?.[0]?.photo_url != null ? String(photos[0].photo_url) : '';

  return {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    address: '',
    subCategory: categories[0] ?? 'restaurant',
    phone: data.phone_contact ? String(data.phone_contact) : '',
    website: data.website_url ? String(data.website_url) : '',
    coverImageUrl: cover,
    instagramUrl: data.instagram_url ? String(data.instagram_url) : '',
    facebookUrl: data.facebook_url ? String(data.facebook_url) : '',
    organizerName: data.organizer_name ? String(data.organizer_name) : '',
    contentStatus: (data.content_status as ContentStatus) ?? 'draft',
    countryCode: String(data.country_code ?? 'GN'),
  };
}

export async function loadToolForEdit(id: string): Promise<ToolEditorForm | null> {
  const { data, error } = await supabase
    .from('tools')
    .select(
      'name, description, phone_contact, website_url, logo_url, category_slugs, developer, is_verified, instagram_url, facebook_url, action_link, content_status, country_code',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;

  const categories = Array.isArray(data.category_slugs)
    ? (data.category_slugs as unknown[]).map(String)
    : [];

  return {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    phone: data.phone_contact ? String(data.phone_contact) : '',
    website: data.website_url ? String(data.website_url) : '',
    logoUrl: data.logo_url ? String(data.logo_url) : '',
    toolCategory: categories[0] ?? 'productivity',
    developer: data.developer ? String(data.developer) : '',
    isVerified: Boolean(data.is_verified),
    instagramUrl: data.instagram_url ? String(data.instagram_url) : '',
    facebookUrl: data.facebook_url ? String(data.facebook_url) : '',
    ctaUrl: data.action_link ? String(data.action_link) : '',
    contentStatus: (data.content_status as ContentStatus) ?? 'draft',
    countryCode: String(data.country_code ?? 'GN'),
  };
}

export async function createEvent(form: EventEditorForm): Promise<EditorResult> {
  const payload = eventRpcPayload(form);
  const localStart = toLocalDatetime(form.startsAt);
  payload.starts_at = fromLocalDatetime(localStart || toLocalDatetime(new Date().toISOString()));
  if (form.endsAt.trim()) {
    payload.ends_at = fromLocalDatetime(toLocalDatetime(form.endsAt));
  }

  const { data, error } = await supabase.rpc('admin_create_event_direct', { p_payload: payload });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data ? String(data) : undefined };
}

export async function createSpot(form: SpotEditorForm): Promise<EditorResult> {
  const { data, error } = await supabase.rpc('admin_create_establishment_direct', {
    p_payload: spotRpcPayload(form),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data ? String(data) : undefined };
}

export async function createTool(form: ToolEditorForm): Promise<EditorResult> {
  const { data, error } = await supabase.rpc('admin_create_tool_direct', {
    p_payload: toolRpcPayload(form),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data ? String(data) : undefined };
}

export async function updateEvent(id: string, form: EventEditorForm): Promise<EditorResult> {
  const entryPrice = form.entryPrice.trim() ? Number(form.entryPrice) : null;
  const isActive = form.contentStatus === 'published';
  const { error } = await supabase
    .from('events')
    .update({
      title: form.title.trim(),
      description: form.description.trim(),
      start_date: fromLocalDatetime(
        toLocalDatetime(form.startsAt) || toLocalDatetime(new Date().toISOString()),
      ),
      end_date: form.endsAt.trim() ? fromLocalDatetime(toLocalDatetime(form.endsAt)) : null,
      custom_location_name: form.venueName.trim(),
      banner_url: form.coverImageUrl.trim() || null,
      website_url: form.websiteUrl.trim() || null,
      instagram_url: form.instagramUrl.trim() || null,
      facebook_url: form.facebookUrl.trim() || null,
      organizer_name: form.organizerName.trim() || null,
      category_slugs: [form.category.trim() || 'corporate'],
      content_status: form.contentStatus,
      is_active: isActive,
      is_invitation_only: form.isInvitationOnly,
      is_free: !form.isInvitationOnly && entryPrice == null,
      ticket_price: form.isInvitationOnly || entryPrice == null ? null : entryPrice,
      country_code: form.countryCode,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

export async function updateSpot(id: string, form: SpotEditorForm): Promise<EditorResult> {
  const sub = form.subCategory.trim() || 'restaurant';
  const isActive = form.contentStatus === 'published';
  const { error } = await supabase
    .from('establishments')
    .update({
      name: form.name.trim(),
      description: form.description.trim(),
      category_slugs: [sub],
      phone_contact: form.phone.trim() || null,
      website_url: form.website.trim() || null,
      action_link: form.website.trim() || null,
      instagram_url: form.instagramUrl.trim() || null,
      facebook_url: form.facebookUrl.trim() || null,
      organizer_name: form.organizerName.trim() || null,
      content_status: form.contentStatus,
      is_active: isActive,
      country_code: form.countryCode,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  const cover = form.coverImageUrl.trim();
  if (cover) {
    await supabase.from('establishment_photos').delete().eq('establishment_id', id);
    await supabase.from('establishment_photos').insert({
      establishment_id: id,
      photo_url: cover,
      is_primary: true,
    });
  }

  return { ok: true, id };
}

export async function updateTool(id: string, form: ToolEditorForm): Promise<EditorResult> {
  const cat = form.toolCategory.trim() || 'productivity';
  const isActive = form.contentStatus === 'published';
  const { error } = await supabase
    .from('tools')
    .update({
      name: form.name.trim(),
      description: form.description.trim(),
      phone_contact: form.phone.trim() || null,
      website_url: form.website.trim() || null,
      logo_url: form.logoUrl.trim() || null,
      category_slugs: [cat],
      developer: form.developer.trim() || null,
      is_verified: form.isVerified,
      instagram_url: form.instagramUrl.trim() || null,
      facebook_url: form.facebookUrl.trim() || null,
      action_link: form.ctaUrl.trim() || form.website.trim() || null,
      content_status: form.contentStatus,
      is_active: isActive,
      country_code: form.countryCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

export function kindSubPermission(kind: CatalogKind): string {
  if (kind === 'event') return 'content_events';
  if (kind === 'spot') return 'content_spots';
  return 'content_tools';
}

export { toLocalDatetime, fromLocalDatetime };
