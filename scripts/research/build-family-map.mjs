#!/usr/bin/env node
// scripts/research/build-family-map.mjs — propose the specificity-ladder families
//
// The ladder needs to know which templates are variants of the same thing
// (officeholder ⊂ person, publisher ⊂ company, fossil ⊂ taxon). This derives a
// PROPOSAL from two sources that can be checked rather than recalled:
//
//   1. how often each template actually appears in peer pages (the census cache),
//      which bounds the work — the top 100 templates cover ~90% of instances;
//   2. the category each template declares, restricted to the topical
//      "…infobox templates" tree (People and person, Place, Science and nature…).
//
// Output is a proposal for curation into lib/families.json — the base/member
// split is a judgement call and stays hand-written.
//
// Usage: node scripts/research/build-family-map.mjs [--top=120] [--json=path]

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApi, chunk } from '../../lib/api.js';
import { INFOBOX, isSupportingInfobox } from '../../lib/census.js';

const flags = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) flags[m[1]] = m[2] ?? true;
}
const TOP = Number(flags.top ?? 120);
const OUT = String(flags.json ?? 'test/results/family-map-proposal.json');
const api = createApi({ cacheDir: String(flags.cache ?? 'cache') });

// --- 1) how often does each template appear in peer pages? -------------------
const freq = new Map();
for (const f of readdirSync('cache/templates')) {
  let d;
  try {
    d = JSON.parse(readFileSync(`cache/templates/${f}`, 'utf8'));
  } catch {
    continue;
  }
  const names = (d.templates ?? [])
    .map((t) => (typeof t === 'object' ? t.title : t))
    .filter(Boolean)
    .map((n) => String(n).replace(/^Template:/, ''));
  for (const n of new Set(names.filter((x) => INFOBOX(x) && !isSupportingInfobox(x) && !x.includes('/')))) {
    freq.set(n, (freq.get(n) ?? 0) + 1);
  }
}
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);

// --- 2) which topical infobox category does each declare? -------------------
const TOPICAL = /infobox templates?$/i;
const NOT_TOPICAL = /using wikidata|with module parameter|with updated parameter|wrapper|three columns|by country|by continent/i;
const cats = new Map();
for (const batch of chunk(top.map(([n]) => `Template:${n}`), 50)) {
  const d = await api.enwiki({
    action: 'query',
    titles: batch.join('|'),
    prop: 'categories',
    cllimit: 500,
    clshow: '!hidden',
    formatversion: 2,
  });
  for (const p of d.query?.pages ?? []) {
    cats.set(
      p.title.replace(/^Template:/, ''),
      (p.categories ?? []).map((c) => c.title.replace(/^Category:/, ''))
    );
  }
}

// --- 3) group: prefer the most specific topical category --------------------
const groups = new Map();
for (const [name, n] of top) {
  const topical = (cats.get(name) ?? []).filter((c) => TOPICAL.test(c) && !NOT_TOPICAL.test(c));
  const key = topical.sort((a, b) => a.length - b.length)[0] ?? '(uncategorised)';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ name, instances: n, allTopical: topical });
}

const rows = [...groups.entries()]
  .map(([category, members]) => ({
    category,
    members: members.sort((a, b) => b.instances - a.instances),
    instances: members.reduce((s, m) => s + m.instances, 0),
  }))
  .sort((a, b) => b.instances - a.instances);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), topN: TOP, groups: rows }, null, 1)
);

console.log(`\n=== proposed families from the top ${TOP} templates (${rows.length} groups) ===`);
for (const g of rows) {
  console.log(`\n  ${g.category}  — ${g.instances} instances, ${g.members.length} templates`);
  console.log(
    '    ' + g.members.slice(0, 12).map((m) => `${m.name} (${m.instances})`).join(', ') +
      (g.members.length > 12 ? `, +${g.members.length - 12} more` : '')
  );
}
console.log(`\nwrote ${OUT}`);
