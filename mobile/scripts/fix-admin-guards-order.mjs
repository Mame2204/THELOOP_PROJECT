import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'screens');

const files = fs.readdirSync(root).filter((f) => f.startsWith('Admin') && f.endsWith('.tsx'));

const guardIfBlock =
  /  if \(!allowed\) \{\r?\n    if \(isLoading\) return null;\r?\n    return <AdminModuleDenied shell=\{shell\} moduleLabel=\{permissionLabel\} onBack=\{\(\) => navigation\.goBack\(\)\} \/>;\r?\n  \}\r?\n\r?\n/;

const insertGuard =
  '  if (!allowed) {\r\n    if (isLoading) return null;\r\n    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;\r\n  }\r\n';

for (const file of files) {
  const fp = path.join(root, file);
  let src = fs.readFileSync(fp, 'utf8');
  if (!src.includes('useAdminModuleAccess')) continue;

  const accessIdx = src.indexOf('useAdminModuleAccess');
  const firstUseState = src.indexOf('useState', accessIdx);
  const guardIdx = src.indexOf('if (!allowed)', accessIdx);
  if (guardIdx < 0) continue;
  if (firstUseState < 0 || guardIdx > firstUseState) {
    console.log('ok order', file);
    continue;
  }

  src = src.replace(guardIfBlock, '');
  if (src.includes('if (!allowed)')) {
    console.log('guard remains?', file);
    continue;
  }

  const marker = src.search(/\r?\n  return \(\r?\n    <ScrollView/);
  if (marker < 0) {
    console.log('no scroll marker', file);
    continue;
  }

  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const guard = insertGuard.replace(/\r\n/g, nl);
  src = src.slice(0, marker) + nl + guard + src.slice(marker);
  fs.writeFileSync(fp, src);
  console.log('fixed', file);
}
