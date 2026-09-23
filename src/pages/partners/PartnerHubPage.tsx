import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PartnerHubTabs } from '@/components/partners/PartnerHubTabs';
import { PartnerAddressesSection } from '@/components/partners/PartnerAddressesSection';
import { PartnerEventsSection } from '@/components/partners/PartnerEventsSection';
import { PartnerCategoriesSection } from '@/components/partners/PartnerCategoriesSection';
import { useAuth } from '@/hooks/useAuth';
import type { PartnerHubTab } from '@/types/partner';

export function PartnerHubPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PartnerHubTab>('addresses');

  return (
    <div className="min-h-full pb-4">
      <PublicHeader />

      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Espace Pro</p>
            <h1 className="mt-1 text-2xl font-bold text-loop-black">Espace Partenaire</h1>
            <p className="mt-1 text-sm text-neutral-600">{user?.company ?? user?.fullName}</p>
          </div>
          <span className="rounded-full border border-loop-gold bg-loop-gold/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-loop-black">
            Pro
          </span>
        </div>

        <div className="mt-5">
          <PartnerHubTabs active={tab} onChange={setTab} />
        </div>

        <div className="mt-5">
          {tab === 'addresses' && <PartnerAddressesSection />}
          {tab === 'events' && <PartnerEventsSection />}
          {tab === 'categories' && <PartnerCategoriesSection />}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Besoin d&apos;aide ?{' '}
          <Link to="/profil" className="font-semibold text-loop-gold hover:underline">
            Mon profil
          </Link>
        </p>
      </div>
    </div>
  );
}
