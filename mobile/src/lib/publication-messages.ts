/** Messages utilisateur pour publication et soumission de contenu. */

export type PublicationKind = 'event' | 'spot' | 'tool';

function kindLabel(kind: PublicationKind, capitalize = false): string {
  const label = kind === 'event' ? 'événement' : kind === 'tool' ? 'outil' : 'spot';
  if (!capitalize) return label;
  return kind === 'event' ? 'Événement' : kind === 'tool' ? 'Outil' : 'Spot';
}

export function formatPublicationError(detail: string): { title: string; message: string } {
  const lower = detail.toLowerCase();

  if (
    lower.includes('category_id') ||
    lower.includes('no_establishment_category') ||
    lower.includes('no_event_category')
  ) {
    return {
      title: 'Catégorie indisponible',
      message: 'Les catégories n\'ont pas pu être chargées. Réessayez dans quelques instants ou contactez THE LOOP.',
    };
  }

  if (lower.includes('offline') || lower.includes('no_supabase')) {
    return {
      title: 'Connexion requise',
      message: 'Connectez-vous à internet pour publier ou soumettre votre contenu.',
    };
  }

  if (lower.includes('value too long') || lower.includes('character varying')) {
    return {
      title: 'Tarif trop long',
      message: 'Le tarif saisi est trop long. Essayez un libellé plus court, par exemple « €€ » ou « dès 50 000 GNF ».',
    };
  }

  if (lower.includes('non-volatile') || lower.includes('admin_required')) {
    return {
      title: 'Publication impossible',
      message: 'Un problème technique empêche la publication. Contactez l\'équipe THE LOOP.',
    };
  }

  if (
    lower.includes('save failed') ||
    lower.includes('publish_failed') ||
    lower.includes('admin_event_publish_failed') ||
    lower.includes('admin_spot_publish_failed')
  ) {
    return {
      title: 'Publication impossible',
      message: 'L\'enregistrement n\'a pas abouti. Vérifiez votre connexion et réessayez.',
    };
  }

  console.warn('[Publication]', detail);
  return {
    title: 'Publication impossible',
    message: 'Une erreur s\'est produite. Vérifiez votre connexion et réessayez. Si le problème continue, contactez THE LOOP.',
  };
}

export function publicationSuccessCopy(params: {
  asDraft: boolean;
  isEdit: boolean;
  isAdminMode: boolean;
  kind: PublicationKind;
  remoteSyncOk?: boolean;
}): { title: string; message: string } {
  const { asDraft, isEdit, isAdminMode, kind, remoteSyncOk } = params;
  const label = kindLabel(kind);

  if (asDraft) {
    return {
      title: 'Brouillon enregistré',
      message: 'Vous pourrez le modifier et le publier plus tard depuis Mon contenu.',
    };
  }

  if (isEdit) {
    return {
      title: 'Enregistré',
      message: 'Vos modifications ont été prises en compte.',
    };
  }

  if (isAdminMode) {
    return {
      title: 'Publié',
      message: `Votre ${label} est maintenant visible dans l'application.`,
    };
  }

  if (remoteSyncOk === false) {
    return {
      title: 'Enregistré sur cet appareil',
      message: 'La synchronisation a échoué. Vérifiez votre connexion internet, puis rouvrez Mon contenu pour réessayer.',
    };
  }

  return {
    title: 'Envoyé',
    message: `Votre ${label} a été transmis à THE LOOP. Il sera visible après validation par notre équipe.`,
  };
}

export function moderationResultCopy(
  kind: PublicationKind,
  approve: boolean,
  ok: boolean,
): { title: string; message?: string } {
  const label = kindLabel(kind, true);

  if (!approve) {
    return {
      title: `${label} refusé`,
      message: 'Le partenaire pourra modifier et resoumettre son contenu.',
    };
  }

  if (ok) {
    return {
      title: `${label} publié`,
      message: 'Le contenu est maintenant visible dans l\'application.',
    };
  }

  return {
    title: 'Publication impossible',
    message: 'La publication n\'a pas abouti. Vérifiez la connexion et réessayez.',
  };
}
