import type { UserRole } from '@/types';

export interface TestAccount {
  label: string;
  email: string;
  password: string;
  phone: string;
  userRole: string;
  appRole: UserRole;
  hint: string;
}

/** Comptes de test — créez-les via l'app (OTP 1234) puis migration 20260714. */
export const TEST_ACCOUNTS: TestAccount[] = [
  {
    label: 'Membre',
    email: 'membre@theloop.gn',
    password: 'Loop1234!',
    phone: '+22462000001',
    userRole: 'member',
    appRole: 'USER_FREE',
    hint: 'Favoris, profil, pas de LoopX',
  },
  {
    label: 'Loop Prime',
    email: 'prime@theloop.gn',
    password: 'Loop1234!',
    phone: '+22462000002',
    userRole: 'prime',
    appRole: 'USER_PRIME',
    hint: 'LoopX + thème doré',
  },
  {
    label: 'Partenaire',
    email: 'contact@lavenue.gn',
    password: 'Loop1234!',
    phone: '+22462000003',
    userRole: 'partner',
    appRole: 'PARTNER',
    hint: 'Espace Pro · connexion e-mail + mot de passe (app mobile)',
  },
  {
    label: 'Admin',
    email: 'admin@theloop.gn',
    password: 'Loop1234!',
    phone: '+22462000004',
    userRole: 'admin',
    appRole: 'ADMIN',
    hint: 'Console admin',
  },
];

export function findTestAccountByIdentifier(identifier: string): TestAccount | undefined {
  const id = identifier.trim().toLowerCase();
  return TEST_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === id || a.phone.replace(/\s/g, '') === id.replace(/\s/g, ''),
  );
}
