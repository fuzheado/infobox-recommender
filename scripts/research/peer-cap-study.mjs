#!/usr/bin/env node
// scripts/research/peer-cap-study.mjs — is the 150-peer cap the right size?
//
// Three questions, answered by measurement rather than intuition:
//
//   1. HOW OFTEN DOES THE CAP BIND? The cap only matters for articles whose
//      candidate pool exceeds it. Uncap the discovery step and see the pool-size
//      distribution.
//   2. IS THE CAP LOAD-BEARING FOR THE VERDICT? Re-run the REAL modules
//      (discoverPeers -> runCensus -> decide) at several caps and compare
//      verdicts. If verdicts are stable across 50..150, the exact number is not
//      load-bearing and can be chosen for cost. If they flip, it is.
//   3. WHAT QUALITY IS THE MARGIN? Bucket peers by discovery rank and report,
//      per bucket, where they came from (P31 class / category / pointer) and how
//      often they are boxed. If the ranks just past the cap look like the ranks
//      just before it, the cap is throwing away signal; if the marginal peers
//      are a different kind of article, the cap is correctly trimming dilution.
//
// Cache-served by default (--online=1 to allow network). The sweep re-runs the
// production modules, with one documented divergence: analyze()'s bare-cluster
// sub-rule needs a query whose URL depends on the peer SUBSET (so it cannot be
// cached across caps), so it is skipped here and its eligibility is reported
// instead (it can only turn weak-signal into none-warranted at coverage <= 25%).
//
// Usage:
//   node scripts/research/peer-cap-study.mjs                      # all 88 cases
//   node scripts/research/peer-cap-study.mjs --caps=25,50,100,150 --limit=12
//   node scripts/research/peer-cap-study.mjs --online=1 --big=300

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApi } from '../../lib/api.js';
import { discoverPeers } from '../../lib/peers.js';
import { runCensus } from '../../lib/census.js';
import { decide, tieredEvaluate } from '../../lib/decide.js';

const flags = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) flags[m[1]] = m[2] ?? true;
}
const CAPS = String(flags.caps ?? '25,50,75,100,125,150')
  .split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
const BIG = Number(flags.big ?? Math.max(...CAPS) * 2); // discovery is uncapped here
const LIMIT = Number(flags.limit ?? 0);
const OUT = String(flags.out ?? 'test/results/peer-cap-study.json');
const api = createApi({
  offline: flags.online !== '1',
  cacheDir: String(flags.cache ?? 'cache'),
  paceMs: Number(flags.pace ?? 1000),
});

const r3 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : null);

