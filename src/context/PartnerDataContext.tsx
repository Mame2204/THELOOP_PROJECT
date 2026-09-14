import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useState,

  type ReactNode,

} from 'react';

import { createId, loadPartnerWorkspace, savePartnerWorkspace } from '@/lib/partner-store';

import {

  deleteStagingEvent,

  deleteStagingLocation,

  enqueueStagingEvent,

  enqueueStagingLocation,

  getPartnerStagingItems,

  getPlatformCategories,

  requestContentRetraction,

  resubmitStagingEvent,

  resubmitStagingLocation,

  updateStagingEvent,

  updateStagingLocation,

} from '@/lib/admin-store';

import type { PlatformCategory } from '@/types/admin';

import { useAuthContext } from '@/context/AuthContext';

import type {

  PartnerAddress,

  PartnerEvent,

  PartnerWorkspace,

} from '@/types/partner';



interface PartnerDataContextValue {

  workspace: PartnerWorkspace;

  platformCategories: PlatformCategory[];

  refresh: () => void;

  addAddress: (data: Omit<PartnerAddress, 'id' | 'status' | 'stagingId'>) => void;

  updatePendingAddress: (addressId: string, data: Pick<PartnerAddress, 'name' | 'address' | 'city'>) => void;

  removeAddress: (id: string) => void;

  addEvent: (data: Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>) => void;

  updatePendingEvent: (eventId: string, data: Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>) => void;

  removeEvent: (id: string) => void;

  resubmitAddress: (addressId: string, data: Pick<PartnerAddress, 'name' | 'address' | 'city'>) => void;

  resubmitEvent: (eventId: string, data: Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>) => void;

  requestRetraction: (contentType: 'event' | 'location', stagingId: string, contentName: string, reason: string) => void;

  getAddressStaging: (addressId: string) => ReturnType<typeof getPartnerStagingItems>['locations'][number] | undefined;

  getEventStaging: (eventId: string) => ReturnType<typeof getPartnerStagingItems>['events'][number] | undefined;

}



const PartnerDataContext = createContext<PartnerDataContextValue | null>(null);



function normalizeWorkspace(workspace: PartnerWorkspace): PartnerWorkspace {

  return {

    ...workspace,

    addresses: workspace.addresses.map((item) => ({

      ...item,

      status: item.status ?? 'pending',

      stagingId: item.stagingId ?? null,

    })),

    events: workspace.events.map((item) => ({

      ...item,

      status: item.status ?? 'pending',

      stagingId: item.stagingId ?? null,

    })),

    categories: workspace.categories ?? [],

  };

}



