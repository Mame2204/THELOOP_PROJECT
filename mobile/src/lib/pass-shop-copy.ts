export const PASS_INCLUDED_BENEFITS = [
  'Événements LoopX et contenus exclusifs Prime',
  'Thème premium et expérience membre Loop Prime',
  'Privilèges partenaires, tirages et offres membres',
  'Accès prioritaire aux invitations et activations',
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
    a: 'Non — chaque achat est manuel. Choisissez mensuel, trimestriel, annuel ou à vie selon votre rythme.',
  },
  {
    q: 'Puis-je être remboursé ?',
    a: 'Les conditions de remboursement sont détaillées dans les conditions du PASS Prime. Contactez contact@theloop-app.com pour toute demande.',
  },
  {
    q: 'Quels moyens de paiement sont acceptés ?',
    a: 'Orange Money, MTN MoMo, Soutra Money, PayCard et carte bancaire via notre portail de paiement sécurisé.',
  },
];