// analyze()'s pre-step, replicated verbatim: page resolution + QID + the pointer
// claims discoverPeers consumes (it does not fetch those itself).
async function resolveArticle(api, title) {
  const data = await api.enwiki({
    action: 'query',
    titles: title,
    redirects: 1,
    prop: 'info|pageprops|templates',
    ppprop: 'wikibase_item|disambiguation',
    tllimit: 500,
    tlnamespace: 10,
  });
  const page = data.query.pages[0] ?? { missing: true, title };
  const qid = page.pageprops?.wikibase_item ?? null;
  const pointerClaims = { p39: [], p179: [], p361: [], p155: [], p156: [] };
  let p31Classes = [];
  if (qid) {
    const ent = await api
      .wikidata({ action: 'wbgetentities', ids: qid, props: 'claims', formatversion: 2 })
      .catch(() => null);
    const claims = ent?.entities?.[qid]?.claims ?? {};
    const vals = (p) => (claims[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    p31Classes = vals('P31');
    for (const p of ['P39', 'P179', 'P361', 'P155', 'P156']) {
      pointerClaims[p.toLowerCase()] = vals(p).slice(0, 12);
    }
  }
  return { page, qid, p31Classes, pointerClaims };
}

// Same scoring as test/eval.mjs (order matters: a validate-style case that
// abstains counts as an abstention, not as a skipped validate), so a cap of 150
// must reproduce the recorded 57 pass / 6 fail / 25 abstain exactly.
function score(verdict, template, expected) {
  if (verdict === 'weak-signal') return 'abstain';
  if (typeof expected === 'string' && expected.startsWith('consistent')) {
    const want = expected.split(':')[1] ?? null;
    return template === want ? 'pass' : 'fail';
  }
  if (verdict === 'recommend') return expected === template ? 'pass' : 'fail';
  if (verdict === 'none-warranted') return expected === 'none' ? 'pass' : 'fail';
  return 'skip';
}

const fixtures = JSON.parse(readFileSync('test/fixtures.json', 'utf8'));
let cases = fixtures.cases ?? fixtures;
if (LIMIT) cases = cases.slice(0, LIMIT);

const rows = [];
const buckets = new Map(); // rank bucket -> {n, boxed, origin:{}, tier:{}}
const bucketOf = (rank) =>
  rank <= 25 ? '01-25' : rank <= 50 ? '26-50' : rank <= 75 ? '51-75' : rank <= 100 ? '76-100'
    : rank <= 125 ? '101-125' : rank <= 150 ? '126-150' : rank <= 200 ? '151-200' : '201+';

for (const c of cases) {
  try {
    const { page, qid, p31Classes, pointerClaims } = await resolveArticle(api, c.title);
    const { peers, peerOrigin, peerTier, counts } = await discoverPeers({
      api,
      title: page.title,
      qid,
      p31Classes,
      pointerClaims,
      maxTotal: BIG,
      log: () => {},
    });

    const perCap = [];
    for (const cap of CAPS) {
      const census = await runCensus({
        api,
        peers: peers.slice(0, cap),
        peerOrigin,
        peerTier,
        log: () => {},
      });
      const flat = decide({ title: page.title, page, census, banners: [], bareCluster: [] });
      const tiered = flat.verdict === 'weak-signal' ? tieredEvaluate(census) : null;
      const final = tiered ?? flat;
      perCap.push({
        cap,
        n: census.total,
        boxed: census.withInfobox,
        coverage: r3(census.coverage),
        dominance: r3(census.dominanceShare),
        dominant: census.dominant?.template ?? null,
        byClass: census.subCluster?.byClass
          ? { n: census.subCluster.byClass.n, coverage: r3(census.subCluster.byClass.coverage), template: census.subCluster.byClass.dominant?.template ?? null }
          : null,
        bareClusterEligible: census.coverage <= 0.25 && census.bare.length >= 5,
        verdict: final.verdict,
        template: final.template ?? null,
        via: tiered ? `tier${tiered.tier}` : 'flat',
        outcome: score(final.verdict, final.template ?? null, c.expected),
      });
    }

    // Margin quality + the UNCAPPED verdict: census the full pool when the cache
    // allows (the census is already needed for the rank buckets, and its result
    // answers "would more peers change the answer?"). Falls back to the widest
    // swept cap when the tail is not cached.
    let evaluated = null;
    let wide = null;
    try {
      wide = await runCensus({ api, peers, peerOrigin, peerTier, log: () => {} });
    } catch {
      const widest = CAPS[CAPS.length - 1];
      wide = await runCensus({ api, peers: peers.slice(0, widest), peerOrigin, peerTier, log: () => {} });
    }
    evaluated = wide.evaluated;
    {
      const flatW = decide({ title: page.title, page, census: wide, banners: [], bareCluster: [] });
      const tieredW = flatW.verdict === 'weak-signal' ? tieredEvaluate(wide) : null;
      const finalW = tieredW ?? flatW;
      perCap.push({
        cap: 'all',
        n: wide.total,
        boxed: wide.withInfobox,
        coverage: r3(wide.coverage),
        dominance: r3(wide.dominanceShare),
        dominant: wide.dominant?.template ?? null,
        byClass: wide.subCluster?.byClass
          ? { n: wide.subCluster.byClass.n, coverage: r3(wide.subCluster.byClass.coverage), template: wide.subCluster.byClass.dominant?.template ?? null }
          : null,
        bareClusterEligible: wide.coverage <= 0.25 && wide.bare.length >= 5,
        verdict: finalW.verdict,
        template: finalW.template ?? null,
        via: tieredW ? `tier${tieredW.tier}` : 'flat',
        outcome: score(finalW.verdict, finalW.template ?? null, c.expected),
      });
    }
    const rankByTitle = new Map(peers.map((t, i) => [t, i + 1]));
    for (const p of evaluated) {
      const rank = rankByTitle.get(p.title);
      if (!rank) continue;
      const b = bucketOf(rank);
      if (!buckets.has(b)) buckets.set(b, { n: 0, boxed: 0, origin: {}, tier: {} });
      const rec = buckets.get(b);
      rec.n++;
      if ((p.infoboxes ?? []).length) rec.boxed++;
      for (const o of p.origin ?? []) rec.origin[o] = (rec.origin[o] ?? 0) + 1;
      const t = p.tier === Infinity || p.tier == null ? 'none' : String(p.tier);
      rec.tier[t] = (rec.tier[t] ?? 0) + 1;
    }

    rows.push({
      title: page.title,
      expected: c.expected,
      poolSize: peers.length,
      counts,
      perCap,
    });
    const b = perCap[perCap.length - 1];
    console.log(
      `  ${String(page.title).padEnd(42)} pool=${String(peers.length).padStart(4)}  ` +
        perCap.map((r) => `${String(r.cap).padStart(3)}:${String(r.verdict).slice(0, 4)}`).join(' ')
    );
    void b;
  } catch (e) {
    rows.push({ title: c.title, expected: c.expected, error: String(e?.message ?? e).slice(0, 160) });
    console.log(`  ${String(c.title).padEnd(42)} ERROR ${String(e?.message ?? e).slice(0, 90)}`);
  }
}

// ---- summary ----
const ok = rows.filter((r) => !r.error);
const allCaps = [...CAPS, 'all'];
const byCap = {};
for (const cap of allCaps) {
  const s = { pass: 0, fail: 0, abstain: 0, skip: 0 };
  for (const r of ok) {
    const e = r.perCap.find((x) => x.cap === cap);
    if (e) s[e.outcome]++;
  }
  const decisive = s.pass + s.fail;
  byCap[cap] = { ...s, decisive, accuracy: decisive ? Math.round((100 * s.pass) / decisive) : null };
}

const flips = [];
const baseCap = 'all'; // compare every cap against the UNCAPPED pool: "does the cap matter?"
for (const r of ok) {
  const base = r.perCap.find((x) => x.cap === baseCap) ?? r.perCap[r.perCap.length - 1];
  for (const e of r.perCap) {
    if (e === base) continue;
    const classChanged = e.verdict !== base.verdict;
    const templateChanged = e.verdict === 'recommend' && base.verdict === 'recommend' && e.template !== base.template;
    if (classChanged || templateChanged) {
      flips.push({
        title: r.title,
        cap: e.cap,
        vs: base.cap,
        classChanged,
        templateChanged,
        from: `${base.verdict}${base.template && base.verdict !== 'weak-signal' ? ':' + base.template : ''}`,
        to: `${e.verdict}${e.template && e.verdict !== 'weak-signal' ? ':' + e.template : ''}`,
        coverageFrom: base.coverage,
        coverageTo: e.coverage,
        dominanceFrom: base.dominance,
        dominanceTo: e.dominance,
      });
    }
  }
}

const poolSizes = ok.map((r) => r.poolSize).sort((a, b) => a - b);
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null);
const binding = {
  gt100: ok.filter((r) => r.poolSize > 100).length,
  gt150: ok.filter((r) => r.poolSize > 150).length,
  eq150: ok.filter((r) => r.poolSize === 150).length, // == cap: could be truncated
  median: pct(poolSizes, 50),
  p90: pct(poolSizes, 90),
  max: poolSizes[poolSizes.length - 1] ?? null,
  min: poolSizes[0] ?? null,
};

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    caps: CAPS,
    big: BIG,
    cases: cases.length,
    errors: rows.length - ok.length,
    offline: flags.online !== '1',
    cacheDir: String(flags.cache ?? 'cache'),
    note: 'bare-cluster sub-rule not applied (subset-dependent cache key); eligibility reported per cap',
  },
  binding,
  byCap,
  flips,
  buckets: Object.fromEntries([...buckets.entries()].sort()),
  rows,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));

