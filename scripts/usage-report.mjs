#!/usr/bin/env node
// scripts/usage-report.mjs — maintainer-only usage report.
//
// Reads the privacy-preserving usage log (usage/, gitignored, 90-day raw
// retention) and prints the detail that is deliberately NOT published on the
// public /stats endpoint: per-day counts and per-article records.
//
// Run on the Toolforge host (where usage/ lives):
//   ssh alih@dev.toolforge.org "sudo -niu tools.infobox-recommender \
//     node /data/project/infobox-recommender/www/js/scripts/usage-report.mjs --days 30"
//
// Options:
//   --days N        window to report (default 30; raw retention is 90)
//   --titles        list per-article records (default: counts only)
//   --adoption      candidate adoption tracking: for each 'recommend'
//                   verdict, whether the article has since gained that
//                   template (needs network access to the wiki API)
//
// Adoption tracking is a maintainer aid: it answers "do editors act on the
// recommendations?" — the evidence ROADMAP.md item 8 asks for.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const value = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const DAYS = Number(value('--days', 30));
const SHOW_TITLES = has('--titles');
const ADOPTION = has('--adoption');
const RAW_DIR = join(process.cwd(), 'usage', 'raw');

function fmt(ts) {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

async function readRecords() {
  const cutoff = Date.now() - DAYS * 86400_000;
  let files = [];
  try {
    files = (await readdir(RAW_DIR)).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    console.error(`no usage log at ${RAW_DIR} — has the service logged any analyses yet?`);
    process.exit(1);
  }
  const records = [];
  for (const f of files) {
    const text = await readFile(join(RAW_DIR, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (!rec.ts || Date.parse(rec.ts) >= cutoff) records.push(rec);
      } catch {
        /* skip malformed */
      }
    }
  }
  return records;
}

const records = await readRecords();
const analyses = records.filter((r) => r.kind !== 'page');
const pages = records.filter((r) => r.kind === 'page');

if (!analyses.length && !pages.length) {
  console.log(`No records in the last ${DAYS} days.`);
  process.exit(0);
}

console.log(`usage report — last ${DAYS} days (file: usage/raw/)`);
console.log(`page loads: ${pages.length}   analyses: ${analyses.length}`);
if (analyses.length) {
  const first = analyses.reduce((a, b) => (a.ts < b.ts ? a : b));
  const last = analyses.reduce((a, b) => (a.ts > b.ts ? a : b));
  console.log(`window: ${fmt(first.ts)} → ${fmt(last.ts)}`);
}

const byDay = new Map();
for (const r of analyses) byDay.set(r.ts.slice(0, 10), (byDay.get(r.ts.slice(0, 10)) ?? 0) + 1);
console.log('\nanalyses per day:');
for (const day of [...byDay.keys()].sort()) {
  console.log(`  ${day}  ${String(byDay.get(day)).padStart(4)}  ${'#'.repeat(byDay.get(day))}`);
}

const tally = (key) => {
  const m = new Map();
  for (const r of analyses) {
    const v = r[key];
    if (v === undefined || v === null) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log('\nverdicts:', tally('verdict').map(([k, v]) => `${k}=${v}`).join(' '));
console.log('sources: ', tally('source').map(([k, v]) => `${k}=${v}`).join(' '));
console.log('referrers:', tally('refHost').map(([k, v]) => `${k}=${v}`).join(' ') || '(none yet)');
const errors = analyses.filter((r) => r.ok === false);
if (errors.length) console.log(`errors: ${errors.length}`);

if (SHOW_TITLES) {
  console.log('\nper-article records (server-side only — never published):');
  for (const r of analyses.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1))) {
    console.log(`  ${fmt(r.ts)}  ${String(r.verdict ?? '?').padEnd(18)} ${String(r.template ?? '').padEnd(28)} ${r.title ?? ''}`);
  }
}

if (ADOPTION) {
  const recs = analyses.filter((r) => r.verdict === 'recommend' && r.template && r.title);
  if (!recs.length) {
    console.log('\nno recommend verdicts to check for adoption');
    process.exit(0);
  }
  console.log(`\nadoption check for ${recs.length} "recommend" verdict(s) (live API)…`);
  const UA =
    process.env.WIKIMEDIA_USER_AGENT ??
    'infobox-recommender/0.1 (fuzheado github; andrew.lih@gmail.com)';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let adopted = 0;
  for (const r of recs) {
    // one title at a time, paced ≥1s per Wikimedia etiquette
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=templates' +
      '&tllimit=500&tlnamespace=10&redirects=1&titles=' +
      encodeURIComponent(r.title);
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!resp.ok) {
        console.log(`  ${r.title}: HTTP ${resp.status}${resp.status === 429 ? ' (rate limited — stopping)' : ''}`);
        if (resp.status === 429) break;
        continue;
      }
      const data = await resp.json();
      const page = data?.query?.pages?.[0];
      const names = (page?.templates ?? []).map((t) => t.title.replace(/^Template:/, ''));
      const hit = names.includes(r.template);
      if (hit) adopted++;
      console.log(`  ${hit ? 'ADOPTED ' : 'not yet '} ${r.title} (wanted ${r.template})`);
    } catch (e) {
      console.log(`  ${r.title}: ${e.message}`);
    }
    await sleep(1100);
  }
  console.log(`\nadopted: ${adopted}/${recs.length} (${Math.round((100 * adopted) / recs.length)}%)`);
}
