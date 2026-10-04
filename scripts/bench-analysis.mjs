#!/usr/bin/env node
// scripts/bench-analysis.mjs — where does a cold analysis spend its time?
//
// Runs the real pipeline with the HTTP layer instrumented (global fetch is
// wrapped, no code changes) and reports the request timeline. With the default
// ≥1s global pacing, wall time ≈ (number of network requests) × 1s, so the
// request COUNT is the metric to attack.
//
// Usage:
//   node scripts/bench-analysis.mjs "Canut revolts"          # cold, live API
//   node scripts/bench-analysis.mjs "Canut revolts" --cached # use cache/ (warm)

import { createApi } from '../lib/api.js';
import { analyze } from '../lib/analyze.js';

const args = process.argv.slice(2);
const title = args.find((a) => !a.startsWith('--')) ?? 'May 1400 imperial election';
const useCache = args.includes('--cached');
const full = args.includes('--full'); // ignore an existing infobox (run the census anyway)
const PACE = Number(process.env.PACE_MS || 1000);

const reqs = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const t0 = Date.now();
  const rec = { url: String(url), t0, ms: null, status: null };
  reqs.push(rec);
  try {
    const r = await realFetch(url, opts);
    rec.ms = Date.now() - t0;
    rec.status = r.status;
    return r;
  } catch (e) {
    rec.ms = Date.now() - t0;
    rec.status = `ERR ${e.message.slice(0, 40)}`;
    throw e;
  }
};

/** Classify a request URL for the summary. */
function kind(url) {
  const u = new URL(url);
  const host = u.host;
  if (host.includes('query.wikidata.org')) return 'WDQS sparql';
  if (host.includes('rest_v1')) return 'REST summary';
  const action = u.searchParams.get('action') ?? '';
  const prop = u.searchParams.get('prop') ?? '';
  if (action === 'wbgetclaims') return `wikidata wbgetclaims (${u.searchParams.get('property')})`;
  if (action === 'wbgetentities') return 'wikidata wbgetentities';
  if (prop === 'categoryinfo') return 'enwiki categoryinfo';
  if (prop === 'categories') return 'enwiki categories';
  if (prop === 'templates') return 'enwiki templates';
  if (prop.includes('pageprops')) {
    const n = (u.searchParams.get('titles') ?? '').split('|').filter(Boolean).length;
    const cont = u.searchParams.get('tlcontinue') || u.searchParams.get('continue') ? ',cont' : '';
    return `census (${n} titles${cont})`;
  }
  return `enwiki ${action || prop || 'other'}`;
}

const api = createApi({ cacheDir: useCache ? 'cache' : null, paceMs: PACE });
const t0 = Date.now();
const result = await analyze(api, title, { skipExisting: !full, log: () => {} });
const totalMs = Date.now() - t0;

const byKind = new Map();
for (const r of reqs) {
  const k = kind(r.url);
  const e = byKind.get(k) ?? { n: 0, ms: 0 };
  e.n++;
  e.ms += r.ms ?? 0;
  byKind.set(k, e);
}

console.log(`\n## ${title}`);
console.log(`mode: ${useCache ? 'warm (cache/)' : 'COLD (no cache)'}${full ? ' · full census' : ''} · pace ${PACE}ms`);
console.log(`verdict: ${result.verdict}${result.template ? ` (${result.template})` : ''} · peers: ${result.evidence?.total ?? '—'}`);
console.log(`\nwall time: ${(totalMs / 1000).toFixed(1)}s`);
console.log(`network requests: ${reqs.length}  →  pacing floor ${(reqs.length * PACE) / 1000}s`);
const sumMs = reqs.reduce((a, r) => a + (r.ms ?? 0), 0);
console.log(`sum of request durations: ${(sumMs / 1000).toFixed(1)}s (latency, mostly overlapped)`);
console.log(`unaccounted (queue/CPU/pacing gaps): ${((totalMs - sumMs) / 1000).toFixed(1)}s`);

console.log(`\n### requests by kind`);
for (const [k, e] of [...byKind.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(e.n).padStart(3)} × ${k}  (${(e.ms / 1000).toFixed(1)}s of latency)`);
}

console.log(`\n### timeline (Δ = ms since previous request started)`);
let prev = t0;
for (const [i, r] of reqs.entries()) {
  const delta = r.t0 - prev;
  prev = r.t0;
  const bar = '·'.repeat(Math.min(40, Math.round(delta / 100)));
  console.log(
    `  ${String(i + 1).padStart(3)}  +${String(delta).padStart(5)}ms  ${String(r.ms ?? 0).padStart(6)}ms  ${String(r.status).padEnd(3)} ${kind(r.url).padEnd(34)} ${bar}`
  );
}
