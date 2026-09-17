import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { PartnerPicker } from '@/components/PartnerPicker';
import {
  getContentOwner,
  reassignContentOwner,
  TEAM_CONTENT_OWNER_ID,
  type ContentOwnerInfo,
} from '@/lib/admin-reassign-content';
import {
  listPartnerAccounts,
  partnerAccountDisplayName,
  partnerAccountUserId,
  type PartnerDirectoryEntry,
} from '@/lib/partner-directory-store';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { usePartnerContentScopes } from '@/hooks/usePartnerContentScopes';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { PageHeader } from '@/components/PageHeader';
import { DateTimeField } from '@/components/DateTimeField';
import { SpotSelectField } from '@/components/SpotSelectField';
import { CountrySelectField } from '@/components/CountrySelectField';
import { ImageUploadField } from '@/components/ImageUploadField';
import { ContentLocationFields } from '@/components/ContentLocationFields';
import {
  resolveStoredContentLocationInput,
  serializeContentLocation,
  type ContentLocationMode,
} from '@/lib/content-location-utils';
import { GalleryUploadField } from '@/components/GalleryUploadField';
import { OpeningHoursEditor } from '@/components/OpeningHoursEditor';
import { FormSelectChip } from '@/components/FormSelectChip';
import { FormTextInput } from '@/components/FormTextInput';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import { useContent } from '@/context/ContentContext';
import { invalidateContentCache } from '@/lib/content-store';
import { eventGalleryExtras } from '@/lib/detail-gallery-utils';
import { createAdminEstablishmentDirect, createAdminEventDirect, createAdminToolDirect } from '@/lib/admin-direct-publish';
import { getAdminContentStatus, promoteStagingDraftToCatalog } from '@/lib/admin-content-store';
import { adminContentActionsFor, CONTENT_STATUS_LABELS, type ContentStatus } from '@/lib/admin-types';
import {
  adminDeletePartnerEvent,
  adminDeletePartnerSpot,
  cancelPartnerPendingSubmission,
  createPartnerEvent,
  createPartnerSpot,
  deletePartnerEvent,
  deletePartnerSpot,
  listPartnerEvents,
  listPartnerSpots,
  getStagingEventById,
  getStagingSpotById,
  listAllStagingSpots,
  listAllStagingEvents,
  updatePartnerEvent,
  updatePartnerSpot,
  type StagingSpot,
  type SubmissionStatus,
} from '@/lib/partner-staging-store';
import {
  loadEditableEvent,
  loadEditableSpot,
  saveEditableEvent,
  saveEditableSpot,
  syncEditableEventSpeakers,
  type EditableSpeakerInput,
} from '@/lib/admin-edit-store';
import {
  normalizeCategoriesList,
  primaryCategory,
  toggleCategoryInList,
} from '@/lib/content-categories-utils';
import { formatPublicationError, publicationSuccessCopy } from '@/lib/publication-messages';
import {
  type EventCategory,
  type LocationSubCategory,
  type ToolPartnershipStatus,
} from '@/types';
import type { RootStackParamList } from '@/navigation/types';
import { DEFAULT_COUNTRY_CODE, getCountry, type CountryCode } from '@/lib/countries';
import {
  CONTENT_ORIGIN_LABELS,
  defaultEventOrganizerName,
  resolveContentChannel,
  resolveEventOrganizerName,
  THE_LOOP_ORGANIZER_LABEL,
  type ContentChannel,
} from '@/lib/content-origin';
import {
  guineaLocationSnapshotFromLabel,
  guineaLocationSnapshotFromStored,
  normalizePhysicalLocationForSave,
  normalizeSpotLocationPickerValue,
  spotDistrictFromGuineaLabel,
  toGuineaLocationSnapshot,
  type GuineaLocationPickMeta,
  type GuineaLocationSnapshot,
} from '@/lib/guinea-locations';
import { getCategoryOptions } from '@/lib/admin-categories-store';
import { slugify } from '@/lib/content-mappers';
import {
  formatHoursModeFromSettings,
  parseOpeningHoursText,
  type HoursMode,
  type WeeklyHoursSlot,
} from '@/lib/opening-hours';
import { getOpeningHoursSettings } from '@/lib/opening-hours-settings-store';
import { buildVenueSpotOptions, type VenueSpotOption } from '@/lib/venue-spot-options';

type SpeakerDraft = {
  name: string;
  title: string;
  company: string;
};

function buildSpeakersPayload(drafts: SpeakerDraft[]): EditableSpeakerInput[] {
  return drafts
    .map((speaker) => ({
      name: speaker.name.trim(),
      title: speaker.title.trim() || null,
      company: speaker.company.trim() || null,
    }))
    .filter((speaker) => speaker.name.length > 0);
}

function clampContentCountry(code: CountryCode, allowed: CountryCode[]): CountryCode {
  if (!allowed.length) return DEFAULT_COUNTRY_CODE;
  return allowed.includes(code) ? code : allowed[0];
}

async function applyParsedOpeningHours(text: string | null | undefined) {
  const settings = await getOpeningHoursSettings();
  const modeLabels = {
    always_open: settings.modes.always_open.label,
    by_appointment: settings.modes.by_appointment.label,
  };
  const parsed = parseOpeningHoursText(text, modeLabels);
  return {
    mode: parsed.mode,
    slots: parsed.slots,
    label: formatHoursModeFromSettings(parsed.mode, parsed.slots, modeLabels),
  };
}

async function resolveOpeningHoursForSubmit(
  mode: HoursMode,
  slots: WeeklyHoursSlot[],
): Promise<string | null> {
  const settings = await getOpeningHoursSettings();
  if (mode === 'weekly' && !slots.length) return null;
  const label = formatHoursModeFromSettings(mode, slots, {
    always_open: settings.modes.always_open.label,
    by_appointment: settings.modes.by_appointment.label,
  }).trim();
  return label || null;
}

const PARTNERSHIP_STATUS_LABELS: Record<ToolPartnershipStatus, string> = {
  none: 'Aucun',
  pending: 'En attente',
  active: 'Actif',
  revoked: 'Révoqué',
};

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerSubmission'>;

type VenueMode = 'existing' | 'custom';

type CategoryOption = { id: string; label: string; emoji: string };

