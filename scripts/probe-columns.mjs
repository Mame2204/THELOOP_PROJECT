import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://eeyhtulpixvftvhppinz.supabase.co',
  'sb_publishable_l78zClzs1ldqOElbaLVT0w__KrKrlZv',
);

async function probeColumns(table, candidates) {
  const found = [];
  for (const col of candidates) {
    const { error } = await sb.from(table).select(col).limit(0);
    if (!error) found.push(col);
  }
  console.log(`${table}: ${found.join(', ')}`);
}

await probeColumns('locations', [
  'id', 'neighborhood_name', 'city', 'country', 'created_at', 'name', 'slug', 'address',
]);
await probeColumns('event_categories', ['id', 'name', 'slug', 'created_at']);
await probeColumns('establishment_categories', ['id', 'name', 'slug', 'created_at']);
await probeColumns('events', [
  'id', 'title', 'slug', 'category_id', 'description', 'banner_url', 'fallback_color',
  'organizer_id', 'is_external_location', 'establishment_id', 'custom_location_name',
  'location_id', 'start_date', 'end_date', 'is_free', 'ticket_price', 'action_link',
  'is_loop_x', 'reveal_price', 'is_featured', 'featured_end_date', 'created_at',
  'visibility', 'status', 'program', 'venue_name',
]);
await probeColumns('establishments', [
  'id', 'master_id', 'name', 'slug', 'category_id', 'description', 'price_indicator',
  'phone_contact', 'action_link', 'latitude', 'longitude', 'location_id', 'is_active',
  'created_at', 'cover_image_url', 'sub_category',
]);
await probeColumns('establishment_photos', [
  'id', 'establishment_id', 'photo_url', 'is_primary', 'created_at',
]);
await probeColumns('event_speakers', [
  'id', 'event_id', 'full_name', 'professional_title', 'company_name', 'photo_url',
  'name', 'title', 'company',
]);
await probeColumns('event_schedules', [
  'id', 'event_id', 'time_label', 'activity_title', 'order_index',
]);
await probeColumns('partnership_requests', [
  'id', 'manager_name', 'establishment_name', 'email', 'phone', 'status',
  'admin_notes', 'created_at', 'activity_type', 'message',
]);
await probeColumns('partner_staff', ['id', 'user_id', 'staff_role', 'created_at']);