console.log('\n--- pool size (uncapped candidates) ---');
console.log(
  `  min ${binding.min} | median ${binding.median} | p90 ${binding.p90} | max ${binding.max}` +
    `   >100: ${binding.gt100}/${ok.length}   >150: ${binding.gt150}/${ok.length}   ==150: ${binding.eq150}`
);
console.log('\n--- accuracy by cap (eval scoring; cap 150 and "all" should reproduce 57/6/25) ---');
for (const cap of allCaps) {
  const s = byCap[cap];
  console.log(`  cap ${String(cap).padStart(3)}: pass ${String(s.pass).padStart(2)} | fail ${String(s.fail).padStart(2)} | abstain ${String(s.abstain).padStart(2)} | accuracy ${s.accuracy}%`);
}
console.log(`\n--- margin quality (by discovery rank) ---`);
for (const [k, v] of Object.entries(out.buckets)) {
  const origin = Object.entries(v.origin).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${Math.round((100 * n) / v.n)}%`).join(', ');
  console.log(`  ${k.padEnd(8)} n=${String(v.n).padStart(5)}  boxed ${String(Math.round((100 * v.boxed) / v.n)).padStart(3)}%  ${origin}`);
}
console.log(`\n--- verdict/template changes vs the UNCAPPED pool ---`);
const classFlips = flips.filter((f) => f.classChanged);
const tplFlips = flips.filter((f) => f.templateChanged);
console.log(`  verdict-class changes: ${classFlips.length} | recommend-template changes: ${tplFlips.length}`);
const byCapFlips = {};
for (const f of classFlips) byCapFlips[f.cap] = (byCapFlips[f.cap] ?? 0) + 1;
console.log(`  by cap: ${Object.entries(byCapFlips).map(([k, v]) => `${k}:${v}`).join(' ') || 'none'}`);
for (const f of classFlips.slice(0, 20)) {
  console.log(`  ${String(f.cap).padStart(4)} ${f.title.slice(0, 34).padEnd(34)} ${f.to}  (uncapped: ${f.from}, cov ${f.coverageTo}->${f.coverageFrom})`);
}
if (classFlips.length > 20) console.log(`  … and ${classFlips.length - 20} more`);
console.log(`\nwrote ${OUT}`);
