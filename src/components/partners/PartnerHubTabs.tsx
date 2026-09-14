import type { PartnerHubTab } from '@/types/partner';

interface PartnerHubTabsProps {
  active: PartnerHubTab;
  onChange: (tab: PartnerHubTab) => void;
}

const TABS: { id: PartnerHubTab; label: string }[] = [
  { id: 'addresses', label: 'Mes Adresses' },
  { id: 'events', label: 'Mes Événements' },
  { id: 'categories', label: 'Catégories' },
];

export function PartnerHubTabs({ active, onChange }: PartnerHubTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all ${
              isActive
                ? 'bg-loop-black text-white shadow-sm'
                : 'border border-neutral-300 bg-white text-neutral-600 hover:border-loop-black'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
