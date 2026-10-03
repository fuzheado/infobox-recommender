// phantom-box-check.mjs — does prop=templates over-report "has an infobox"?
//
// lib/census.js decides whether a peer is boxed from prop=templates. That API
// reports templates *used by transcluded templates* too (verified: Golgi
// apparatus → {{Cell biology}} → {{Infobox}}), so a page with no infobox of
// its own can still come back as boxed.
//
// This audits every analysed article: prop=templates verdict vs wikitext.

import { createApi } from '../../lib/api.js';
import { readFileSync } from 'node:fs';

const INFOBOX_LIKE =
  /^\s*(infobox|taxobox|automatic[ _]taxobox|speciesbox|subspeciesbox|infraspeciesbox|virusbox|hybridbox|chembox|drugbox|geobox|starbox[ _]begin|planetbox[ _]begin|football[ _]kit|ski[ _]area|climbing[ _]area|climbox)\b/i;

const directBox = (wikitext) => {
  const re = /\{\{\s*(?:template:|subst:)?\s*([^|}\n<]+)/gi;
  let m;
  while ((m = re.exec(String(wikitext || '')))) if (INFOBOX_LIKE.test(m[1].trim())) return m[1].trim();
  return null;
};

const api = createApi({ cacheDir: 'cache', paceMs: 1000 });
const inv = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const rows = [];
for (const r of inv.rows) {
  const t = await api.enwiki({
    action: 'query',
    titles: r.title,
    prop: 'templates',
    tllimit: 500,
    tlnamespace: 10,
    formatversion: 2,
  });
  const viaTemplates = (t.query?.pages?.[0]?.templates ?? [])
    .map((x) => x.title.replace(/^Template:/, ''))
    .filter((n) => INFOBOX_LIKE.test(n) && !/styles\.css$/i.test(n));

  const c = await api.enwiki({
    action: 'query',
    titles: r.title,
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    rvlimit: 1,
    formatversion: 2,
  });
  const wt = c.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? '';
  const viaWikitext = directBox(wt);

  const phantom = viaTemplates.length > 0 && !viaWikitext;
  rows.push({ title: r.title, viaTemplates: viaTemplates[0] ?? null, viaWikitext, phantom });
  if (phantom) console.error(`PHANTOM  ${r.title.padEnd(45)} prop=templates says "${viaTemplates[0]}", wikitext has none`);
}

const phantoms = rows.filter((r) => r.phantom);
console.error(`\naudited: ${rows.length} articles`);
console.error(`prop=templates reports a box: ${rows.filter((r) => r.viaTemplates).length}`);
console.error(`wikitext actually has one:  ${rows.filter((r) => r.viaWikitext).length}`);
console.error(`PHANTOM (reported but absent): ${phantoms.length}`);
console.error(`missed (wikitext has one, API says none): ${rows.filter((r) => !r.viaTemplates && r.viaWikitext).length}`);
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1));
