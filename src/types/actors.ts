import type { UserRole } from '@/types';

/**
 * Les 5 acteurs de THE LOOP
 *
 * 1. VISITEUR       — navigation libre, pas d'interaction (like/save bloqués)
 * 2. MEMBRE         — visiteur devenu compte gratuit (favoris débloqués)
 * 3. USER_PRIME     — abonnement Loop Prime (événements LoopX, répertoire, lieux exclusifs)
 * 4. PARTENAIRE     — accès portail via jeton SPOT-XXXX-YYYY (soumission événements)
 * 5. ADMIN          — gestion centrale (analytics, modération, hero, jetons)
 */

export type ActorKey = 'visiteur' | 'membre' | 'user_prime' | 'partenaire' | 'admin';

export interface ActorDefinition {
  key: ActorKey;
  role: UserRole;
  label: string;
  description: string;
  space: string;
}

export const ACTORS: Record<ActorKey, ActorDefinition> = {
  visiteur: {
    key: 'visiteur',
    role: 'USER_ANONYMOUS',
    label: 'Visiteur',
    description: 'Consultation libre de l\'agenda et des Spots, sans compte.',
    space: 'Public (lecture seule)',
  },
  membre: {
    key: 'membre',
    role: 'USER_FREE',
    label: 'Membre (compte gratuit)',
    description: 'Visiteur inscrit — peut liker et sauvegarder, accès à Mes Favoris.',
    space: 'Public + Favoris',
  },
  user_prime: {
    key: 'user_prime',
    role: 'USER_PRIME',
    label: 'Loop Prime',
    description: 'Abonnement premium — événements LoopX, répertoire d\'entraide, lieux exclusifs.',
    space: 'Public + Loop Prime',
  },
  partenaire: {
    key: 'partenaire',
    role: 'PARTNER',
    label: 'Partenaire',
    description: 'Organisateur / sponsor — connexion par jeton unique, soumission en staging.',
    space: 'Portail Partenaires',
  },
  admin: {
    key: 'admin',
    role: 'ADMIN',
    label: 'Administrateur',
    description: 'Équipe THE LOOP — analytics, modération, slider hero, jetons partenaires.',
    space: 'Dashboard Admin',
  },
};

export const ROLE_TO_ACTOR: Record<UserRole, ActorKey> = {
  USER_ANONYMOUS: 'visiteur',
  USER_FREE: 'membre',
  USER_PRIME: 'user_prime',
  PARTNER: 'partenaire',
  ADMIN: 'admin',
};

export function getActor(role: UserRole): ActorDefinition {
  return ACTORS[ROLE_TO_ACTOR[role]];
}

export function getActorLabel(role: UserRole): string {
  return getActor(role).label;
}
