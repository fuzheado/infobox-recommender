#!/usr/bin/env node
// scripts/research/check-fixture-drift.mjs — has the labelled corpus drifted?
//
// The eval's denominator is a live wiki, so a score can move because the engine
// changed OR because the corpus did. This separates the two: for every fixture it
// re-reads the article's CURRENT templates and reports how the label relates to
// reality today.
//
// Buckets (per case):
//   stable          label still matches what the article shows
//   label-changed   the article's primary infobox differs from the label
//   box-removed     label names a template, the article now has none
//   box-added       label is 'none', the article now has an infobox
//   tag-cleared     the {{Infobox requested}} tag is gone (backlog provenance stale)
//   page-missing    deleted/redirected since labelling
//
// Cache-first: one batched prop=templates request per 50 articles, cached by URL,
// so a re-run costs nothing.
//
// Usage: node scripts/research/check-fixture-drift.mjs [--limit=N] [--json=path]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApi } from '../../lib/api.js';
import { INFOBOX, isSupportingInfobox, primaryInfobox, fetchTemplateFacts } from '../../lib/census.js';

const flags = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) flags[m[1]] = m[2] ?? true;
}
const OUT = String(flags.json ?? 'test/results/fixture-drift.json');
const api = createApi({ offline: flags.online === '0' ? true : false, cacheDir: String(flags.cache ?? 'cache') });

const fixtures = JSON.parse(readFileSync('test/fixtures.json', 'utf8'));
let cases = fixtures.cases ?? fixtures;
if (flags.limit) cases = cases.slice(0, Number(flags.limit));

// Per-TITLE fetch, not batched. Batching this is what went wrong twice: first
// tllimit=500 silently truncated a 50-title batch (a per-REQUEST total — see
// engineering-notes.md §1.1), and then the tlcontinue rounds I added to fix that
// still returned rows that did not reassemble per page (32 fixtures came back
// with no templates but the bare meta-template, i.e. wrong primaries).
// A single title is unambiguous, and the URL cache makes the second run free.
// 88 paced requests once is cheaper than a failure mode nobody can see.
const info = new Map();
for (const c of cases) {
  let cont = null;
  let page = null;
  for (let round = 0; round < 12; round++) {
    const d = await api.enwiki({
      action: 'query',
      titles: c.title,
      redirects: 1,
      prop: 'info|templates',
      tllimit: 500,
      tlnamespace: 10,
      formatversion: 2,
      ...(cont ? { tlcontinue: cont } : {}),
    });
    const p = d.query?.pages?.[0];
    if (!p) break;
    if (!page) page = { ...p, templates: [] };
    page.templates.push(...(p.templates ?? []));
    cont = d.continue?.tlcontinue ?? null;
    if (!cont) break;
  }
  if (page) info.set(c.title, page);
}

// Label kinds matter: an `editor-choice (stale tag)` label is an OBSERVED box (so
// its absence is drift), while a `doc-demo` or `manual-*` label is the ANSWER the
// tool should give (so a bare article is the design, and a newly added box is the
// news). Classifying `manual-*` as observed made the one intentional bare case
// look like a removed infobox.
const labelKind = (src = '') =>
  /editor-choice/i.test(src) ? 'observed' : /consistent/i.test(src) ? 'validate' : 'expected';

// A label the engine can never satisfy is a corpus bug, not an engine failure:
// `expected: "Infobox"` names the generic meta-template, which
// isSupportingInfobox() deliberately never treats as a primary (two fixtures
// carried that label, and the eval counted the tool wrong for not naming it).
const labelInvalid = (expected) => {
  const e = String(expected ?? '');
  const name = e.startsWith('consistent:') ? e.split(':')[1] : e;
  if (!name || name === 'none') return false;
  return !INFOBOX(name) || isSupportingInfobox(name);
};

