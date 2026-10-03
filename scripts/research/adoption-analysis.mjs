// adoption-analysis.mjs — for each pre-existing analysis, determine whether the
// article had an infobox AT ANALYSIS TIME, and whether it gained one since.
//
// Best-effort reconstruction from the cache inventory + live API:
//   * "at time T" = the revision current at T (wikitext scanned for infobox-like
//     templates, using the same template family list Lead Balancer gates on)
//   * "now"      = current templates (batched)
//   * if it gained one: find the earliest revision containing it → who/when.
//
// Output: JSON to stdout (redirect to a file), plus a human summary on stderr.

import { createApi, chunk } from '../../lib/api.js';
import { readFileSync } from 'node:fs';

const INFOBOX_LIKE =
  /^\s*(infobox|taxobox|automatic[ _]taxobox|speciesbox|subspeciesbox|infraspeciesbox|virusbox|hybridbox|chembox|drugbox|geobox|starbox[ _]begin|planetbox[ _]begin|football[ _]kit|ski[ _]area|climbing[ _]area|climbox)\b/i;

const hasInfobox = (wikitext) => {
  const re = /\{\{\s*(?:template:|subst:)?\s*([^|}\n<]+)/gi;
  let m;
  while ((m = re.exec(String(wikitext || '')))) if (INFOBOX_LIKE.test(m[1].trim())) return m[1].trim();
  return null;
};

const infoboxesIn = (names) =>
  names.filter((n) => INFOBOX_LIKE.test(n)).filter((n) => !/styles\.css$/i.test(n));

const api = createApi({ cacheDir: 'cache', paceMs: 1000 });
const inv = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/inventory.json', 'utf8'));

// --- current state ---
// NOTE: `tllimit` is a per-REQUEST total for prop=templates, so big batches
// silently truncate (see engineering-notes.md). Use small batches AND follow
// the tlcontinue token to guarantee completeness.
async function currentInfoboxes(titles) {
  const map = new Map();
  for (const batch of chunk(titles, 10)) {
    const collected = new Map(batch.map((t) => [t, []]));
    let cont = null;
    do {
      const params = {
        action: 'query',
        titles: batch.join('|'),
        prop: 'templates',
        tllimit: 500,
        tlnamespace: 10,
        redirects: 1,
        formatversion: 2,
      };
      if (cont) params.tlcontinue = cont;
      const d = await api.enwiki(params);
      for (const p of d.query?.pages ?? []) {
        const names = (p.templates ?? []).map((t) => t.title.replace(/^Template:/, ''));
        collected.get(p.title)?.push(...names);
      }
      cont = d.continue?.tlcontinue ?? null;
    } while (cont);
    for (const [t, names] of collected) map.set(t, { boxes: infoboxesIn(names) });
  }
  return map;
}
const current = await currentInfoboxes(inv.rows.map((r) => r.title));

const results = [];
for (const row of inv.rows) {
  const T = new Date(row.first * 1000).toISOString();
  const cur = current.get(row.title);
  const rec = {
    title: row.title,
    firstAnalysisAt: T,
    lastAnalysisAt: new Date(row.last * 1000).toISOString(),
    infoboxNow: cur?.boxes?.length ? cur.boxes[0] : null,
    infoboxesNow: cur?.boxes ?? [],
    infoboxAtAnalysis: null,
    gainedAfterAnalysis: false,
    addedBy: null,
    addedAt: null,
    additionsInWindow: 0,
  };

  // --- state at analysis time ---
  try {
    const d = await api.enwiki({
      action: 'query',
      titles: row.title,
      prop: 'revisions',
      rvprop: 'ids|timestamp|user|comment|size|content',
      rvslots: 'main',
      rvstart: T,
      rvdir: 'older',
      rvlimit: 1,
      formatversion: 2,
    });
    const p = d.query?.pages?.[0];
    const rev = p?.revisions?.[0];
    if (rev) {
      const content = rev.slots?.main?.content ?? '';
      rec.revAtAnalysis = { revid: rev.revid, timestamp: rev.timestamp, size: rev.size };
      rec.infoboxAtAnalysis = hasInfobox(content);
    }
  } catch (e) {
    rec.error = String(e.message ?? e);
  }

  // --- did it gain one after the analysis? ---
  if (!rec.infoboxAtAnalysis && rec.infoboxNow) {
    rec.gainedAfterAnalysis = true;
    try {
      const d = await api.enwiki({
        action: 'query',
        titles: row.title,
        prop: 'revisions',
        rvprop: 'ids|timestamp|user|comment|size|content',
        rvslots: 'main',
        rvstart: new Date().toISOString(),
        rvdir: 'older',
        rvlimit: 100,
        formatversion: 2,
      });
      const revs = (d.query?.pages?.[0]?.revisions ?? []).slice().reverse(); // oldest → newest
      rec.additionsInWindow = revs.length;
      for (const rev of revs) {
        if (Date.parse(rev.timestamp) < row.first * 1000) continue;
        const hit = hasInfobox(rev.slots?.main?.content ?? '');
        if (hit) {
          rec.addedBy = rev.user;
          rec.addedAt = rev.timestamp;
          rec.addedTemplate = hit;
          rec.addedComment = rev.comment ?? '';
          rec.addedRevid = rev.revid;
          break;
        }
      }
    } catch (e) {
      rec.error = (rec.error ? rec.error + '; ' : '') + String(e.message ?? e);
    }
  }

  results.push(rec);
  const status = rec.infoboxAtAnalysis
    ? `had:${rec.infoboxAtAnalysis}`
    : rec.infoboxNow
      ? rec.gainedAfterAnalysis
        ? `GAINED:${rec.addedTemplate ?? rec.infoboxNow} by ${rec.addedBy ?? '?'} at ${rec.addedAt ?? '?'}`
        : `now:${rec.infoboxNow}`
      : 'bare';
  console.error(`${row.first ? T.slice(0, 16) : '?'}  ${row.title.slice(0, 42).padEnd(44)} ${status}`);
}

const gained = results.filter((r) => r.gainedAfterAnalysis);
console.error(`\n=== summary ===`);
console.error(`articles: ${results.length}`);
console.error(`had an infobox at analysis time: ${results.filter((r) => r.infoboxAtAnalysis).length}`);
console.error(`bare at analysis time: ${results.filter((r) => !r.infoboxAtAnalysis).length}`);
console.error(`GAINED one since: ${gained.length}`);
console.error(`still bare: ${results.filter((r) => !r.infoboxAtAnalysis && !r.infoboxNow).length}`);

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 1));
