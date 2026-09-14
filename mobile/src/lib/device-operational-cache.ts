import AsyncStorage from '@react-native-async-storage/async-storage';

/** Clés AsyncStorage = données opérationnelles (pas les paramètres seed). */
const OPERATIONAL_KEYS = [
  'loop_prime_benefits_v2',
  'loop_prime_benefits_v1',
  'loop_scheduled_benefit_grants_v1',
  'loop_admin_benefit_draws_v1',
  'loop_user_notifications_v1',
  'loop_user_registry_v1',
  'loop_benefit_catalog_v2',
  'loop_benefit_catalog_v1',
  'loop_benefit_redemptions_v1',
  'loop_partner_benefit_offers_v1',
  'loop_partner_staging_v2',
  'loop_walk_clicks_v1',
  'loop_walk_favorites_v1',
  'loop_walk_ratings_v1',
  'loop_referrals_v1',
  'loop_local_favorite_counts_v1',
];

/**
 * Vide le cache local opérationnel sur l'appareil (octrois, PASS, tirages, notifications…).
 * Pour catalogue + accueil après purge Supabase, utiliser clearAllPublicDeviceCaches().
 */
export async function clearOperationalDeviceCache(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const subscriptionKeys = allKeys.filter((key) => key.startsWith('loop_subscriptions_'));
  await AsyncStorage.multiRemove([...OPERATIONAL_KEYS, ...subscriptionKeys]);
}
