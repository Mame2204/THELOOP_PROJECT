import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Event, HeroBanner, PartnerToken } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';
import type { AdminDirectPartnerInput, PlatformCategory, StagingEventItem, StagingLocationItem } from '@/types/admin';
import type { PrimeInvitation } from '@/types/prime';
import {
  addHeroBannerRef,
  approvePartnershipApplication,
  approveStagingEvent,
  approveStagingLocation,
  createDirectPartner,
  createPartnerToken,
  createPlatformCategory,
  createPrimeInvitation,
  deletePlatformCategory,
  extendPrimeSubscription,
  extendPrimeSubscriptionMonths,
  reactivatePrimeSubscription,
  setPrimeExpiration,
  suspendPrimeSubscription,
  updatePrimeInvitation,
  generatePartnerTokenCode,
  generatePrimeInviteCode,
  getPrimeActivationUrl,
  getPrimeQrCodeUrl,
  loadAdminStore,
  rejectPartnershipApplication,
  rejectStagingEvent,
  rejectStagingLocation,
  removeHeroBanner,
  resubmitStagingEvent,
  resubmitStagingLocation,
  saveAdminStore,
  updateStagingEvent,
  updateStagingLocation,
  updatePlatformCategory,
  updateManagedUser,
  type AdminStore,
} from '@/lib/admin-store';

interface AdminDataContextValue {
  store: AdminStore;
  refresh: () => void;
  toggleHeroBanner: (id: string) => void;
  addHeroBannerRef: (targetType: HeroBanner['targetType'], targetId: string) => HeroBanner | null;
  removeHeroBanner: (id: string) => void;
  approveApplication: (id: string, tokenCode: string, expiresAt: string) => PartnerToken | null;
  rejectApplication: (id: string, reason: string) => void;
  approveEvent: (id: string) => Event | null;
  rejectEvent: (id: string, reason: string) => void;
  updateEvent: (id: string, data: Partial<StagingEventItem>) => StagingEventItem | null;
  resubmitEvent: (id: string, data: Partial<StagingEventItem>) => StagingEventItem | null;
  approveLocation: (id: string) => HomeLocation | null;
  rejectLocation: (id: string, reason: string) => void;
  updateLocation: (id: string, data: Partial<StagingLocationItem>) => StagingLocationItem | null;
  resubmitLocation: (id: string, data: Partial<StagingLocationItem>) => StagingLocationItem | null;
  generateToken: (partnerName: string, expiresAt: string) => PartnerToken;
  createPartnerDirect: (input: AdminDirectPartnerInput) => PartnerToken;
  createPrimeInvite: (memberName: string, email?: string | null, initialMonths?: number) => PrimeInvitation;
  extendPrime: (id: string) => void;
  extendPrimeMonths: (id: string, months?: number) => void;
  setPrimeExpiration: (id: string, expiresAt: string) => void;
  suspendPrime: (id: string) => void;
  reactivatePrime: (id: string) => void;
  updatePrime: (id: string, memberName: string) => void;
  createCategory: (data: Pick<PlatformCategory, 'label' | 'emoji' | 'eventCategory'>) => void;
  updateCategory: (id: string, data: Partial<Pick<PlatformCategory, 'label' | 'emoji' | 'eventCategory'>>) => void;
  deleteCategory: (id: string) => void;
  updateUser: (id: string, data: Parameters<typeof updateManagedUser>[1]) => void;
  activeHeroBanners: HeroBanner[];
  pendingApplications: AdminStore['applications'];
  pendingStagingEvents: AdminStore['stagingEvents'];
  pendingStagingLocations: AdminStore['stagingLocations'];
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<AdminStore>(() => loadAdminStore());

  const refresh = useCallback(() => {
    setStore(loadAdminStore());
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('loop-admin-store-changed', handler);
    return () => window.removeEventListener('loop-admin-store-changed', handler);
  }, [refresh]);

  const updateStore = useCallback((updater: (prev: AdminStore) => AdminStore) => {
    setStore((prev) => {
      const next = updater(prev);
      saveAdminStore(next);
      return next;
    });
  }, []);

  const toggleHeroBanner = useCallback(
    (id: string) => {
      updateStore((prev) => ({
        ...prev,
        heroBanners: prev.heroBanners.map((b) =>
          b.id === id ? { ...b, isActive: !b.isActive, updatedAt: new Date().toISOString() } : b,
        ),
      }));
    },
    [updateStore],
  );

  const addHeroBannerRefFn = useCallback(
    (targetType: HeroBanner['targetType'], targetId: string) => {
      const banner = addHeroBannerRef(targetType, targetId);
      refresh();
      return banner;
    },
    [refresh],
  );

  const removeHeroBannerFn = useCallback(
    (id: string) => {
      removeHeroBanner(id);
      refresh();
    },
    [refresh],
  );

  const approveApplication = useCallback(
    (id: string, tokenCode: string, expiresAt: string) => {
      const token = approvePartnershipApplication(id, tokenCode, expiresAt);
      refresh();
      return token;
    },
    [refresh],
  );

  const rejectApplication = useCallback(
    (id: string, reason: string) => {
      rejectPartnershipApplication(id, reason);
      refresh();
    },
    [refresh],
  );

  const approveEvent = useCallback(
    (id: string) => {
      const event = approveStagingEvent(id);
      refresh();
      return event;
    },
    [refresh],
  );

  const rejectEvent = useCallback(
    (id: string, reason: string) => {
      rejectStagingEvent(id, reason);
      refresh();
    },
    [refresh],
  );