export function PartnerDataProvider({ children }: { children: ReactNode }) {

  const { user, role } = useAuthContext();

  const partnerId = role === 'PARTNER' && user ? user.id : null;

  const [workspace, setWorkspace] = useState<PartnerWorkspace>({ addresses: [], events: [], categories: [] });

  const [platformCategories, setPlatformCategories] = useState<PlatformCategory[]>([]);

  const [tick, setTick] = useState(0);



  const refresh = useCallback(() => {

    setPlatformCategories(getPlatformCategories());

    setTick((n) => n + 1);

  }, []);



  useEffect(() => {

    if (!partnerId) {

      setWorkspace({ addresses: [], events: [], categories: [] });

      return;

    }

    setWorkspace(normalizeWorkspace(loadPartnerWorkspace(partnerId)));

  }, [partnerId, tick]);



  useEffect(() => {

    setPlatformCategories(getPlatformCategories());

    const handler = () => refresh();

    window.addEventListener('loop-admin-store-changed', handler);

    return () => window.removeEventListener('loop-admin-store-changed', handler);

  }, [refresh]);



  const persist = useCallback(

    (updater: (prev: PartnerWorkspace) => PartnerWorkspace) => {

      if (!partnerId) return;

      setWorkspace((prev) => {

        const next = updater(prev);

        savePartnerWorkspace(partnerId, next);

        return next;

      });

    },

    [partnerId],

  );



  const addAddress = useCallback(

    (data: Omit<PartnerAddress, 'id' | 'status' | 'stagingId'>) => {

      if (!partnerId || !user) return;

      const addressId = createId('addr');

      const staging = enqueueStagingLocation({

        partnerId,

        partnerName: user.company ?? user.fullName ?? 'Partenaire',

        workspaceRefId: addressId,

        name: data.name,

        address: data.address,

        city: data.city,

      });

      persist((prev) => ({

        ...prev,

        addresses: [...prev.addresses, { ...data, id: addressId, status: 'pending', stagingId: staging.id }],

      }));

    },

    [persist, partnerId, user],

  );



  const updatePendingAddress = useCallback(

    (addressId: string, data: Pick<PartnerAddress, 'name' | 'address' | 'city'>) => {

      const address = workspace.addresses.find((item) => item.id === addressId);

      if (!address?.stagingId) return;

      const staging = getPartnerStagingItems(partnerId!).locations.find((l) => l.id === address.stagingId);

      if (!staging || staging.status !== 'pending') return;

      updateStagingLocation(address.stagingId, data);

      persist((prev) => ({

        ...prev,

        addresses: prev.addresses.map((item) => (item.id === addressId ? { ...item, ...data } : item)),

      }));

      refresh();

    },

    [workspace.addresses, partnerId, persist, refresh],

  );



  const removeAddress = useCallback(

    (id: string) => {

      const address = workspace.addresses.find((a) => a.id === id);

      if (address?.stagingId) {

        const staging = getPartnerStagingItems(partnerId!).locations.find((l) => l.id === address.stagingId);

        if (staging?.status === 'approved') return;

        deleteStagingLocation(address.stagingId);

      }

      persist((prev) => ({

        ...prev,

        addresses: prev.addresses.filter((a) => a.id !== id),

        events: prev.events.filter((e) => e.addressId !== id),

      }));

      refresh();

    },

    [workspace.addresses, partnerId, persist, refresh],

  );



  const addEvent = useCallback(

    (data: Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>) => {

      if (!partnerId || !user) return;

      const eventId = createId('pevt');

      const staging = enqueueStagingEvent({

        partnerId,

        partnerName: user.company ?? user.fullName ?? 'Partenaire',

        workspaceRefId: eventId,

        title: data.title,

        description: data.description,

        program: data.program,

        category: data.category,

        startsAt: data.startsAt,

        endsAt: data.endsAt,

        venueName: data.venueName,

        venueAddress: data.venueAddress,

        entryPrice: data.entryPrice,

        currency: data.currency,

        speakers: data.speakers,

      });

      persist((prev) => ({

        ...prev,

        events: [

          { ...data, id: eventId, status: 'pending', stagingId: staging.id, createdAt: new Date().toISOString() },

          ...prev.events,

        ],

      }));

    },

    [persist, partnerId, user],

  );



  const updatePendingEvent = useCallback(

    (eventId: string, data: Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>) => {

      const event = workspace.events.find((item) => item.id === eventId);

      if (!event?.stagingId || !partnerId) return;

      const staging = getPartnerStagingItems(partnerId).events.find((e) => e.id === event.stagingId);

      if (!staging || staging.status !== 'pending') return;

      updateStagingEvent(event.stagingId, {

        title: data.title,

        description: data.description,

        program: data.program,

        category: data.category,

        startsAt: data.startsAt,

        endsAt: data.endsAt,

        venueName: data.venueName,

        venueAddress: data.venueAddress,

        entryPrice: data.entryPrice,

        currency: data.currency,

        speakers: data.speakers,

      });

      persist((prev) => ({

        ...prev,

        events: prev.events.map((item) => (item.id === eventId ? { ...item, ...data } : item)),

      }));

      refresh();

    },

    [workspace.events, partnerId, persist, refresh],

  );



  const removeEvent = useCallback(

    (id: string) => {

      const event = workspace.events.find((e) => e.id === id);

      if (event?.stagingId && partnerId) {

        const staging = getPartnerStagingItems(partnerId).events.find((e) => e.id === event.stagingId);

        if (staging?.status === 'approved') return;

        deleteStagingEvent(event.stagingId);

      }

      persist((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== id) }));

      refresh();

    },

    [workspace.events, partnerId, persist, refresh],

  );



  const resubmitAddress = useCallback(

    (addressId: string, data: Pick<PartnerAddress, 'name' | 'address' | 'city'>) => {

      const address = workspace.addresses.find((item) => item.id === addressId);

      if (!address?.stagingId) return;

      resubmitStagingLocation(address.stagingId, data);

      persist((prev) => ({

        ...prev,

        addresses: prev.addresses.map((item) =>

          item.id === addressId ? { ...item, ...data, status: 'pending' } : item,

        ),

      }));

      refresh();

    },

    [workspace.addresses, persist, refresh],

  );



  const resubmitEvent = useCallback(

    (eventId: string, data: Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>) => {

      const event = workspace.events.find((item) => item.id === eventId);

      if (!event?.stagingId) return;

      resubmitStagingEvent(event.stagingId, {

        title: data.title,

        description: data.description,

        program: data.program,

        category: data.category,

        startsAt: data.startsAt,

        endsAt: data.endsAt,

        venueName: data.venueName,

        venueAddress: data.venueAddress,

        entryPrice: data.entryPrice,

        currency: data.currency,

        speakers: data.speakers,

      });

      persist((prev) => ({

        ...prev,

        events: prev.events.map((item) =>

          item.id === eventId ? { ...item, ...data, status: 'pending' } : item,

        ),

      }));

      refresh();

    },

    [workspace.events, persist, refresh],

  );



  const requestRetraction = useCallback(

    (contentType: 'event' | 'location', stagingId: string, contentName: string, reason: string) => {

      if (!partnerId || !user || !reason.trim()) return;

      requestContentRetraction({

        partnerId,

        partnerName: user.company ?? user.fullName ?? 'Partenaire',

        contentType,

        stagingId,

        contentName,

        reason: reason.trim(),

      });

      refresh();

    },

    [partnerId, user, refresh],

  );



  const getAddressStaging = useCallback(

    (addressId: string) => {

      if (!partnerId) return undefined;

      return getPartnerStagingItems(partnerId).locations.find((item) => item.workspaceRefId === addressId);

    },

    [partnerId, tick],

  );



  const getEventStaging = useCallback(

    (eventId: string) => {

      if (!partnerId) return undefined;

      return getPartnerStagingItems(partnerId).events.find((item) => item.workspaceRefId === eventId);

    },

    [partnerId, tick],

  );



  const value = useMemo(

    () => ({

      workspace,

      platformCategories,

      refresh,

      addAddress,

      updatePendingAddress,

      removeAddress,

      addEvent,

      updatePendingEvent,

      removeEvent,

      resubmitAddress,

      resubmitEvent,

      requestRetraction,

      getAddressStaging,

      getEventStaging,

    }),

    [

      workspace,

      platformCategories,

      refresh,

      addAddress,

      updatePendingAddress,

      removeAddress,

      addEvent,

      updatePendingEvent,

      removeEvent,

      resubmitAddress,

      resubmitEvent,

      requestRetraction,

      getAddressStaging,

      getEventStaging,

    ],

  );



  return <PartnerDataContext.Provider value={value}>{children}</PartnerDataContext.Provider>;

}



export function usePartnerDataContext() {

  const ctx = useContext(PartnerDataContext);

  if (!ctx) throw new Error('usePartnerDataContext must be used within PartnerDataProvider');

  return ctx;

}