const rows = [];
for (const c of cases) {
  const p = info.get(c.title);
  if (!p || p.missing) {
    rows.push({ title: c.title, expected: c.expected, labelSource: c.labelSource, bucket: 'page-missing' });
    continue;
  }
  const templates = (p.templates ?? []).map((t) => t.title.replace(/^Template:/, ''));
  const infoboxes = templates.filter((n) => INFOBOX(n));
  let primary = null;
  if (infoboxes.length) {
    const { redirectMap, transcludes } = await fetchTemplateFacts(api, infoboxes);
    const canon = Object.keys(redirectMap).length
      ? [...new Set(infoboxes.map((n) => redirectMap[n] ?? n))]
      : infoboxes;
    // primaryInfobox() returns a template NAME (a string). Reading `.template`
    // off it silently yields undefined and falls back to canon[0] — which is
    // alphabetically the bare meta-template "Infobox". That mistake made 32
    // fixtures look as if they had changed template.
    primary = primaryInfobox(canon, transcludes) ?? canon[0] ?? null;
  }
  // {{Infobox requested}} is a TALK-page banner, not an article template: the
  // first version of this check looked for it on the article and reported all
  // 88 tags as cleared. Same place peers.js reads WikiProject banners from.
  const talk = await api.enwiki({
    action: 'query',
    titles: `Talk:${c.title}`,
    redirects: 1,
    prop: 'templates',
    tllimit: 500,
    tlnamespace: 10,
    formatversion: 2,
  });
  const talkTemplates = (talk.query?.pages?.[0]?.templates ?? []).map((t) =>
    t.title.replace(/^Template:/, '')
  );
  const tagPresent = talkTemplates.some((t) => /^Infobox requested$/i.test(t));
  const expected = c.expected ?? '';
  const kind = labelKind(c.labelSource);
  const wantTemplate = String(expected).startsWith('consistent')
    ? (expected.split(':')[1] ?? null)
    : expected !== 'none'
      ? expected
      : null;

  let bucket;
  if (String(expected ?? '').trim() === '') {
    // Deliberately unlabelled (see fixtures.meta.provenance): not drift, not a bug.
    bucket = 'unlabelled';
  } else if (labelInvalid(expected)) {
    bucket = 'label-invalid';
  } else if (kind === 'expected') {
    // The label is the answer we expect, not a box we observed: bare is the
    // design, and a box appearing is the interesting drift.
    bucket = primary && expected === 'none' ? 'box-added' : 'stable';
  } else if (!wantTemplate) {
    bucket = primary ? 'box-added' : 'stable';
  } else {
    bucket =
      !primary ? 'box-removed'
      : primary === wantTemplate ? 'stable'
      : 'label-changed';
  }
  // The tag is orthogonal: a cleared tag means the backlog provenance is stale
  // even when the label itself still matches.
  const tagNote = tagPresent ? null : 'tag-cleared';
  rows.push({
    title: c.title,
    expected: c.expected,
    labelSource: c.labelSource,
    labelKind: kind,
    primary,
    tags: talkTemplates.filter((t) => /infobox requested/i.test(t)),
    bucket,
    tagNote,
  });
}

const byBucket = {};
for (const r of rows) byBucket[r.bucket] = (byBucket[r.bucket] ?? 0) + 1;
const tagCleared = rows.filter((r) => r.tagNote === 'tag-cleared').length;
const invalid = rows.filter((r) => r.bucket === 'label-invalid');
const out = {
  generatedAt: new Date().toISOString(),
  fixtures: cases.length,
  byBucket,
  tagCleared,
  labelInvalid: invalid.map((r) => ({ title: r.title, expected: r.expected, articleNow: r.primary })),
  rows,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));

console.log(`\n=== fixture drift (${cases.length} cases) ===`);
for (const [k, v] of Object.entries(byBucket).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(15)} ${v}`);
console.log(`  ${'tag-cleared'.padEnd(15)} ${tagCleared}  ({{Infobox requested}} no longer on the article)`);
const kindCount = {};
for (const r of rows) kindCount[r.labelKind] = (kindCount[r.labelKind] ?? 0) + 1;
console.log(`\n  label kinds: ${JSON.stringify(kindCount)}`);
for (const r of rows.filter((r) => r.bucket !== 'stable' && r.bucket !== 'unlabelled' && r.labelKind !== 'expected')) {
  console.log(`\n  [${r.bucket} · ${r.labelKind}] ${r.title}\n      expected: ${r.expected}\n      article now: ${r.primary ?? '(no infobox)'}`);
}
const expectedDrift = rows.filter((r) => r.labelKind === 'expected' && r.bucket === 'box-added');
console.log(`\n  --- answer-labels whose article has since GAINED an infobox (the interesting drift): ${expectedDrift.length}`);
for (const r of expectedDrift) console.log(`      ${r.title} — now ${r.primary}`);
if (invalid.length) {
  console.log(`\n  --- labels the engine can never satisfy (corpus bugs, not engine failures): ${invalid.length}`);
  for (const r of invalid) console.log(`      ${r.title}: expected "${r.expected}" — article now ${r.primary ?? '(none)'}`);
}
console.log(`\nwrote ${OUT}`);
