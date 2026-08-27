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

const api = createApi({ cacheDir: 'cache', paceMs: 1000 });
const results = [];
for (const t of titles) {
  if (!jsonOnly) console.log(`\n=== ${t} ===`);
  try {
    const r = await analyze(api, t);
    results.push(r);
    if (jsonOnly) continue;
    console.log(`  qid: ${r.qid ?? '(none)'}`);
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
