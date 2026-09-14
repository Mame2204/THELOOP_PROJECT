import type { CountryCode } from '@/lib/countries';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import type { User } from '@/types';

/** Compte admin ou super admin (équipe THE LOOP). */
export function isAdminAccount(user: Pick<User, 'role' | 'userRole'>): boolean {
  const dbRole = (user.userRole ?? '').toLowerCase();
  return user.role === 'ADMIN' || dbRole === 'admin' || dbRole === 'super_admin';
}

export function isSuperAdminAccount(user: Pick<User, 'userRole'>): boolean {
  return (user.userRole ?? '').toLowerCase() === 'super_admin';
}

/** Éligible aux avantages inclus « Membre » (gratuit uniquement — pas les Prime). */
export function userQualifiesForMemberEntitlements(user: User): boolean {
  if (isAdminAccount(user)) return false;
  if (userQualifiesForPrimeEntitlements(user)) return false;
  return user.role === 'USER_FREE' || user.userRole === 'member';
}

/** Éligible aux avantages inclus « PASS Prime » — hors comptes admin et membres forcés par admin. */
export function userQualifiesForPrimeEntitlements(user: User): boolean {
  if (isAdminAccount(user)) return false;
  const dbRole = (user.userRole ?? '').toLowerCase();
  if (dbRole === 'member') return false;
  return (
    user.role === 'USER_PRIME' ||
    dbRole === 'prime' ||
    user.subscriptionStatus === 'active'
  );
}

/** Éligible aux avantages inclus « Partenaire Pro ». */
export function userQualifiesForPartnerEntitlements(user: User): boolean {
  if (isAdminAccount(user)) return false;
  return user.role === 'PARTNER' || (user.userRole ?? '').toLowerCase() === 'partner';
}

/** Compte admin délégué (slug `admin`) — hors super admin. */
export function userQualifiesForDelegatedAdminEntitlements(user: User): boolean {
  return isAdminAccount(user) && !isSuperAdminAccount(user);
}

/** Éligible aux avantages configurés « Admin / Super admin » (onglet Par rôle / TEAMS). */
export function userQualifiesForAdminEntitlements(user: User): boolean {
  return isAdminAccount(user);
}

/** Exclu des campagnes broadcast (octroi de masse) — octroi individuel ou par rôle admin uniquement. */
export function isExcludedFromBenefitBroadcast(user: Pick<User, 'role' | 'userRole'>): boolean {
  return isAdminAccount(user);
}

/** Compte rattaché au pays d'octroi (compte ou pays d'intérêt / contenu exploré). */
export function userMatchesBenefitCountry(
  user: Pick<User, 'countryCode' | 'interestCountryCode' | 'phoneNumber'>,
  grantCountryCode: string,
): boolean {
  const grant = grantCountryCode.toUpperCase().slice(0, 2);
  const account = (user.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
  const interest = user.interestCountryCode?.toUpperCase().slice(0, 2);
  if (account === grant) return true;
  if (interest && interest === grant) return true;
  return false;
}

/** Membres : avantages du pays de contenu affiché (octrois mérités pour ce pays). Équipe : tous pays. */
export function canViewBenefitsForInterestCountry(
  user: Pick<User, 'countryCode' | 'role' | 'userRole'>,
  _interestCountry: CountryCode,
): boolean {
  if (isAdminAccount(user)) return true;
  return user.role !== 'USER_ANONYMOUS';
}
