import fs from 'fs';
import path from 'path';

const semver = require('semver') as { satisfies: (version: string, range: string) => boolean };

/**
 * Un module natif Expo d'un autre SDK (ex. expo-font 57 sur SDK 54) compile
 * mais plante Android au lancement (NoSuchMethodError dans ModuleRegistry).
 */
describe('modules natifs Expo alignés sur le SDK', () => {
  const nodeModules = path.resolve(__dirname, '../../../node_modules');
  const expected = JSON.parse(
    fs.readFileSync(path.join(nodeModules, 'expo/bundledNativeModules.json'), 'utf8'),
  ) as Record<string, string>;

  it('chaque module installé respecte la version attendue par expo', () => {
    const mismatches: string[] = [];
    for (const [name, range] of Object.entries(expected)) {
      const pkgPath = path.join(nodeModules, name, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const { version } = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };
      if (!semver.satisfies(version, range)) mismatches.push(`${name}@${version} (attendu ${range})`);
    }
    expect(mismatches).toEqual([]);
  });
});
