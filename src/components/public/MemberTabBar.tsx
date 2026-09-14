interface MemberTabBarProps {
  active: 'favoris' | 'profil';
  onChange: (tab: 'favoris' | 'profil') => void;
}

export function MemberTabBar({ active, onChange }: MemberTabBarProps) {
  const tabs = [
    { id: 'favoris' as const, label: 'Mes Favoris' },
    { id: 'profil' as const, label: 'Mon Profil' },
  ];

  return (
    <div className="flex rounded-xl border border-neutral-300 bg-white p-1 shadow-sm">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
              isActive
                ? 'bg-loop-black text-white shadow-sm'
                : 'text-neutral-600 hover:text-loop-black'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
