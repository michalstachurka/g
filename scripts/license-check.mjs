/**
 * Kontrola licencji zależności (CLAUDE.md 4.1 pkt 7). Skanuje zainstalowane
 * pakiety w node_modules/.pnpm i zawodzi build, jeżeli w drzewie pojawi się
 * licencja spoza listy dozwolonych bez jawnego wyjątku.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'CC0-1.0',
  'Unlicense', 'BlueOak-1.0.0', 'Python-2.0', 'CC-BY-4.0', 'MIT-0', 'MPL-2.0', 'WTFPL',
]);
// Wymagają ADR przed użyciem w produkcie komercyjnym.
const REVIEW = [/GPL/i, /AGPL/i, /LGPL/i, /SSPL/i, /BUSL/i, /CC-BY-NC/i, /custom/i];
// Jawne wyjątki (pakiet -> uzasadnienie). Każdy wpis udokumentowany w LICENSE_AUDIT.
const EXCEPTIONS = {
  // Pole license puste w package.json, ale pakiet zawiera plik LICENSE z treścią MIT.
  'webgl-constants': 'MIT wg dołączonego pliku LICENSE (autor T. van Scherpenzeel).',
  // libvips linkowany dynamicznie przez sharp (Apache-2.0), używany przez optymalizację
  // obrazów Next.js. LGPL-3.0 dopuszcza linkowanie dynamiczne - ADR-0007.
  '@img/sharp-libvips-linux-x64': 'LGPL-3.0, linkowanie dynamiczne, ADR-0007.',
  '@img/sharp-libvips-linuxmusl-x64': 'LGPL-3.0, linkowanie dynamiczne, ADR-0007.',
};

const pnpmDir = join(process.cwd(), 'node_modules/.pnpm');
if (!existsSync(pnpmDir)) {
  console.error('Brak node_modules/.pnpm - uruchom pnpm install.');
  process.exit(1);
}

function licenseOf(pkgJson) {
  if (typeof pkgJson.license === 'string') return pkgJson.license;
  if (pkgJson.license?.type) return pkgJson.license.type;
  if (Array.isArray(pkgJson.licenses)) return pkgJson.licenses.map((l) => l.type).join(' OR ');
  return null;
}

function normalize(expr) {
  return expr.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/i).map((s) => s.trim());
}

const problems = [];
const review = [];
const summary = new Map();

for (const entry of readdirSync(pnpmDir)) {
  const nmDir = join(pnpmDir, entry, 'node_modules');
  if (!existsSync(nmDir)) continue;
  for (const pkgName of readdirSync(nmDir)) {
    const scoped = pkgName.startsWith('@');
    const dirs = scoped ? readdirSync(join(nmDir, pkgName)).map((s) => `${pkgName}/${s}`) : [pkgName];
    for (const dir of dirs) {
      const pkgPath = join(nmDir, dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      } catch {
        continue;
      }
      const license = licenseOf(pkg) ?? 'UNKNOWN';
      const name = pkg.name ?? dir;
      summary.set(license, (summary.get(license) ?? 0) + 1);
      if (EXCEPTIONS[name]) continue;
      const parts = normalize(license);
      const allowed = parts.some((p) => ALLOWED.has(p));
      if (allowed) continue;
      if (REVIEW.some((re) => re.test(license))) {
        review.push(`${name}@${pkg.version}: ${license}`);
      } else {
        problems.push(`${name}@${pkg.version}: ${license}`);
      }
    }
  }
}

console.log('Podsumowanie licencji:');
for (const [license, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(4)}  ${license}`);
}

if (review.length > 0) {
  console.warn('\nWymagają decyzji/ADR (GPL/AGPL/LGPL/niestandardowe):');
  for (const item of [...new Set(review)]) console.warn('  ! ' + item);
}
if (problems.length > 0) {
  console.error('\nLicencje spoza listy dozwolonych (build zablokowany):');
  for (const item of [...new Set(problems)].slice(0, 40)) console.error('  X ' + item);
  process.exit(1);
}
console.log('\nKontrola licencji OK - brak licencji spoza listy dozwolonych.');