export function PartnerSubmissionScreen({ route, navigation }: Props) {
  const { type, id, asAdmin, contentChannel: contentChannelParam, isTool: isToolRoute } = route.params;
  const { user, role } = useAuthContext();
  const { countryCode: adminCountry } = useAdminCountry();
  const { enabledCountries } = useContentCountries();
  const { shell } = useMemberTheme();
  const { hasPermission, isLoading: permissionsLoading } = useAdminPermissions();
  const { refresh } = useContent();
  const { canManageEvents, canManageSpots, canManageTools } = usePartnerContentScopes();
  const isEdit = Boolean(id);
  const isLocalStagingDraft = Boolean(
    id && (id.startsWith('evt-') || id.startsWith('spot-') || id.startsWith('tool-')),
  );
  const isAdminMode = Boolean(asAdmin) && role === 'ADMIN';
  const contentChannel: ContentChannel = resolveContentChannel({ asAdmin, contentChannel: contentChannelParam });
  const isLoopChannel = contentChannel === 'loop';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [program, setProgram] = useState('');
  const [eventCategoryIds, setEventCategoryIds] = useState<EventCategory[]>(['corporate']);
  const [spotCategoryIds, setSpotCategoryIds] = useState<LocationSubCategory[]>(
    isToolRoute ? ['tools'] : ['fine_dining'],
  );
  const category = primaryCategory(eventCategoryIds, 'corporate') as EventCategory;
  const subCategory = primaryCategory(spotCategoryIds, 'fine_dining') as LocationSubCategory;
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [venueMode, setVenueMode] = useState<VenueMode>('custom');
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueLocation, setVenueLocation] = useState<GuineaLocationSnapshot | null>(null);
  const [locationMode, setLocationMode] = useState<ContentLocationMode>('physical');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [isInvitationOnly, setIsInvitationOnly] = useState(false);
  const [currency, setCurrency] = useState('GNF');
  const [infoUrl, setInfoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [hoursMode, setHoursMode] = useState<HoursMode>('weekly');
  const [hoursSlots, setHoursSlots] = useState<WeeklyHoursSlot[]>([]);
  const [hoursTouched, setHoursTouched] = useState(false);
  const [priceLabel, setPriceLabel] = useState('');
  const [isInvitationPrice, setIsInvitationPrice] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [organizerName, setOrganizerName] = useState('');
  const [speakers, setSpeakers] = useState<SpeakerDraft[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [toolCategory, setToolCategory] = useState('');
  const [developer, setDeveloper] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [partnershipStatus, setPartnershipStatus] = useState<ToolPartnershipStatus>('pending');
  const [countryCode, setCountryCode] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [partnerSpots, setPartnerSpots] = useState<StagingSpot[]>([]);
  const [venueSpots, setVenueSpots] = useState<VenueSpotOption[]>([]);
  const [eventCategories, setEventCategories] = useState<CategoryOption[]>([]);
  const [spotCategories, setSpotCategories] = useState<CategoryOption[]>([]);
  const [toolCategories, setToolCategories] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [formLoading, setFormLoading] = useState(Boolean(id));
  const [adminContentStatus, setAdminContentStatus] = useState<ContentStatus | null>(null);
  const [contentOwner, setContentOwner] = useState<ContentOwnerInfo | null>(null);
  const [partnerAccounts, setPartnerAccounts] = useState<PartnerDirectoryEntry[]>([]);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null);

  const isToolForm = type === 'spot' && (subCategory === 'tools' || Boolean(isToolRoute));
  const partnerNameHint = user?.company ?? user?.fullName ?? '';
  const canCancelPendingSubmission = !isAdminMode && submissionStatus === 'pending' && Boolean(id);
  const reassignKind = type === 'event' ? 'event' as const : isToolForm ? 'tool' as const : 'spot' as const;

  const refreshContentOwner = useCallback(async () => {
    if (!isAdminMode || !id) {
      setContentOwner(null);
      return;
    }
    const owner = await getContentOwner(reassignKind, id);
    setContentOwner(owner);
  }, [isAdminMode, id, reassignKind]);

  useEffect(() => {
    if (!isAdminMode) return;
    void listPartnerAccounts(countryCode).then(setPartnerAccounts);
  }, [isAdminMode, countryCode]);

  useEffect(() => {
    void refreshContentOwner();
  }, [refreshContentOwner]);
  /** Accent sélection : thème du rôle (admin = bordeaux Control Tower). */
  const selectAccent = isAdminMode ? ADMIN_THEME.accent : (shell.filterActiveBg || '#10b981');
  const fieldAccent = selectAccent;
  const chipVariant = isAdminMode ? ('admin' as const) : isToolForm ? ('tool' as const) : ('primary' as const);

  const adminActions =
    isAdminMode && isEdit && adminContentStatus
      ? adminContentActionsFor(adminContentStatus)
      : isAdminMode
        ? adminContentActionsFor('draft')
        : null;
  const adminFormLocked = Boolean(isAdminMode && isEdit && adminActions && !adminActions.canEdit);
  const adminReadOnlyMessage =
    adminContentStatus === 'published'
      ? 'Champs en lecture seule. Vous pouvez transférer la gestion à un partenaire, ou repasser en brouillon / désactiver depuis Contenu.'
      : adminContentStatus === 'deactivated'
        ? 'Champs en lecture seule. Vous pouvez transférer la gestion, republier ou archiver depuis Contenu.'
        : adminContentStatus === 'archived'
          ? 'Lecture seule. Repassez en brouillon ou supprimez depuis Contenu.'
          : null;

  useEffect(() => {
    if (isAdminMode || role !== 'PARTNER') return;
    const blocked =
      (type === 'event' && !canManageEvents) ||
      (type === 'spot' && isToolForm && !canManageTools) ||
      (type === 'spot' && !isToolForm && !canManageSpots);
    if (blocked) {
      Alert.alert(
        'Module non activé',
        'Votre compte partenaire n\'a pas accès à ce type de contenu. Contactez THE LOOP.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  }, [isAdminMode, role, type, isToolForm, canManageEvents, canManageSpots, canManageTools, navigation]);

  useEffect(() => {
    if (isToolRoute) setSpotCategoryIds(['tools']);
  }, [isToolRoute]);

  useEffect(() => {
    void Promise.all([
      getCategoryOptions('event'),
      getCategoryOptions('spot'),
      getCategoryOptions('tool'),
    ]).then(([ev, sp, tl]) => {
      setEventCategories(ev);
      setSpotCategories(sp);
      setToolCategories(tl);
      if (!isEdit && ev.length && !ev.some((c) => eventCategoryIds.includes(c.id as EventCategory))) {
        setEventCategoryIds([ev[0].id as EventCategory]);
      }
    });
  }, [isEdit, eventCategoryIds]);

  useEffect(() => {
    if (!eventCategories.length || isEdit) return;
    const valid = eventCategoryIds.filter((id) => eventCategories.some((c) => c.id === id));
    if (valid.length === 0) {
      setEventCategoryIds([eventCategories[0].id as EventCategory]);
    } else if (valid.length !== eventCategoryIds.length) {
      setEventCategoryIds(valid as EventCategory[]);
    }
  }, [eventCategories, eventCategoryIds, isEdit]);

  useEffect(() => {
    if (!spotCategories.length || isEdit || isToolForm) return;
    const valid = spotCategoryIds.filter((id) => spotCategories.some((c) => c.id === id));
    if (valid.length === 0) {
      setSpotCategoryIds([spotCategories[0].id as LocationSubCategory]);
    } else if (valid.length !== spotCategoryIds.length) {
      setSpotCategoryIds(valid as LocationSubCategory[]);
    }
  }, [spotCategories, spotCategoryIds, isEdit, isToolForm]);

  useEffect(() => {
    if (!toolCategories.length) return;
    if (toolCategory && toolCategories.some((c) => c.id === toolCategory)) return;
    if (toolCategory) {
      const byLabel = toolCategories.find((c) => c.label === toolCategory);
      if (byLabel) {
        setToolCategory(byLabel.id);
        return;
      }
    }
    if (!isEdit && type === 'spot' && isToolForm) {
      setToolCategory(toolCategories[0].id);
    }
  }, [toolCategories, toolCategory, isEdit, type, isToolForm]);

  useEffect(() => {
    if (!user) return;
    const ownerId = isAdminMode ? 'admin' : user.id;
    void listPartnerSpots(ownerId).then((spots) => {
      setPartnerSpots(spots.filter((s) => s.status !== 'rejected'));
    });
  }, [user, isAdminMode]);

  useEffect(() => {
    if (!enabledCountries.length) return;
    setCountryCode((prev) => {
      if (enabledCountries.includes(prev)) return prev;
      const preferred = isAdminMode
        ? (adminCountry as CountryCode)
        : ((user?.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode);
      return clampContentCountry(preferred, enabledCountries);
    });
  }, [user?.countryCode, isAdminMode, adminCountry, enabledCountries]);

  useEffect(() => {
    if (id || type !== 'event' || isEdit) return;
    setOrganizerName(
      defaultEventOrganizerName({
        channel: contentChannel,
        company: user?.company,
        fullName: user?.fullName,
      }),
    );
  }, [id, type, isEdit, contentChannel, user?.company, user?.fullName]);

  useEffect(() => {
    if (type !== 'event') return;
    let cancelled = false;
    void buildVenueSpotOptions({
      countryCode,
      partnerSpots,
      isAdminMode,
    }).then((options) => {
      if (!cancelled) setVenueSpots(options);
    });
    return () => {
      cancelled = true;
    };
  }, [type, countryCode, partnerSpots, isAdminMode]);

  const loadFormData = useCallback(async () => {
    if (!id) {
      setAdminContentStatus(null);
      return;
    }
    setFormLoading(true);
    try {
      if (isAdminMode) {
        const status = await getAdminContentStatus(type === 'event' ? 'event' : 'spot', id);
        setAdminContentStatus(status);
      } else {
        setAdminContentStatus(null);
      }
      if (type === 'event') {
        const loaded = await loadEditableEvent(id);
        if (loaded) {
          setTitle(loaded.title);
          setDescription(loaded.description);
          setProgram(loaded.program ?? '');
          setEventCategoryIds(
            normalizeCategoriesList(loaded.categories ?? loaded.category, 'corporate') as EventCategory[],
          );
          setStartsAt(loaded.startsAt.slice(0, 16));
          setEndsAt(loaded.endsAt?.slice(0, 16) ?? '');
          setEntryPrice(loaded.entryPrice != null ? String(loaded.entryPrice) : '');
          const loadedInvitation = loaded.isInvitationOnly === true;
          const loadedFree = !loadedInvitation && loaded.entryPrice == null;
          setIsInvitationOnly(loadedInvitation);
          setIsFree(loadedFree);
          setCurrency(loaded.currency);
          if (loadedFree || loadedInvitation) {
            setInfoUrl(loaded.infoUrl ?? loaded.websiteUrl ?? '');
            setWebsite('');
          } else {
            setInfoUrl(loaded.infoUrl ?? '');
            setWebsite(loaded.websiteUrl ?? '');
          }
          setInstagramUrl(loaded.instagramUrl ?? '');
          setFacebookUrl(loaded.facebookUrl ?? '');
          setCoverImageUrl(loaded.coverImageUrl ?? '');
          setGalleryImages(loaded.galleryImages ?? []);
          setOrganizerName(loaded.organizerName ?? '');
          setSpeakers(
            (loaded.speakers ?? []).map((speaker) => ({
              name: speaker.name,
              title: speaker.title ?? '',
              company: speaker.company ?? '',
            })),
          );
          setCountryCode((loaded.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode);
          if (loaded.spotId) {
            setVenueMode('existing');
            setSelectedSpotId(loaded.spotId);
          } else {
            setVenueMode('custom');
            setVenueName(loaded.venueName);
            applyStoredLocation(loaded.venueAddress, null, loaded.venueName, loaded.venueLocation ?? null);
          }
          const stagingAfterLoad = await getStagingEventById(id);
          setSubmissionStatus(stagingAfterLoad?.status ?? 'pending');
          return;
        }
        const stagingItem = await getStagingEventById(id);
        if (stagingItem) {
          applyEventForm(stagingItem);
          return;
        }
        if (user) {
          const items = isAdminMode
            ? await listAllStagingEvents()
            : await listPartnerEvents(user.id);
          const item = items.find((e) => e.id === id);
          if (item) applyEventForm(item);
        }
      } else {
        const loaded = await loadEditableSpot(id);
        if (loaded) {
          setTitle(loaded.name);
          setDescription(loaded.description);
          applyStoredLocation(loaded.address, loaded.district, loaded.name);
          setSpotCategoryIds(
            normalizeCategoriesList(loaded.categories ?? loaded.subCategory, 'fine_dining') as LocationSubCategory[],
          );
          setPhone(loaded.phone ?? '');
          setWebsite(loaded.website ?? '');
          {
            const parsed = await applyParsedOpeningHours(loaded.openingHours);
            setHoursMode(parsed.mode);
            setHoursSlots(parsed.slots);
            setOpeningHours(parsed.label);
            setHoursTouched(Boolean(loaded.openingHours?.trim()));
          }
          setPriceLabel(loaded.priceLabel ?? '');
          setIsInvitationPrice((loaded.priceLabel ?? '').trim().toLowerCase() === 'sur invitation');
          setInstagramUrl(loaded.instagramUrl ?? '');
          setFacebookUrl(loaded.facebookUrl ?? '');
          setCtaUrl(loaded.ctaUrl ?? '');
          setGalleryImages(loaded.galleryImages ?? []);
          setCoverImageUrl(loaded.coverImageUrl ?? '');
          setOrganizerName(loaded.organizerName ?? '');
          setLogoUrl(loaded.logoUrl ?? loaded.coverImageUrl ?? '');
          setToolCategory(loaded.toolCategory ?? '');
          setDeveloper(loaded.developer ?? loaded.organizerName ?? '');
          setIsVerified(loaded.isVerified ?? false);
          setPartnershipStatus(loaded.partnershipStatus ?? (loaded.subCategory === 'tools' ? 'pending' : 'none'));
          setCountryCode((loaded.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode);
          const stagingAfterLoad = await getStagingSpotById(id);
          setSubmissionStatus(stagingAfterLoad?.status ?? 'pending');
          return;
        }
        const stagingItem = await getStagingSpotById(id);
        if (stagingItem) {
          await applySpotForm(stagingItem);
          return;
        }
        if (user) {
          const items = isAdminMode
            ? await listAllStagingSpots()
            : await listPartnerSpots(user.id);
          const item = items.find((s) => s.id === id);
          if (item) await applySpotForm(item);
        }
      }
    } finally {
      setFormLoading(false);
    }
  }, [id, type, user?.id, isAdminMode]);

  useEffect(() => {
    void loadFormData();
  }, [loadFormData]);

  function applyEventForm(item: Awaited<ReturnType<typeof listPartnerEvents>>[number]) {
    setSubmissionStatus(item.status);
    setTitle(item.title);
    setDescription(item.description);
    setProgram(item.program ?? '');
    setEventCategoryIds(
      normalizeCategoriesList(item.categories ?? item.category, 'corporate') as EventCategory[],
    );
    setStartsAt(item.startsAt.slice(0, 16));
    setEndsAt(item.endsAt?.slice(0, 16) ?? '');
    setEntryPrice(item.entryPrice != null ? String(item.entryPrice) : '');
    const itemInvitation = item.isInvitationOnly === true;
    const itemFree = !itemInvitation && item.entryPrice == null;
    setIsInvitationOnly(itemInvitation);
    setIsFree(itemFree);
    setCurrency(item.currency);
    if (itemFree || itemInvitation) {
      setInfoUrl(item.infoUrl ?? item.websiteUrl ?? '');
      setWebsite('');
    } else {
      setInfoUrl(item.infoUrl ?? '');
      setWebsite(item.websiteUrl ?? '');
    }
    setInstagramUrl(item.instagramUrl ?? '');
    setFacebookUrl(item.facebookUrl ?? '');
    setCoverImageUrl(item.coverImageUrl ?? '');
    setGalleryImages(eventGalleryExtras(item.coverImageUrl, item.galleryImages));
    setOrganizerName(item.organizerName ?? '');
    setSpeakers(
      (item.speakers ?? []).map((speaker) => ({
        name: speaker.name,
        title: speaker.title ?? '',
        company: speaker.company ?? '',
      })),
    );
    setCountryCode((item.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode);
    if (item.spotId) {
      setVenueMode('existing');
      setSelectedSpotId(item.spotId);
    } else {
      setVenueMode('custom');
      setVenueName(item.venueName);
      applyStoredLocation(item.venueAddress, null, item.venueName, item.venueLocation ?? null);
    }
  }

  async function applySpotForm(item: Awaited<ReturnType<typeof listPartnerSpots>>[number]) {
    setSubmissionStatus(item.status);
    setTitle(item.name);
    setDescription(item.description);
    applyStoredLocation(item.address, item.district, item.name);
    setSpotCategoryIds(
      normalizeCategoriesList(item.categories ?? item.subCategory, 'fine_dining') as LocationSubCategory[],
    );
    setPhone(item.phone ?? '');
    setWebsite(item.website ?? '');
    {
      const parsed = await applyParsedOpeningHours(item.openingHours);
      setHoursMode(parsed.mode);
      setHoursSlots(parsed.slots);
      setOpeningHours(parsed.label);
      setHoursTouched(Boolean(item.openingHours?.trim()));
    }
    setPriceLabel(item.priceLabel ?? '');
    setIsInvitationPrice((item.priceLabel ?? '').trim().toLowerCase() === 'sur invitation');
    setInstagramUrl(item.instagramUrl ?? '');
    setFacebookUrl(item.facebookUrl ?? '');
    setCtaUrl(item.ctaUrl ?? '');
    setGalleryImages(item.galleryImages ?? []);
    setCoverImageUrl(item.coverImageUrl ?? '');
    setOrganizerName(item.organizerName ?? '');
    setLogoUrl(item.logoUrl ?? '');
    setToolCategory(item.toolCategory ?? '');
    setDeveloper(item.developer ?? '');
    setIsVerified(item.isVerified ?? false);
    setPartnershipStatus(item.partnershipStatus ?? (item.subCategory === 'tools' ? 'pending' : 'none'));
    setCountryCode((item.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode);
  }

  useEffect(() => {
    setCurrency(getCountry(countryCode).currency);
  }, [countryCode]);

  useEffect(() => {
    if (venueMode !== 'existing' || !selectedSpotId) return;
    const spot = venueSpots.find((s) => s.id === selectedSpotId);
    if (spot) {
      setVenueName(spot.name);
      const resolved = resolveStoredContentLocationInput(spot.address, spot.district, {
        excludeLabel: spot.name,
      });
      setLocationMode(resolved.mode);
      setVenueAddress(resolved.mode === 'physical' ? resolved.physicalValue : '');
      setVenueLocation(
        resolved.mode === 'physical' && resolved.physicalValue
          ? guineaLocationSnapshotFromLabel(resolved.physicalValue, countryCode)
          : null,
      );
    }
  }, [venueMode, selectedSpotId, venueSpots]);

  function handleVenueLocationChange(value: string, meta?: GuineaLocationPickMeta) {
    const normalized = normalizePhysicalLocationForSave(value);
    setVenueAddress(normalized || value.trim());
    if (meta) {
      setVenueLocation(toGuineaLocationSnapshot(meta, normalized || value.trim(), countryCode));
      return;
    }
    setVenueLocation(
      normalized || value.trim()
        ? guineaLocationSnapshotFromLabel(normalized || value.trim(), countryCode)
        : null,
    );
  }

  function applyVenueLocationFromStored(
    address: string | null | undefined,
    district?: string | null,
    excludeLabel?: string | null,
    storedLocation?: GuineaLocationSnapshot | null,
  ) {
    const resolved = resolveStoredContentLocationInput(address, district, { excludeLabel });
    setLocationMode(resolved.mode);
    const physical = resolved.mode === 'physical' ? resolved.physicalValue : '';
    setVenueAddress(physical);
    if (storedLocation) {
      setVenueLocation(guineaLocationSnapshotFromStored(storedLocation, countryCode));
      return;
    }
    setVenueLocation(
      physical ? guineaLocationSnapshotFromLabel(physical, countryCode) : null,
    );
  }

  function applyStoredLocation(
    address: string | null | undefined,
    district?: string | null,
    excludeLabel?: string | null,
    storedLocation?: GuineaLocationSnapshot | null,
  ) {
    applyVenueLocationFromStored(address, district, excludeLabel, storedLocation);
  }

  function physicalLocationForSave(raw: string): string {
    return normalizePhysicalLocationForSave(raw);
  }

  function serializePhysicalVenueAddress(raw: string): string | null {
    return serializeContentLocation(locationMode, physicalLocationForSave(raw));
  }

  function FieldLabel({ children }: { children: string | string[] }) {
    return <Text style={[styles.label, { color: shell.pageKicker }]}>{children}</Text>;
  }

  function collectMissingFields(asDraft: boolean): string[] {
    if (asDraft) return [];
    const missing: string[] = [];
    if (!title.trim()) missing.push(type === 'event' ? 'Titre' : isToolForm ? 'Nom de l\'outil' : 'Nom du lieu');
    if (!description.trim()) missing.push('Description');
    if (type === 'event') {
      if (!eventCategories.length) missing.push('Catégorie (catalogue indisponible — rechargez ou seed Supabase)');
      else if (
        eventCategoryIds.length === 0
        || !eventCategoryIds.every((id) => eventCategories.some((c) => c.id === id))
      ) missing.push('Catégorie');
      if (!startsAt.trim()) missing.push('Date et heure de début');
      if (contentChannel === 'partner' && !organizerName.trim()) missing.push('Organisateur');
      if (venueMode === 'existing' && !selectedSpotId) missing.push('Spot existant');
      if (venueMode === 'custom' && !venueName.trim()) missing.push('Nom du lieu / salle');
    }
    if (type === 'spot' && isToolForm) {
      if (!toolCategories.length) missing.push('Catégorie outil (catalogue indisponible)');
      else if (!toolCategories.some((c) => c.id === toolCategory)) missing.push('Catégorie outil');
      if (!developer.trim()) missing.push('Développeur / éditeur');
    }
    if (type === 'spot' && !isToolForm) {
      if (!spotCategories.length) missing.push('Type de lieu (catalogue indisponible)');
      else if (
        spotCategoryIds.length === 0
        || !spotCategoryIds.every((id) => spotCategories.some((c) => c.id === id))
      ) missing.push('Type de lieu');
    }
    return missing;
  }

  async function handleSave(asDraft = false) {
    if (!user) {
      Alert.alert('Session requise', 'Reconnectez-vous pour continuer.');
      return;
    }
    if (isAdminMode && isEdit && adminContentStatus && !adminContentActionsFor(adminContentStatus).canEdit) {
      Alert.alert(
        'Modification impossible',
        'Seuls les brouillons peuvent être modifiés. Utilisez Control Tower → Contenu pour les autres actions.',
      );
      return;
    }
    const missing = collectMissingFields(asDraft);
    if (missing.length) {
      Alert.alert(
        'Champs obligatoires',
        `Veuillez compléter les champs suivants avant de continuer :\n\n• ${missing.join('\n• ')}`,
      );
      return;
    }

    setSaving(true);
    let successCopy: { title: string; message: string } | null = null;
    try {
      const ownerId = isAdminMode
        ? (isLoopChannel && user ? user.id : 'admin')
        : user.id;
      const partnerName = isAdminMode
        ? (isLoopChannel ? THE_LOOP_ORGANIZER_LABEL : 'THE LOOP Admin')
        : (user.company ?? user.fullName ?? 'Partenaire');
      if (type === 'event') {
        const resolvedOrganizer = resolveEventOrganizerName(organizerName, {
          channel: contentChannel,
          company: user.company,
          fullName: user.fullName,
        });
        const cover = coverImageUrl.trim() || null;
        const galleryImagesPayload = eventGalleryExtras(cover, galleryImages);
        const speakersPayload = buildSpeakersPayload(speakers);
        const payload = {
          title: title.trim() || 'Sans titre',
          description: description.trim(),
          program: program.trim() || null,
          category,
          categories: eventCategoryIds,
          startsAt: startsAt.trim() ? new Date(startsAt).toISOString() : new Date().toISOString(),
          endsAt: endsAt.trim() ? new Date(endsAt).toISOString() : null,
          venueName: venueName.trim(),
          venueAddress: serializePhysicalVenueAddress(venueAddress),
          venueLocation,
          guineaLocationId: null,
          spotId: venueMode === 'existing' ? selectedSpotId : null,
          entryPrice: isFree || isInvitationOnly ? null : (entryPrice.trim() ? Number(entryPrice) : null),
          isInvitationOnly,
          currency: currency.trim() || 'GNF',
          infoUrl: infoUrl.trim() || null,
          instagramUrl: instagramUrl.trim() || null,
          facebookUrl: facebookUrl.trim() || null,
          websiteUrl: isFree || isInvitationOnly ? null : (infoUrl.trim() ? (website.trim() || null) : null),
          coverImageUrl: cover,
          galleryImages: galleryImagesPayload,
          organizerName: resolvedOrganizer,
          speakers: speakersPayload,
          contentOrigin: contentChannel,
          countryCode,
        };
        if (isEdit && id) {
          if (isAdminMode) {
            // Brouillon local : Publier = insert catalogue (pas seulement save staging).
            if (id.startsWith('evt-') && !asDraft) {
              await saveEditableEvent({
                source: 'staging',
                id,
                ...payload,
              });
              const promoted = await promoteStagingDraftToCatalog('event', id);
              if (!promoted.ok) {
                throw new Error(promoted.error ?? 'admin_event_publish_failed');
              }
              successCopy = publicationSuccessCopy({
                asDraft: false,
                isEdit: false,
                isAdminMode: true,
                kind: 'event',
              });
            } else {
              const ok = await saveEditableEvent({
                source: id.startsWith('evt-') ? 'staging' : 'supabase',
                id,
                ...payload,
              });
              if (!ok) throw new Error('save failed');
            }
          } else {
            const updated = await updatePartnerEvent(id, ownerId, payload);
            if (!updated) throw new Error('published_readonly');
          }
        } else if (isAdminMode && !asDraft) {
          const direct = await createAdminEventDirect({
            title: payload.title,
            description: payload.description,
            program: payload.program,
            category: payload.category,
            categories: payload.categories,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
            venueName: payload.venueName,
            venueAddress: payload.venueAddress,
            spotId: payload.spotId,
            entryPrice: payload.entryPrice,
            isInvitationOnly: payload.isInvitationOnly,
            infoUrl: payload.infoUrl,
            websiteUrl: payload.websiteUrl,
            instagramUrl: payload.instagramUrl,
            facebookUrl: payload.facebookUrl,
            coverImageUrl: payload.coverImageUrl,
            galleryImages: payload.galleryImages,
            organizerName: payload.organizerName,
            speakers: speakersPayload,
            contentOrigin: contentChannel,
            countryCode: payload.countryCode,
            contentStatus: 'published',
          });
          if (!direct.ok) {
            throw new Error(direct.reason ?? 'admin_event_publish_failed');
          }
          if (direct.id) {
            const speakersOk = await syncEditableEventSpeakers(direct.id, speakersPayload);
            if (!speakersOk && speakersPayload.length > 0) {
              Alert.alert(
                'Intervenants',
                'L\'événement est publié mais les intervenants n\'ont pas pu être enregistrés. Réouvrez la fiche et enregistrez à nouveau.',
              );
            }
          }
          successCopy = publicationSuccessCopy({
            asDraft: false,
            isEdit: false,
            isAdminMode: true,
            kind: 'event',
          });
        } else if (asDraft) {
          await createPartnerEvent(
            { partnerId: ownerId, partnerName, masterId: user.id, ...payload },
            { draft: true },
          );
          successCopy = publicationSuccessCopy({
            asDraft: true,
            isEdit: false,
            isAdminMode: false,
            kind: 'event',
          });
        } else {
          const { remoteSync } = await createPartnerEvent(
            { partnerId: ownerId, partnerName, masterId: user.id, ...payload },
          );
          successCopy = publicationSuccessCopy({
            asDraft: false,
            isEdit: false,
            isAdminMode: false,
            kind: 'event',
            remoteSyncOk: remoteSync.ok,
          });
        }
      } else {
        const galleryImagesPayload = galleryImages.filter(Boolean);
        // Conserver le slug catégorie (filtre Outils / modération), pas le libellé affiché
        const resolvedToolCategory = toolCategory.trim() || null;
        const toolPayload = isToolForm
          ? {
              logoUrl: logoUrl.trim() || coverImageUrl.trim() || null,
              toolCategory: resolvedToolCategory,
              developer: developer.trim() || null,
              isVerified: isAdminMode ? isVerified : false,
              partnershipStatus: isAdminMode ? partnershipStatus : (isEdit ? partnershipStatus : 'pending'),
            }
          : {
              logoUrl: null as string | null,
              toolCategory: null as string | null,
              developer: null as string | null,
              isVerified: false,
              partnershipStatus: 'none' as ToolPartnershipStatus,
            };
        const resolvedLocation = serializePhysicalVenueAddress(venueAddress);
        const spotLocation = resolvedLocation ?? '';
        const spotDistrict =
          locationMode === 'physical' && venueAddress.trim()
            ? spotDistrictFromGuineaLabel(physicalLocationForSave(venueAddress))
            : null;
        const resolvedOpeningHours = isToolForm
          ? null
          : hoursTouched
            ? await resolveOpeningHoursForSubmit(hoursMode, hoursSlots)
            : (openingHours.trim() || null);
        const payload = {
          name: title.trim(),
          description: description.trim(),
          address: spotLocation,
          district: isToolForm ? null : spotDistrict,
          subCategory: isToolForm ? 'tools' as const : subCategory,
          categories: isToolForm ? ['tools'] : spotCategoryIds,
          phone: phone.trim() || null,
          website: website.trim() || null,
          openingHours: resolvedOpeningHours,
          priceLabel: isToolForm ? null : (isInvitationPrice ? 'Sur invitation' : priceLabel.trim() || null),
          instagramUrl: instagramUrl.trim() || null,
          facebookUrl: facebookUrl.trim() || null,
          ctaUrl: ctaUrl.trim() || website.trim() || null,
          galleryImages: galleryImagesPayload,
          coverImageUrl: (isToolForm ? logoUrl.trim() : coverImageUrl.trim()) || null,
          organizerName: isToolForm ? developer.trim() || organizerName.trim() || null : organizerName.trim() || null,
          contentOrigin: contentChannel,
          countryCode,
          ...toolPayload,
        };
        if (isEdit && id) {
          if (isAdminMode) {
            const isLocalDraft = id.startsWith('spot-') || id.startsWith('tool-');
            if (isLocalDraft && !asDraft) {
              const ok = await saveEditableSpot({
                source: 'staging',
                id,
                name: payload.name,
                description: payload.description,
                address: payload.address,
                district: payload.district,
                subCategory: payload.subCategory,
                categories: payload.categories,
                phone: payload.phone,
                website: payload.website,
                openingHours: payload.openingHours,
                priceLabel: payload.priceLabel,
                instagramUrl: payload.instagramUrl,
                facebookUrl: payload.facebookUrl,
                ctaUrl: payload.ctaUrl,
                galleryImages: payload.galleryImages,
                coverImageUrl: payload.coverImageUrl,
                organizerName: payload.organizerName,
                logoUrl: payload.logoUrl,
                toolCategory: payload.toolCategory,
                isVerified: payload.isVerified,
                developer: payload.developer,
                partnershipStatus: payload.partnershipStatus,
                countryCode: payload.countryCode,
              });
              if (!ok) throw new Error('save failed');
              const promoted = await promoteStagingDraftToCatalog('spot', id);
              if (!promoted.ok) {
                throw new Error(promoted.error ?? 'admin_spot_publish_failed');
              }
              successCopy = publicationSuccessCopy({
                asDraft: false,
                isEdit: false,
                isAdminMode: true,
                kind: isToolForm ? 'tool' : 'spot',
              });
            } else {
              const ok = await saveEditableSpot({
                source: isLocalDraft ? 'staging' : 'supabase',
                id,
                name: payload.name,
                description: payload.description,
                address: payload.address,
                district: payload.district,
                subCategory: payload.subCategory,
                categories: payload.categories,
                phone: payload.phone,
                website: payload.website,
                openingHours: payload.openingHours,
                priceLabel: payload.priceLabel,
                instagramUrl: payload.instagramUrl,
                facebookUrl: payload.facebookUrl,
                ctaUrl: payload.ctaUrl,
                galleryImages: payload.galleryImages,
                coverImageUrl: payload.coverImageUrl,
                organizerName: payload.organizerName,
                logoUrl: payload.logoUrl,
                toolCategory: payload.toolCategory,
                isVerified: payload.isVerified,
                developer: payload.developer,
                partnershipStatus: payload.partnershipStatus,
                countryCode: payload.countryCode,
              });
              if (!ok) throw new Error('save failed');
            }
          } else {
            const updated = await updatePartnerSpot(id, ownerId, payload);
            if (!updated) throw new Error('published_readonly');
          }
        } else if (isAdminMode && !asDraft) {
          if (isToolForm) {
            const direct = await createAdminToolDirect({
              name: payload.name,
              description: payload.description,
              phone: payload.phone,
              website: payload.website,
              logoUrl: payload.logoUrl,
              coverImageUrl: payload.coverImageUrl,
              galleryImages: payload.galleryImages,
              instagramUrl: payload.instagramUrl,
              facebookUrl: payload.facebookUrl,
              ctaUrl: payload.ctaUrl,
              toolCategory: payload.toolCategory,
              developer: payload.developer,
              isVerified: payload.isVerified,
              partnershipStatus: payload.partnershipStatus,
              contentOrigin: contentChannel,
              countryCode: payload.countryCode,
              contentStatus: 'published',
            });
            if (!direct.ok) {
              throw new Error(direct.reason ?? 'admin_tool_publish_failed');
            }
          } else {
            const direct = await createAdminEstablishmentDirect({
              name: payload.name,
              description: payload.description,
              address: payload.address,
              district: payload.district,
              subCategory: payload.subCategory,
              categories: payload.categories,
              phone: payload.phone,
              website: payload.website,
              logoUrl: payload.logoUrl,
              coverImageUrl: payload.coverImageUrl,
              galleryImages: payload.galleryImages,
              openingHours: payload.openingHours,
              priceLabel: payload.priceLabel,
              instagramUrl: payload.instagramUrl,
              facebookUrl: payload.facebookUrl,
              ctaUrl: payload.ctaUrl,
              organizerName: payload.organizerName,
              contentOrigin: contentChannel,
              countryCode: payload.countryCode,
              contentStatus: 'published',
            });
            if (!direct.ok) {
              throw new Error(direct.reason ?? 'admin_spot_publish_failed');
            }
          }
          successCopy = publicationSuccessCopy({
            asDraft: false,
            isEdit: false,
            isAdminMode: true,
            kind: isToolForm ? 'tool' : 'spot',
          });
        } else if (asDraft) {
          await createPartnerSpot({ partnerId: ownerId, partnerName, ...payload }, { draft: true });
          successCopy = publicationSuccessCopy({
            asDraft: true,
            isEdit: false,
            isAdminMode: false,
            kind: isToolForm ? 'tool' : 'spot',
          });
        } else {
          const { remoteSync } = await createPartnerSpot({ partnerId: ownerId, partnerName, ...payload });
          successCopy = publicationSuccessCopy({
            asDraft: false,
            isEdit: false,
            isAdminMode: false,
            kind: isToolForm ? 'tool' : 'spot',
            remoteSyncOk: remoteSync.ok,
          });
        }
      }
      invalidateContentCache();
      await refresh();
      const finalCopy = successCopy ?? publicationSuccessCopy({
        asDraft,
        isEdit: Boolean(isEdit && id),
        isAdminMode,
        kind: type === 'event' ? 'event' : isToolForm ? 'tool' : 'spot',
      });
      const pendingSubmitted = !isAdminMode && !asDraft && !isEdit;
      Alert.alert(
        finalCopy.title,
        pendingSubmitted
          ? `${finalCopy.message}\n\nVous pouvez annuler cette soumission depuis Mes contenus tant qu'elle n'est pas validée.`
          : finalCopy.message,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Erreur inconnue';
      if (detail === 'published_readonly') {
        Alert.alert(
          'Lecture seule',
          'Ce contenu est publié et ne peut plus être modifié depuis votre espace. Contactez THE LOOP pour toute modification.',
          [{ text: 'OK' }],
        );
        return;
      }
      const err = formatPublicationError(detail);
      Alert.alert(err.title, err.message, [{ text: 'OK' }]);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelSubmission() {
    if (!user || !id || !canCancelPendingSubmission) return;
    Alert.alert(
      'Annuler la soumission',
      'Ce contenu sera retiré de la file de modération THE LOOP. Confirmer ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler la soumission',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const kind = type === 'event' ? 'event' : isToolForm ? 'tool' : 'spot';
              const res = await cancelPartnerPendingSubmission(kind, id, user.id, partnerNameHint);
              if (!res.ok) {
                Alert.alert('Annulation impossible', res.error ?? 'Réessayez.');
                return;
              }
              invalidateContentCache();
              await refresh();
              Alert.alert('Soumission annulée', 'Votre contenu n\'est plus en attente de validation.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            })();
          },
        },
      ],
    );
  }

  async function handleDelete() {
    if (!user || !id) return;
    if (isAdminMode && adminContentStatus && !adminContentActionsFor(adminContentStatus).canDelete) {
      Alert.alert('Suppression impossible', 'Seuls les brouillons et contenus archivés peuvent être supprimés.');
      return;
    }
    Alert.alert('Supprimer', 'Confirmer la suppression ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const ok = isAdminMode
            ? type === 'event'
              ? await adminDeletePartnerEvent(id)
              : await adminDeletePartnerSpot(id)
            : type === 'event'
              ? await deletePartnerEvent(id, user.id, partnerNameHint)
              : await deletePartnerSpot(id, user.id, partnerNameHint);
          if (ok) {
            invalidateContentCache();
            await refresh();
            navigation.goBack();
          } else {
            Alert.alert('Impossible', 'Les contenus publiés ne peuvent pas être supprimés.');
          }
        },
      },
    ]);
  }

  async function onReassignOwner(selectedId: string) {
    if (!id || !isAdminMode) return;
    const isTeam = selectedId === TEAM_CONTENT_OWNER_ID;
    const account = partnerAccounts.find((p) => p.id === selectedId);
    const partnerUserId = isTeam ? null : (account ? partnerAccountUserId(account) : null);
    if (!isTeam && !partnerUserId) {
      Alert.alert('Partenaire', 'Compte partenaire invalide.');
      return;
    }
    const label = isTeam
      ? 'THE LOOP (équipe)'
      : (account ? partnerAccountDisplayName(account) : 'Partenaire');

    Alert.alert(
      isTeam ? 'Reprendre la gestion' : 'Transférer la gestion',
      isTeam
        ? `Reprendre la gestion de ce contenu côté équipe THE LOOP ?`
        : `Transférer la gestion à « ${label} » ?\n\nLe partenaire pourra le voir dans son Espace Pro.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: () => {
            void (async () => {
              setReassigning(true);
              try {
                const result = await reassignContentOwner(reassignKind, id, partnerUserId, {
                  partnerDisplayName: label,
                });
                if (!result.ok) {
                  Alert.alert('Échec', result.error ?? 'Transfert impossible.');
                  return;
                }
                invalidateContentCache();
                await refresh();
                await refreshContentOwner();
                Alert.alert(
                  'Gestion mise à jour',
                  isTeam
                    ? 'Le contenu est à nouveau géré par l\'équipe THE LOOP.'
                    : `Gestion transférée à ${result.partnerName ?? label}.`,
                );
              } finally {
                setReassigning(false);
              }
            })();
          },
        },
      ],
    );
  }

  if (isAdminMode && !permissionsLoading && !hasPermission('content') && !hasPermission('moderation')) {
    return <AdminModuleDenied shell={shell} moduleLabel="Contenu" onBack={() => navigation.goBack()} />;
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <PageHeader
        title={
          isAdminMode
            ? type === 'event'
              ? isEdit
                ? `${isLoopChannel ? 'THE LOOP' : 'Control Tower'} · Modifier événement`
                : `${isLoopChannel ? 'THE LOOP' : 'Control Tower'} · Nouvel événement`
              : isToolForm
                ? isEdit ? 'Control Tower · Modifier outil' : 'Control Tower · Nouvel outil'
                : isEdit ? 'Control Tower · Modifier spot' : 'Control Tower · Nouveau spot'
            : type === 'event'
              ? isEdit ? 'Modifier événement' : 'Nouvel événement'
              : isToolForm
                ? isEdit ? 'Modifier outil' : 'Nouvel outil'
                : isEdit ? 'Modifier spot' : 'Nouveau spot'
        }
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      {isAdminMode && isEdit ? (
        <View style={[styles.ownerCard, { borderColor: ADMIN_THEME.accent + '55', backgroundColor: ADMIN_THEME.glow }]}>
          <Text style={[styles.ownerTitle, { color: shell.pageTitle }]}>Gestion partenaire</Text>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Gestionnaire actuel :{' '}
            {contentOwner?.displayName
              ?? (contentOwner?.userRole === 'partner' ? 'Partenaire' : 'Équipe THE LOOP')}
            {contentOwner?.contentOrigin
              ? ` · ${CONTENT_ORIGIN_LABELS[contentOwner.contentOrigin]}`
              : ''}
          </Text>
          <Pressable
            style={[styles.ownerBtn, { borderColor: ADMIN_THEME.accent }]}
            disabled={reassigning}
            onPress={() => setOwnerPickerOpen(true)}
          >
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>
              {reassigning ? 'Transfert…' : 'Transférer / changer le partenaire'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {formLoading ? (
        <Text style={[styles.loadingHint, { color: shell.pageKicker }]}>Chargement du contenu…</Text>
      ) : null}

      {adminFormLocked && adminContentStatus && adminReadOnlyMessage ? (
        <View style={[styles.readOnlyBanner, { backgroundColor: '#f59e0b22', borderColor: '#f59e0b55' }]}>
          <Text style={[styles.readOnlyBannerText, { color: shell.pageTitle }]}>
            {CONTENT_STATUS_LABELS[adminContentStatus]} — {adminReadOnlyMessage}
          </Text>
        </View>
      ) : null}

      <View pointerEvents={adminFormLocked ? 'none' : 'auto'} style={adminFormLocked ? styles.readOnlyForm : undefined}>
      <FieldLabel>{type === 'event' ? 'Titre *' : isToolForm ? 'Nom de l\'outil *' : 'Nom du lieu *'}</FieldLabel>
      <FormTextInput
        shell={shell}
        accentColor={fieldAccent}
        value={title}
        onChangeText={setTitle}
        placeholder={type === 'event' ? 'Ex. Soirée Networking VIP' : isToolForm ? 'Ex. Loop Pay, Canva' : 'Ex. L\'Avenue Restaurant'}
        placeholderTextColor={shell.pageKicker}
      />

      {isToolForm ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Slug : {slugify(title.trim()) || '—'} (généré automatiquement)
        </Text>
      ) : null}

      <FieldLabel>Description *</FieldLabel>
      <FormTextInput
        shell={shell}
        accentColor={fieldAccent}
        style={styles.multiline}
        value={description}
        onChangeText={setDescription}
        placeholder="Présentation détaillée"
        placeholderTextColor={shell.pageKicker}
        multiline
      />

      <CountrySelectField
        value={countryCode}
        onChange={setCountryCode}
        shell={shell}
        label="Pays du contenu"
        countries={enabledCountries}
      />

      {type === 'event' && (
        <>
          <FieldLabel>Programme</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            style={styles.multiline}
            value={program}
            onChangeText={setProgram}
            placeholder="18h00 Accueil · 19h00 Conférence · 21h00 Cocktail"
            placeholderTextColor={shell.pageKicker}
            multiline
          />

          <FieldLabel>Catégories *</FieldLabel>
          <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
            Sélectionnez une ou plusieurs catégories.
          </Text>
          <View style={styles.catRow}>
            {eventCategories.map((cat) => (
              <FormSelectChip
                key={cat.id}
                label={cat.label}
                emoji={cat.emoji}
                selected={eventCategoryIds.includes(cat.id as EventCategory)}
                onPress={() => setEventCategoryIds(
                  toggleCategoryInList(eventCategoryIds, cat.id) as EventCategory[],
                )}
                shell={shell}
                variant={chipVariant}
              />
            ))}
          </View>
          {eventCategories.length === 0 ? (
            <Text style={[styles.hint, { color: '#ef4444' }]}>Aucune catégorie chargée — vérifiez Supabase ou votre connexion.</Text>
          ) : null}

          <FieldLabel>Organisateur {contentChannel === 'admin' ? '(optionnel)' : '*'}</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            value={organizerName}
            onChangeText={setOrganizerName}
            placeholder={
              contentChannel === 'partner'
                ? `Ex. ${user?.company ?? 'Votre établissement'}`
                : contentChannel === 'loop'
                  ? THE_LOOP_ORGANIZER_LABEL
                  : 'THE LOOP par défaut — laissez vide pour ne pas afficher'
            }
            placeholderTextColor={shell.pageKicker}
          />
          {contentChannel === 'admin' ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Control Tower : « {THE_LOOP_ORGANIZER_LABEL} » proposé par défaut. Vide à l'enregistrement = non affiché.
            </Text>
          ) : null}
          {contentChannel === 'loop' ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Publication au nom de THE LOOP — organisateur enregistré comme « {THE_LOOP_ORGANIZER_LABEL} » si vide.
            </Text>
          ) : null}
          {contentChannel === 'partner' ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Partenaire : votre entreprise est proposée par défaut. Si vide à l'enregistrement, le nom de votre établissement est utilisé.
            </Text>
          ) : null}

          <FieldLabel>Intervenants (speakers)</FieldLabel>
          <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
            Ajoutez les personnes qui interviendront lors de l'événement (optionnel).
          </Text>
          {speakers.map((speaker, index) => (
            <View
              key={`speaker-${index}`}
              style={[styles.speakerCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
            >
              <FormTextInput
                shell={shell}
                accentColor={fieldAccent}
                value={speaker.name}
                onChangeText={(value) => {
                  setSpeakers((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)),
                  );
                }}
                placeholder="Nom complet"
                placeholderTextColor={shell.pageKicker}
              />
              <FormTextInput
                shell={shell}
                accentColor={fieldAccent}
                value={speaker.title}
                onChangeText={(value) => {
                  setSpeakers((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, title: value } : item)),
                  );
                }}
                placeholder="Titre / rôle professionnel"
                placeholderTextColor={shell.pageKicker}
              />
              <FormTextInput
                shell={shell}
                accentColor={fieldAccent}
                value={speaker.company}
                onChangeText={(value) => {
                  setSpeakers((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, company: value } : item)),
                  );
                }}
                placeholder="Entreprise (optionnel)"
                placeholderTextColor={shell.pageKicker}
              />
              <Pressable
                onPress={() => setSpeakers((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                style={styles.speakerRemove}
              >
                <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 12 }}>Retirer cet intervenant</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={() => setSpeakers((current) => [...current, { name: '', title: '', company: '' }])}
            style={[styles.addSpeakerBtn, { borderColor: shell.filterInactiveBorder }]}
          >
            <Text style={{ color: shell.tabIndicator, fontWeight: '700' }}>+ Ajouter un intervenant</Text>
          </Pressable>

          <FieldLabel>Date et heure de début *</FieldLabel>
          <DateTimeField
            value={startsAt}
            onChange={setStartsAt}
            placeholder="Choisir la date et l'heure de début"
            shell={shell}
          />

          <FieldLabel>Date et heure de fin</FieldLabel>
          <DateTimeField
            value={endsAt}
            onChange={setEndsAt}
            placeholder="Choisir la date et l'heure de fin (optionnel)"
            shell={shell}
          />

          <FieldLabel>Lieu de l'événement *</FieldLabel>
          <View style={styles.catRow}>
            <FormSelectChip
              label="Spot existant"
              selected={venueMode === 'existing'}
              onPress={() => setVenueMode('existing')}
              shell={shell}
              variant={chipVariant}
            />
            <FormSelectChip
              label="Autre lieu"
              selected={venueMode === 'custom'}
              onPress={() => {
                if (venueMode === 'existing') {
                  setVenueName('');
                  setVenueAddress('');
                  setVenueLocation(null);
                  setLocationMode('physical');
                }
                setVenueMode('custom');
                setSelectedSpotId(null);
              }}
              shell={shell}
              variant={chipVariant}
            />
          </View>

          {venueMode === 'existing' ? (
            venueSpots.length > 0 ? (
              <SpotSelectField
                spots={venueSpots}
                value={selectedSpotId}
                onChange={setSelectedSpotId}
                shell={shell}
                accentColor={fieldAccent}
                placeholder="Choisir un spot existant"
              />
            ) : (
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Aucun spot en base — créez d'abord un spot ou utilisez « Autre lieu ».
              </Text>
            )
          ) : (
            <>
              <FieldLabel>Nom du lieu / salle *</FieldLabel>
              <FormTextInput shell={shell} accentColor={fieldAccent} value={venueName} onChangeText={setVenueName} placeholder="Nom du lieu / salle" placeholderTextColor={shell.pageKicker} />
              <ContentLocationFields
                mode={locationMode}
                onModeChange={setLocationMode}
                value={venueAddress}
                onChange={handleVenueLocationChange}
                shell={shell}
                countryCode={countryCode}
                chipVariant={chipVariant}
                disabled={adminFormLocked}
              />
              {venueLocation ? (
                <Text style={[styles.hint, { color: shell.pageKicker, marginTop: -4, marginBottom: 8 }]}>
                  {venueLocation.region} · {venueLocation.prefecture} · {venueLocation.commune}
                  {venueLocation.district ? ` · ${venueLocation.district}` : ''}
                </Text>
              ) : null}
            </>
          )}

          <View style={styles.freeRow}>
            <Text style={[styles.freeLabel, { color: shell.pageTitle }]}>Événement gratuit</Text>
            <Switch
              value={isFree}
              onValueChange={(value) => {
                setIsFree(value);
                if (value) {
                  setIsInvitationOnly(false);
                  setEntryPrice('');
                  if (!infoUrl.trim() && website.trim()) {
                    setInfoUrl(website);
                    setWebsite('');
                  }
                }
              }}
              trackColor={{ false: shell.filterInactiveBorder, true: selectAccent }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.freeRow}>
            <Text style={[styles.freeLabel, { color: shell.pageTitle }]}>Sur invitation</Text>
            <Switch
              value={isInvitationOnly}
              onValueChange={(value) => {
                setIsInvitationOnly(value);
                if (value) {
                  setIsFree(false);
                  setEntryPrice('');
                  if (!infoUrl.trim() && website.trim()) {
                    setInfoUrl(website);
                    setWebsite('');
                  }
                }
              }}
              trackColor={{ false: shell.filterInactiveBorder, true: selectAccent }}
              thumbColor="#fff"
            />
          </View>

          {!isFree && !isInvitationOnly ? (
            <>
              <FieldLabel>Tarif d'entrée (GNF)</FieldLabel>
              <FormTextInput shell={shell} accentColor={fieldAccent} value={entryPrice} onChangeText={setEntryPrice} placeholder="150000" keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
              <FieldLabel>Lien billeterie</FieldLabel>
              <FormTextInput shell={shell} accentColor={fieldAccent} value={infoUrl} onChangeText={setInfoUrl} placeholder="https://billeterie..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />
            </>
          ) : (
            <>
              <FieldLabel>Lien en savoir plus</FieldLabel>
              <FormTextInput shell={shell} accentColor={fieldAccent} value={infoUrl} onChangeText={setInfoUrl} placeholder="https://..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                {isInvitationOnly
                  ? 'Entrée sur invitation — ce lien alimente le bouton « En savoir plus » sur la fiche.'
                  : 'Entrée gratuite — ce lien alimente le bouton « En savoir plus » sur la fiche.'}
              </Text>
            </>
          )}

          {!isFree && !isInvitationOnly && infoUrl.trim() ? (
            <>
              <FieldLabel>Site web (optionnel)</FieldLabel>
              <FormTextInput shell={shell} accentColor={fieldAccent} value={website} onChangeText={setWebsite} placeholder="https://..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Affiché sur la fiche seulement si renseigné — la billeterie reste sur « Réserver billet ».
              </Text>
            </>
          ) : null}

          <FieldLabel>Instagram</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={instagramUrl} onChangeText={setInstagramUrl} placeholder="https://instagram.com/..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <FieldLabel>Facebook</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={facebookUrl} onChangeText={setFacebookUrl} placeholder="https://facebook.com/..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <ImageUploadField
            label="Image de couverture"
            value={coverImageUrl}
            onChange={setCoverImageUrl}
            shell={shell}
            folder="events"
            cropAspect={[16, 9]}
            hint="Photo affichée sur la carte et en tête de la fiche événement (16:9)."
          />

          <GalleryUploadField
            label="Galerie photos"
            values={galleryImages}
            onChange={setGalleryImages}
            shell={shell}
          />
          <Text style={[styles.hint, { color: shell.pageKicker, marginTop: -4, marginBottom: 8 }]}>
            Photos supplémentaires pour le défilement sur la fiche détail (la couverture reste l'image principale).
          </Text>
        </>
      )}

      {type === 'spot' && isToolForm ? (
        <>
          <ImageUploadField
            label="Logo *"
            value={logoUrl}
            onChange={setLogoUrl}
            shell={shell}
            folder="spots"
            cropAspect={[1, 1]}
            hint="Icône ou logo carré de l'outil (affiché sur la carte)."
          />

          <FieldLabel>Catégorie *</FieldLabel>
          <View style={styles.catRow}>
            {toolCategories.map((cat) => (
              <FormSelectChip
                key={cat.id}
                label={cat.label}
                emoji={cat.emoji}
                selected={toolCategory === cat.id}
                onPress={() => setToolCategory(cat.id)}
                shell={shell}
                variant={chipVariant}
              />
            ))}
          </View>
          {toolCategories.length === 0 ? (
            <Text style={[styles.hint, { color: '#ef4444' }]}>Aucune catégorie outil — seed Supabase requis.</Text>
          ) : null}

          <FieldLabel>Développeur / éditeur *</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            value={developer}
            onChangeText={setDeveloper}
            placeholder="Ex. Loop Studio, Google LLC"
            placeholderTextColor={shell.pageKicker}
          />

          <ContentLocationFields
            mode={locationMode}
            onModeChange={setLocationMode}
            value={venueAddress}
            onChange={handleVenueLocationChange}
            shell={shell}
            countryCode={countryCode}
            chipVariant={chipVariant}
            disabled={adminFormLocked}
          />

          <FieldLabel>Site web</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://..."
            placeholderTextColor={shell.pageKicker}
            autoCapitalize="none"
          />

          <FieldLabel>Lien téléchargement / CTA</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            value={ctaUrl}
            onChangeText={setCtaUrl}
            placeholder="App Store, Play Store, page produit…"
            placeholderTextColor={shell.pageKicker}
            autoCapitalize="none"
          />

          <FieldLabel>Téléphone (support)</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            value={phone}
            onChangeText={setPhone}
            placeholder="+224 6XX XX XX XX"
            placeholderTextColor={shell.pageKicker}
            keyboardType="phone-pad"
          />

          <FieldLabel>Instagram</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={instagramUrl} onChangeText={setInstagramUrl} placeholder="https://instagram.com/..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <FieldLabel>Facebook</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={facebookUrl} onChangeText={setFacebookUrl} placeholder="https://facebook.com/..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <GalleryUploadField
            label="Galerie photos"
            values={galleryImages}
            onChange={setGalleryImages}
            shell={shell}
          />

          {isAdminMode ? (
            <>
              <FieldLabel>Partenariat</FieldLabel>
              <View style={styles.catRow}>
                {(Object.keys(PARTNERSHIP_STATUS_LABELS) as ToolPartnershipStatus[]).map((status) => (
                  <FormSelectChip
                    key={status}
                    label={PARTNERSHIP_STATUS_LABELS[status]}
                    selected={partnershipStatus === status}
                    onPress={() => setPartnershipStatus(status)}
                    shell={shell}
                    variant="tool"
                  />
                ))}
              </View>

              <FieldLabel>Vérifié THE LOOP</FieldLabel>
              <View style={styles.catRow}>
                <FormSelectChip
                  label="Oui"
                  selected={isVerified}
                  onPress={() => setIsVerified(true)}
                  shell={shell}
                  variant="tool"
                />
                <FormSelectChip
                  label="Non"
                  selected={!isVerified}
                  onPress={() => setIsVerified(false)}
                  shell={shell}
                  variant="tool"
                />
              </View>
            </>
          ) : (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Partenariat : en attente de validation après soumission.
            </Text>
          )}
        </>
      ) : null}

      {type === 'spot' && !isToolForm ? (
        <>
          <FieldLabel>Types de lieu *</FieldLabel>
          <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
            Sélectionnez un ou plusieurs types.
          </Text>
          <View style={styles.catRowLg}>
            {spotCategories.map((cat) => (
              <FormSelectChip
                key={cat.id}
                label={cat.label}
                emoji={cat.emoji}
                selected={spotCategoryIds.includes(cat.id as LocationSubCategory)}
                onPress={() => setSpotCategoryIds(
                  toggleCategoryInList(spotCategoryIds, cat.id) as LocationSubCategory[],
                )}
                shell={shell}
                size="md"
                variant={chipVariant}
              />
            ))}
          </View>
          {spotCategories.length === 0 ? (
            <Text style={[styles.hint, { color: '#ef4444' }]}>Aucun type de lieu — vérifiez Supabase ou votre connexion.</Text>
          ) : null}

          <FieldLabel>Organisateur / exploitant (optionnel)</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={fieldAccent}
            value={organizerName}
            onChangeText={setOrganizerName}
            placeholder="Ex. Groupe L'Avenue"
            placeholderTextColor={shell.pageKicker}
          />

          <ContentLocationFields
            mode={locationMode}
            onModeChange={setLocationMode}
            value={venueAddress}
            onChange={handleVenueLocationChange}
            shell={shell}
            countryCode={countryCode}
            chipVariant={chipVariant}
            disabled={adminFormLocked}
          />

          <FieldLabel>Téléphone</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={phone} onChangeText={setPhone} placeholder="+224 6XX XX XX XX" placeholderTextColor={shell.pageKicker} keyboardType="phone-pad" />

          <FieldLabel>Site web</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={website} onChangeText={setWebsite} placeholder="https://..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <FieldLabel>Horaires</FieldLabel>
          <OpeningHoursEditor
            mode={hoursMode}
            slots={hoursSlots}
            onModeChange={(mode) => {
              setHoursTouched(true);
              setHoursMode(mode);
            }}
            onSlotsChange={(slots) => {
              setHoursTouched(true);
              setHoursSlots(slots);
            }}
            onFormattedChange={(label) => {
              setHoursTouched(true);
              setOpeningHours(label);
            }}
            shell={shell}
            accentColor={fieldAccent}
            chipVariant={isAdminMode ? 'admin' : 'primary'}
          />

          <View style={styles.freeRow}>
            <Text style={[styles.freeLabel, { color: shell.pageTitle }]}>Sur invitation</Text>
            <Switch
              value={isInvitationPrice}
              onValueChange={(value) => {
                setIsInvitationPrice(value);
                if (value) setPriceLabel('Sur invitation');
                else if (priceLabel.trim().toLowerCase() === 'sur invitation') setPriceLabel('');
              }}
              trackColor={{ false: shell.filterInactiveBorder, true: selectAccent }}
              thumbColor="#fff"
            />
          </View>

          {!isInvitationPrice ? (
            <>
              <FieldLabel>Fourchette de prix</FieldLabel>
              <FormTextInput shell={shell} accentColor={fieldAccent} value={priceLabel} onChangeText={setPriceLabel} placeholder="50k – 150k GNF" placeholderTextColor={shell.pageKicker} />
            </>
          ) : (
            <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
              Tarif affiché : Sur invitation
            </Text>
          )}

          <FieldLabel>Instagram</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={instagramUrl} onChangeText={setInstagramUrl} placeholder="https://instagram.com/..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <FieldLabel>Facebook</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={facebookUrl} onChangeText={setFacebookUrl} placeholder="https://facebook.com/..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <FieldLabel>Lien réservation / CTA</FieldLabel>
          <FormTextInput shell={shell} accentColor={fieldAccent} value={ctaUrl} onChangeText={setCtaUrl} placeholder="https://..." placeholderTextColor={shell.pageKicker} autoCapitalize="none" />

          <GalleryUploadField
            label="Galerie photos"
            values={galleryImages}
            onChange={setGalleryImages}
            shell={shell}
          />

          <ImageUploadField
            label="Image de couverture"
            value={coverImageUrl}
            onChange={setCoverImageUrl}
            shell={shell}
            folder="spots"
            cropAspect={[16, 9]}
            hint="Image principale du spot (carousel, carte, fiche) — 16:9."
          />
        </>
      ) : null}
      </View>

      <View style={styles.actionBar}>
        {!isAdminMode || !isEdit || adminActions?.canEdit ? (
          <Pressable
            style={[styles.save, { backgroundColor: isAdminMode ? ADMIN_THEME.accent : '#10b981' }]}
            onPress={() => void handleSave(false)}
            disabled={saving || formLoading}
          >
            <Text style={styles.saveText}>
              {saving
                ? 'Envoi…'
                : isAdminMode
                  ? isEdit
                    ? isLocalStagingDraft
                      ? 'Publier'
                      : 'Enregistrer'
                    : 'Publier'
                  : 'Soumettre à modération'}
            </Text>
          </Pressable>
        ) : null}

        {(!isEdit || (isAdminMode && isLocalStagingDraft)) && (!isAdminMode || adminActions?.canEdit) ? (
          <Pressable
            style={[styles.draft, { borderColor: shell.filterInactiveBorder }]}
            onPress={() => void handleSave(true)}
            disabled={saving || formLoading}
          >
            <Text style={[styles.draftText, { color: shell.pageTitle }]}>Enregistrer en brouillon</Text>
          </Pressable>
        ) : null}

        {canCancelPendingSubmission ? (
          <Pressable
            style={[styles.draft, { borderColor: '#fca5a5' }]}
            onPress={() => void handleCancelSubmission()}
            disabled={formLoading || saving}
          >
            <Text style={[styles.draftText, { color: '#dc2626' }]}>Annuler la soumission</Text>
          </Pressable>
        ) : null}

        {isEdit && (!isAdminMode || adminActions?.canDelete) && submissionStatus !== 'pending' ? (
          <Pressable style={styles.delete} onPress={() => void handleDelete()} disabled={formLoading}>
            <Text style={styles.deleteText}>Supprimer</Text>
          </Pressable>
        ) : null}
      </View>

      <PartnerPicker
        visible={ownerPickerOpen}
        title="Choisir le gestionnaire"
        options={[
          { id: TEAM_CONTENT_OWNER_ID, label: 'THE LOOP (équipe)', subtitle: 'Reprendre la gestion admin' },
          ...partnerAccounts.map((p) => ({
            id: p.id,
            label: partnerAccountDisplayName(p),
            subtitle: p.company && p.company !== p.name ? p.name : undefined,
          })),
        ]}
        selectedId={
          contentOwner?.ownerUserId
            ? `user:${contentOwner.ownerUserId}`
            : TEAM_CONTENT_OWNER_ID
        }
        onSelect={(selectedId) => {
          setOwnerPickerOpen(false);
          void onReassignOwner(selectedId);
        }}
        onClose={() => setOwnerPickerOpen(false)}
        shell={shell}
      />
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  catRowLg: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  hint: { fontSize: 12, marginBottom: 10, fontStyle: 'italic' },
  loadingHint: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  readOnlyBanner: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  readOnlyBannerText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  readOnlyForm: { opacity: 0.55 },
  freeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 },
  freeLabel: { fontSize: 14, fontWeight: '600' },
  actionBar: { marginTop: 16, gap: 12 },
  save: { paddingVertical: 16, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontWeight: '700', color: '#fff', fontSize: 15 },
  draft: { paddingVertical: 16, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  draftText: { fontWeight: '700', fontSize: 15 },
  delete: { paddingVertical: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
  ownerCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14, gap: 8 },
  ownerTitle: { fontSize: 13, fontWeight: '800' },
  ownerBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  speakerCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 8 },
  speakerRemove: { alignSelf: 'flex-start', paddingVertical: 4 },
  addSpeakerBtn: { borderWidth: 1, borderRadius: 10, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
});
