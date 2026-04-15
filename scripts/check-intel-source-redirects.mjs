import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_FILE = path.join(ROOT, 'lib', 'intel', 'signal-sources.ts');

function parseConstStrings(text) {
  // const NAME = 'https://...';
  const map = new Map();
  const re = /const\s+([A-Z0-9_]+)\s*=\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(text))) {
    map.set(m[1], m[2]);
  }
  return map;
}

function parseSources(text) {
  // Very lightweight parser for entries like:
  // { slug: 'x', endpointUrl: CONST_OR_STRING, isEnabled: true, ... }
  const entries = [];
  const objectRe = /\{\s*slug:\s*'([^']+)'\s*,[\s\S]*?\}/g;
  let m;
  while ((m = objectRe.exec(text))) {
    const obj = m[0];
    const slug = m[1];

    const enabledMatch = obj.match(/isEnabled:\s*(true|false)/);
    const isEnabled = enabledMatch ? enabledMatch[1] === 'true' : false;

    const endpointMatch = obj.match(/endpointUrl:\s*([^,\n}]+)/);
    const endpointExpr = endpointMatch ? endpointMatch[1].trim() : null;

    entries.push({ slug, isEnabled, endpointExpr });
  }
  return entries;
}

async function fetchWithRedirectTrace(startUrl, { maxRedirects = 10, timeoutMs = 20000 } = {}) {
  const visited = new Set();
  let url = startUrl;
  let redirects = 0;

  while (true) {
    if (visited.has(url)) {
      return { ok: false, reason: 'redirect_loop', redirects, url, visited: [...visited] };
    }
    visited.add(url);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ac.signal,
        headers: {
          'User-Agent': 'iamresist-intel-check/1.0',
          Accept: '*/*',
        },
      });
    } finally {
      clearTimeout(t);
    }

    const status = res.status;
    const loc = res.headers.get('location');
    const isRedirect = status >= 300 && status < 400 && Boolean(loc);

    if (!isRedirect) {
      return { ok: res.ok, status, redirects, finalUrl: url };
    }

    redirects += 1;
    if (redirects > maxRedirects) {
      return { ok: false, reason: 'redirect_count_exceeded', redirects, url, location: loc };
    }

    url = new URL(loc, url).toString();
  }
}

function resolveEndpoint(endpointExpr, consts) {
  if (!endpointExpr) return null;
  if (endpointExpr === 'null') return null;
  if (endpointExpr.startsWith("'") && endpointExpr.endsWith("'")) {
    return endpointExpr.slice(1, -1);
  }
  // simple CONST lookup
  if (consts.has(endpointExpr)) return consts.get(endpointExpr);
  // Anything dynamic/env-based we can't resolve here
  return null;
}

async function main() {
  const text = fs.readFileSync(SOURCE_FILE, 'utf8');
  const consts = parseConstStrings(text);
  const sources = parseSources(text)
    .filter((s) => s.isEnabled)
    .map((s) => ({ ...s, endpointUrl: resolveEndpoint(s.endpointExpr, consts) }))
    .filter((s) => typeof s.endpointUrl === 'string' && s.endpointUrl);

  console.log(`Checking ${sources.length} enabled sources with static URLs...`);

  const failures = [];
  for (const s of sources) {
    try {
      const r = await fetchWithRedirectTrace(s.endpointUrl);
      if (r.ok !== true) {
        failures.push({ slug: s.slug, endpointUrl: s.endpointUrl, result: r });
        console.log(`FAIL ${s.slug}:`, JSON.stringify(r));
      } else if (r.status >= 400) {
        failures.push({ slug: s.slug, endpointUrl: s.endpointUrl, result: r });
        console.log(`HTTP ${r.status} ${s.slug}: ${r.finalUrl}`);
      } else {
        console.log(`OK ${s.slug}: ${r.status} (redirects=${r.redirects})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ slug: s.slug, endpointUrl: s.endpointUrl, error: msg });
      console.log(`THREW ${s.slug}: ${msg}`);
    }
  }

  console.log('\nSummary:');
  console.log(JSON.stringify({ checked: sources.length, failures: failures.length }, null, 2));
  if (failures.length) {
    console.log('\nFailing slugs:');
    for (const f of failures) console.log(`- ${f.slug} (${f.endpointUrl})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