  const updateEvent = useCallback(
    (id: string, data: Partial<StagingEventItem>) => {
      const item = updateStagingEvent(id, data);
      refresh();
      return item;
    },
    [refresh],
  );

  const resubmitEvent = useCallback(
    (id: string, data: Partial<StagingEventItem>) => {
      const item = resubmitStagingEvent(id, data);
      refresh();
      return item;
    },
    [refresh],
  );

  const approveLocation = useCallback(
    (id: string) => {
      const location = approveStagingLocation(id);
      refresh();
      return location;
    },
    [refresh],
  );

  const rejectLocation = useCallback(
    (id: string, reason: string) => {
      rejectStagingLocation(id, reason);
      refresh();
    },
    [refresh],
  );

  const updateLocation = useCallback(
    (id: string, data: Partial<StagingLocationItem>) => {
      const item = updateStagingLocation(id, data);
      refresh();
      return item;
    },
    [refresh],
  );

  const resubmitLocation = useCallback(
    (id: string, data: Partial<StagingLocationItem>) => {
      const item = resubmitStagingLocation(id, data);
      refresh();
      return item;
    },
    [refresh],
  );

  const generateToken = useCallback(
    (partnerName: string, expiresAt: string) => {
      const token = createPartnerToken(partnerName, expiresAt);
      refresh();
      return token;
    },
    [refresh],
  );

  const createPartnerDirect = useCallback(
    (input: AdminDirectPartnerInput) => {
      const token = createDirectPartner(input);
      refresh();
      return token;
    },
    [refresh],
  );

  const createPrimeInvite = useCallback(
    (memberName: string, email: string | null = null, initialMonths = 1) => {
      const invitation = createPrimeInvitation(memberName, email, initialMonths);
      refresh();
      return invitation;
    },
    [refresh],
  );

  const extendPrime = useCallback(
    (id: string) => {
      extendPrimeSubscription(id);
      refresh();
    },
    [refresh],
  );

  const extendPrimeMonths = useCallback(
    (id: string, months = 1) => {
      extendPrimeSubscriptionMonths(id, months);
      refresh();
    },
    [refresh],
  );

  const setPrimeExpirationFn = useCallback(
    (id: string, expiresAt: string) => {
      setPrimeExpiration(id, expiresAt);
      refresh();
    },
    [refresh],
  );

  const suspendPrime = useCallback(
    (id: string) => {
      suspendPrimeSubscription(id);
      refresh();
    },
    [refresh],
  );

  const reactivatePrime = useCallback(
    (id: string) => {
      reactivatePrimeSubscription(id);
      refresh();
    },
    [refresh],
  );

  const updatePrime = useCallback(
    (id: string, memberName: string) => {
      updatePrimeInvitation(id, { memberName });
      refresh();
    },
    [refresh],
  );

  const createCategory = useCallback(
    (data: Pick<PlatformCategory, 'label' | 'emoji' | 'eventCategory'>) => {
      createPlatformCategory(data);
      refresh();
    },
    [refresh],
  );

  const updateCategory = useCallback(
    (id: string, data: Partial<Pick<PlatformCategory, 'label' | 'emoji' | 'eventCategory'>>) => {
      updatePlatformCategory(id, data);
      refresh();
    },
    [refresh],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      deletePlatformCategory(id);
      refresh();
    },
    [refresh],
  );

  const updateUser = useCallback(
    (id: string, data: Parameters<typeof updateManagedUser>[1]) => {
      updateManagedUser(id, data);
      refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      store,
      refresh,
      toggleHeroBanner,
      addHeroBannerRef: addHeroBannerRefFn,
      removeHeroBanner: removeHeroBannerFn,
      approveApplication,
      rejectApplication,
      approveEvent,
      rejectEvent,
      updateEvent,
      resubmitEvent,
      approveLocation,
      rejectLocation,
      updateLocation,
      resubmitLocation,
      generateToken,
      createPartnerDirect,
      createPrimeInvite,
      extendPrime,
      extendPrimeMonths,
      setPrimeExpiration: setPrimeExpirationFn,
      suspendPrime,
      reactivatePrime,
      updatePrime,
      createCategory,
      updateCategory,
      deleteCategory,
      updateUser,
      activeHeroBanners: store.heroBanners.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
      pendingApplications: store.applications.filter((a) => a.status === 'pending'),
      pendingStagingEvents: store.stagingEvents.filter((e) => e.status === 'pending'),
      pendingStagingLocations: store.stagingLocations.filter((l) => l.status === 'pending'),
    }),
    [
      store,
      refresh,
      toggleHeroBanner,
      addHeroBannerRefFn,
      removeHeroBannerFn,
      approveApplication,
      rejectApplication,
      approveEvent,
      rejectEvent,
      updateEvent,
      resubmitEvent,
      approveLocation,
      rejectLocation,
      updateLocation,
      resubmitLocation,
      generateToken,
      createPartnerDirect,
      createPrimeInvite,
      extendPrime,
      extendPrimeMonths,
      setPrimeExpirationFn,
      suspendPrime,
      reactivatePrime,
      updatePrime,
      createCategory,
      updateCategory,
      deleteCategory,
      updateUser,
    ],
  );

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminDataContext() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error('useAdminDataContext must be used within AdminDataProvider');
  return ctx;
}

export { generatePartnerTokenCode, generatePrimeInviteCode, getPrimeActivationUrl, getPrimeQrCodeUrl };
