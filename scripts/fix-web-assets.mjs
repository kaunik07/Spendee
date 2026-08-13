// Relocate exported web assets out of any `node_modules` path segment.
//
// Why: Expo's web export emits vendored assets — every @expo/vector-icons
// font, the calendar arrows, navigation icons — under
// `dist/assets/node_modules/...`. Cloudflare's asset upload skips anything
// beneath a `node_modules` directory (hardcoded ignore list, see
// cloudflare/workers-sdk#3615, closed as not planned), so all 49 of those
// files silently never ship. The app then boots with no icon fonts and
// renders tofu boxes for every icon.
//
// This is especially nasty combined with the SPA `_redirects` fallback: a
// request for a missing font matches `/*` and returns index.html with a 200,
// so it looks fine to any status-code check — the browser just fails to parse
// HTML as a typeface.
//
// Fix: move `assets/node_modules/**` to `assets/vendor/**` and rewrite the
// matching string literals in the JS bundle. The paths appear verbatim in the
// bundle, so this is a deterministic find/replace, not a heuristic.
//
// Runs after `expo export -p web` (see the `build:web` npm script) so both
// wrangler CLI deploys and Cloudflare's Git-integration builds are fixed.
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || 'dist';
const FROM = 'assets/node_modules';
const TO = 'assets/vendor';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const fromDir = join(DIST, FROM);
const toDir = join(DIST, TO);

if (!existsSync(DIST)) {
  console.error(`✗ ${DIST}/ not found — run \`expo export -p web\` first.`);
  process.exit(1);
}

if (!existsSync(fromDir)) {
  // Already relocated (idempotent re-run), or a future Expo version stopped
  // nesting assets under node_modules. Verify the rewrite isn't half-done.
  const stale = walk(DIST)
    .filter((f) => f.endsWith('.js') || f.endsWith('.html'))
    .filter((f) => readFileSync(f, 'utf8').includes(`${FROM}/`));
  if (stale.length) {
    console.error(`✗ ${fromDir} is missing but these still reference "${FROM}/": ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ nothing to do — no ${FROM}/ in ${DIST}/`);
  process.exit(0);
}

const movedCount = walk(fromDir).length;
renameSync(fromDir, toDir);

// Rewrite references. Only text assets can carry them; the paths are emitted
// as plain string literals so a global replace is exact.
let rewrittenFiles = 0;
let rewrittenRefs = 0;
for (const file of walk(DIST)) {
  if (!/\.(js|html|json|css|map)$/.test(file)) continue;
  const before = readFileSync(file, 'utf8');
  if (!before.includes(`${FROM}/`)) continue;
  const matches = before.split(`${FROM}/`).length - 1;
  writeFileSync(file, before.split(`${FROM}/`).join(`${TO}/`));
  rewrittenFiles++;
  rewrittenRefs += matches;
}

// Guard against a partial rewrite shipping silently.
const leftover = walk(DIST)
  .filter((f) => /\.(js|html|json|css|map)$/.test(f))
  .filter((f) => readFileSync(f, 'utf8').includes(`${FROM}/`));
if (leftover.length) {
  console.error(`✗ still referencing "${FROM}/": ${leftover.join(', ')}`);
  process.exit(1);
}

if (walk(DIST).some((f) => f.includes(`${'node_modules'}/`))) {
  console.error('✗ some files remain under a node_modules path and would not upload.');
  process.exit(1);
}

console.log(`✓ moved ${movedCount} asset(s) ${FROM}/ -> ${TO}/, rewrote ${rewrittenRefs} reference(s) across ${rewrittenFiles} file(s)`);
