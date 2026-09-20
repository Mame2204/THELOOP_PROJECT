import type { AppLocale } from '@/lib/app-locale-store';

type CopyTree = Record<string, { fr: string; en: string }>;

const COPY: CopyTree = {
  kicker: { fr: 'Compte', en: 'Account' },
  title: { fr: 'Paramètres', en: 'Settings' },
  sectionAccount: { fr: 'Compte', en: 'Account' },
  emailLabel: { fr: 'E-mail', en: 'Email' },
  phoneLabel: { fr: 'Téléphone', en: 'Phone' },
  phoneHint: {
    fr: 'Modifiable dans « Modifier le profil ».',
    en: 'Editable in “Edit profile”.',
  },
  editProfile: { fr: 'Modifier le profil', en: 'Edit profile' },
  sectionPassword: { fr: 'Mot de passe', en: 'Password' },
  sectionNotifications: { fr: 'Notifications push', en: 'Push notifications' },
  pushMaster: { fr: 'Recevoir les alertes sur cet appareil', en: 'Receive alerts on this device' },
  pushMasterHint: {
    fr: 'Désactivez pour ne plus recevoir de notifications sur le téléphone. L’inbox in-app reste disponible.',
    en: 'Turn off to stop phone notifications. In-app inbox remains available.',
  },
  pushCategoriesHint: {
    fr: 'Affinez les types d’alertes. Les préférences sont enregistrées sur cet appareil.',
    en: 'Fine-tune alert types. Preferences are saved on this device.',
  },
  sectionCountry: { fr: 'Pays & contenu', en: 'Country & content' },
  accountCountry: { fr: 'Pays du compte', en: 'Account country' },
  accountCountryNote: {
    fr: 'Votre pays de vie, lié à votre compte à l’inscription. Il ne peut pas être modifié.',
    en: 'Your home country, set at signup. It cannot be changed.',
  },
  exploreCountry: { fr: 'Explorer un autre pays THE LOOP', en: 'Explore another THE LOOP country' },
  exploreCountryHint: {
    fr: 'Vacances ou déplacement : contenu et privilèges du pays choisi. Votre statut reste valable partout.',
    en: 'Travel mode: content and perks for the selected country. Your account status stays valid everywhere.',
  },
  exploreUnavailable: {
    fr: 'Un seul pays activé pour le moment — le switch sera disponible dès qu’un second pays sera activé dans Control Tower.',
    en: 'Only one country is enabled for now — the switch will appear when a second country is enabled in Control Tower.',
  },
  interestCountry: { fr: 'Pays d’intérêt', en: 'Country of interest' },
  displayedContent: { fr: 'Contenu affiché', en: 'Displayed content' },
  sectionLanguage: { fr: 'Langue', en: 'Language' },
  languageLabel: { fr: 'Langue de l’application', en: 'App language' },
  languageHint: {
    fr: 'Français complet. L’anglais s’applique d’abord à cet écran Paramètres ; le reste de l’app reste en français pour l’instant.',
    en: 'French is fully supported. English currently applies to this Settings screen first; the rest of the app stays in French for now.',
  },
  languageFr: { fr: 'Français', en: 'French' },
  languageEn: { fr: 'English', en: 'English' },
  sectionLegal: { fr: 'Légal', en: 'Legal' },
  legalCgu: { fr: 'Conditions générales d’utilisation', en: 'Terms of use' },
  legalPrivacy: { fr: 'Politique de confidentialité', en: 'Privacy policy' },
  legalMentions: { fr: 'Mentions légales', en: 'Legal notice' },
  sectionAbout: { fr: 'À propos', en: 'About' },
  appVersion: { fr: 'Version de l’app', en: 'App version' },
  contactSupport: { fr: 'Contacter le support', en: 'Contact support' },
  sectionDanger: { fr: 'Zone sensible', en: 'Sensitive area' },
  deleteAccount: { fr: 'Supprimer mon compte', en: 'Delete my account' },
  deleteAccountHint: {
    fr: 'Envoie une demande RGPD à notre équipe. La suppression effective est traitée manuellement sous 30 jours.',
    en: 'Sends a GDPR request to our team. Effective deletion is processed manually within 30 days.',
  },
  deleteConfirmTitle: { fr: 'Supprimer mon compte ?', en: 'Delete my account?' },
  deleteConfirmBody: {
    fr: 'Vous allez ouvrir un e-mail prérempli à contact@theloop-app.com. Notre équipe traitera votre demande de suppression.',
    en: 'You will open a pre-filled email to contact@theloop-app.com. Our team will process your deletion request.',
  },
  deleteConfirmAction: { fr: 'Continuer', en: 'Continue' },
  deleteMailFail: {
    fr: 'Impossible d’ouvrir l’application mail. Écrivez à contact@theloop-app.com avec votre e-mail de compte.',
    en: 'Unable to open the mail app. Email contact@theloop-app.com with your account email.',
  },
  back: { fr: 'Retour', en: 'Back' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
};

export function settingsCopy(locale: AppLocale, key: keyof typeof COPY): string {
  const entry = COPY[key];
  return locale === 'en' ? entry.en : entry.fr;
}
