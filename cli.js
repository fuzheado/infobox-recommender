#!/usr/bin/env node
// CLI — peer-census infobox recommender.
//
// Usage:
//   node cli.js "1346 imperial election"
//   node cli.js "Prince-elector" "May 1400 imperial election" --json
//
// Thin wrapper over lib/analyze.js (the same pipeline the eval harness and
// the future userscript use).

import { createApi } from './lib/api.js';
import { analyze } from './lib/analyze.js';

const titles = process.argv.slice(2).filter((t) => !t.startsWith('--'));
const jsonOnly = process.argv.includes('--json');
// --validate: article already has an infobox — run the census anyway and
// compare the existing choice against peer practice.
const validate = process.argv.includes('--validate');

const api = createApi({ cacheDir: 'cache', paceMs: 1000 });
const results = [];
for (const t of titles) {
  if (!jsonOnly) console.log(`\n=== ${t} ===`);
  try {
    const r = await analyze(api, t, { skipExisting: !validate });
    results.push(r);
    if (jsonOnly) continue;
    console.log(`  qid: ${r.qid ?? '(none)'}`);
    if (r.wikidata) {
      const w = r.wikidata;
      const used =
        w.classesTotal > 0
          ? `classes ${w.classesUsed}/${w.classesTotal} usable`
          : 'no P31 classes';
      console.log(`  wikidata: P31 ×${w.p31} · P279 ×${w.p279} · ${used} · ${w.sparqlPeers} same-class peers`);
    }
    if (r.comparison) {
      const c = r.comparison;
      console.log(
        `  validate: ${c.status} — ${c.note}`
      );
    }
    if (r.digest) {
      const d = r.digest;
      console.log(
        `  ${d.existingInfobox ? `infobox: {{${d.existingInfobox}}}` : 'infobox: none'}` +
          (d.shortdesc ? ` | ${d.shortdesc}` : '')
      );
      if (d.extract) console.log(`  digest: ${d.extract.slice(0, 160)}${d.extract.length > 160 ? '…' : ''}`);
    }
    if (r.verdict === 'recommend') {
      console.log(`  -> recommend: ${r.template} (${r.confidence}) — ${r.reason}`);
    } else {
      console.log(`  -> ${r.verdict} (${r.confidence ?? '—'})${r.template ? `: ${r.template}` : ''} — ${r.reason ?? ''}`);
    }
    if (r.evidence) {
      console.log(
        `  census: ${Math.round(r.evidence.coverage * 100)}% of ${r.evidence.total} peers boxed` +
          (r.evidence.subCluster.byClass
            ? `; same-class ${Math.round(r.evidence.subCluster.byClass.coverage * 100)}%`
            : '')
      );
      if (r.evidence.tierStats?.length) {
        console.log(
          '  tiers: ' +
            r.evidence.tierStats
              .map((t) => `t${t.tier}${t.added ? '+' + t.added.name : ''}:${t.n}@${t.coverage}% ${t.dominant ?? '-'}`)
              .join(' | ')
        );
      }
      if (r.evidence.banners?.length) {
        console.log(`  WikiProject banners: ${r.evidence.banners.slice(0, 4).join(', ')}${r.evidence.banners.length > 4 ? '…' : ''}`);
      }
    }
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    results.push({ title: t, verdict: 'error', reason: e.message });
  }
}
if (!jsonOnly) console.log('\n--- full JSON ---');
console.log(JSON.stringify(results, null, 2));
