import { SUPPORT_EMAIL } from '@/lib/support-contact';

/** Contreparties du PASS : privilèges consommés chez les partenaires (services physiques). */
export const PASS_INCLUDED_BENEFITS = [
  'Privilèges chez les établissements partenaires : offres, réductions, accueil privilégié',
  'Accès aux événements LoopX réservés aux membres Prime',
  'Accès prioritaire aux invitations et aux tirages au sort',
  'Parrainage : mois Prime offerts selon vos filleuls',
] as const;

/** Moyens de paiement disponibles sur le portail (agrégateur — ne pas citer le prestataire). */
export const PASS_CHECKOUT_PAYMENT_METHODS = [
  'Orange Money',
  'MTN MoMo',
  'Soutra Money',
  'PayCard',
  'Carte bancaire',
] as const;

export const PASS_SHOP_FAQ: { q: string; a: string }[] = [
  {
    q: 'Quand mon PASS devient-il actif ?',
    a: 'Dès confirmation du paiement sur le portail sécurisé. Si vous avez déjà un PASS en cours, le nouveau passe en file et s’active à l’échéance.',
  },
  {
    q: 'Comment fonctionne la file d’attente ?',
    a: 'Vous pouvez empiler plusieurs PASS (limite affichée sur cet écran). Chaque PASS en attente démarre quand le précédent expire ou est retiré.',
  },
  {
    q: 'Le PASS se renouvelle-t-il seul ?',
    a: 'Non — chaque achat est manuel. Aucun prélèvement automatique, aucune démarche d’annulation.',
  },
  {
    q: 'Puis-je être remboursé ?',
    a: `Non. Le PASS est activé dès la confirmation du paiement : une fois payé, il n’est ni rétractable ni remboursable, même si vous n’utilisez pas vos privilèges. Si un paiement débité n’a pas activé votre PASS, écrivez à ${SUPPORT_EMAIL} : nous l’activons sur votre compte.`,
  },
  {
    q: 'Quels moyens de paiement sont acceptés ?',
    a: 'Orange Money, MTN MoMo, Soutra Money, PayCard et carte bancaire via notre portail de paiement sécurisé.',
  },
];
