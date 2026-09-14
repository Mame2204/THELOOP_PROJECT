import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'screens');

const patches = [
  ['AdminContentCountriesScreen.tsx', 'content_countries'],
  ['AdminCategoriesScreen.tsx', 'categories'],
  ['AdminSpotStarsScreen.tsx', 'spot_stars'],
  ['AdminFeaturedScreen.tsx', 'featured'],
  ['AdminInsightsScreen.tsx', 'insights'],
  ['AdminPartnershipsScreen.tsx', 'partnerships'],
  ['AdminPartnerMilestonesScreen.tsx', 'partner_milestones'],
  ['AdminSuggestionsScreen.tsx', 'suggestions'],
  ['AdminAutomationJobsScreen.tsx', 'automation'],
  ['AdminLegalScreen.tsx', 'legal'],
  ['AdminPrimeBenefitsScreen.tsx', 'prime_benefits'],
  ['AdminBenefitDrawScreen.tsx', 'benefit_draw'],
  ['AdminNotificationsScreen.tsx', 'notifications'],
  ['AdminModerationScreen.tsx', 'moderation'],
  ['AdminLoopContentScreen.tsx', 'content'],
];

const importBlock = `import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';`;

function guardBlock(perm) {
  return `  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('${perm}');

  if (!allowed) {
    if (isLoading) return null;
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }
`;
}

for (const [file, perm] of patches) {
  const fp = path.join(root, file);
  let src = fs.readFileSync(fp, 'utf8');
  if (src.includes('useAdminModuleAccess')) {
    console.log('skip', file);
    continue;
  }
  if (!src.includes("import { useMemberTheme }")) {
    console.log('no theme', file);
    continue;
  }
  src = src.replace(
    "import { useMemberTheme } from '@/hooks/useMemberTheme';",
    `import { useMemberTheme } from '@/hooks/useMemberTheme';\n${importBlock}`,
  );
  if (!src.includes('  const { shell } = useMemberTheme();')) {
    console.log('no shell', file);
    continue;
  }
  src = src.replace(
    '  const { shell } = useMemberTheme();',
    `  const { shell } = useMemberTheme();\n${guardBlock(perm)}`,
  );
  src = src.replace(/  if \(role !== 'ADMIN'\) \{[\s\S]*?\n  \}\n\n(?=  return)/, '');
  fs.writeFileSync(fp, src);
  console.log('patched', file);
}
