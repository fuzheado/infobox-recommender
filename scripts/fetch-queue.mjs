// scripts/fetch-queue.mjs — build the labeled test set from the infobox-request
// backlog:
//   1. Fetch all members of Category:Wikipedia articles with an infobox request
//      (talk pages -> article titles).
//   2. Staleness check: which articles NOW have an infobox despite the tag?
//      The template editors chose is the consensus answer -> gold label.
//   3. Merge with scripts/manual-cases.json and write test/fixtures.json.

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createApi, chunk } from '../lib/api.js';
import { INFOBOX } from '../lib/census.js';

const api = createApi({ cacheDir: 'cache', paceMs: 1000 });

// --- 1. full member list (ns=1 talk pages) ---
const members = [];
let cmcontinue;
do {
  const params = {
    action: 'query',
    list: 'categorymembers',
    cmtitle: 'Category:Wikipedia articles with an infobox request',
    cmnamespace: 1,
    cmlimit: 500,
  };
  if (cmcontinue) params.cmcontinue = cmcontinue;
  const d = await api.enwiki(params);
  members.push(...d.query.categorymembers.map((m) => m.title.replace(/^Talk:/, '')));
  cmcontinue = d.continue?.cmcontinue;
} while (cmcontinue);

console.log(`queue members (articles): ${members.length}`);

// --- 2. staleness check (batches of 10 — tllimit is per-REQUEST total!) ---
const boxed = new Map(); // title -> specific template (bare {{Infobox}} -> 'Infobox')
for (const batch of chunk(members, 10)) {
  const d = await api.enwiki({
    action: 'query',
    titles: batch.join('|'),
    prop: 'templates',
    tllimit: 500,
    tlnamespace: 10,
  });
  for (const p of d.query?.pages ?? []) {
    if (p.missing) continue;
    const boxes = (p.templates ?? [])
      .map((t) => t.title.replace(/^Template:/, ''))
      .filter((n) => INFOBOX(n));
    if (boxes.length) {
      boxed.set(p.title, boxes.filter((n) => n !== 'Infobox')[0] ?? 'Infobox');
    }
  }
}

const staleness = boxed.size / members.length;
console.log(
  `stale tags (article now has an infobox): ${boxed.size}/${members.length} (${Math.round(staleness * 100)}%)`
);
const templateCounts = {};
for (const t of boxed.values()) templateCounts[t] = (templateCounts[t] ?? 0) + 1;
console.log(
  'templates found:',
  Object.entries(templateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t, n]) => `${t} ${n}`)
    .join(', ')
);

// --- 3. merge with manual cases and write fixtures ---
const manual = JSON.parse(readFileSync(new URL('./manual-cases.json', import.meta.url), 'utf8'));
const staleCases = [...boxed.entries()].map(([title, tpl]) => ({
  title,
  expected: tpl,
  labelSource: 'editor-choice (stale tag)',
}));
const known = new Set(manual.cases.map((c) => c.title));
const fixtures = {
  meta: {
    source: 'Category:Wikipedia articles with an infobox request',
    fetched: new Date().toISOString().slice(0, 10),
    queueSize: members.length,
    staleCount: boxed.size,
  },
  cases: [...staleCases.filter((c) => !known.has(c.title)), ...manual.cases],
};

mkdirSync(new URL('../test/', import.meta.url), { recursive: true });
const out = new URL('../test/fixtures.json', import.meta.url);
writeFileSync(out, JSON.stringify(fixtures, null, 2));
console.log(`\nwrote ${fixtures.cases.length} cases -> ${out.pathname}`);
