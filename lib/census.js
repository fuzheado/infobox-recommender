// lib/census.js — Stage B: peer infobox census.
//
// Batched prop=templates calls. tllimit=500 is a per-REQUEST total (not
// per-page) and large batches silently truncate template lists mid-alphabet
// (right where "Infobox…" sorts) when the budget lands exactly on a page
// boundary — so completeness is guaranteed by: 50-title batches + tltitle /
// tlcontinue continuation rounds + suspect-only re-queue passes (10-title
// batches) + a final individual pass (single-title queries cannot be
// starved). Same call returns pageprops/info so we can prune non-article
// peers (redirects, disambiguation, missing, ns!=0, list/set-index
// shortdescs) and detect sidebars (which may already serve the infobox
// role).
//
// Sub-cluster split: peers sharing the article's P31 class ('sparql' origin)
// vs category-only peers — surfaces the "event vs concept" case from the doc
// (26/27 boxed elections vs 0/7 bare institution articles).

export const INFOBOX = (name) =>
  !name.includes('/') && // subcomponents: styles.css, /denomination, /entry…
  (name.startsWith('Infobox') ||
    ['Taxobox', 'Geobox', 'Chembox', 'Drugbox', 'Infobox3cols', 'Speciesbox', 'Automatic taxobox'].includes(name));

const SIDEBAR = (name) => name.startsWith('Sidebar');

// Structural non-articles that pageprops can't flag but short descriptions
// can: set-index articles and "list of" pages are bare BY CONVENTION and
// drag coverage down + create fake bare clusters (Hypothesis H2, signals.md).
// The shortdesc is already in the census response (pageprops) — free filter.
const SHORTDESC_EXCLUDE =
  /^(list of|lists of|set index|wikimedia|index of|disambiguation|timeline of|outline of)/i;

// Supporting/legacy templates that ride along with a real infobox but are
// never the primary one: the generic meta-template, the legacy 3-column
// wrapper, and medal-record collapsibles (Gaelic games articles stack all
// of these on top of their biography box).
// Supporting/legacy templates that ride along with a real infobox but are
// never the primary one: the generic meta-template, the legacy 3-column
// wrapper, medal-record collapsibles (Gaelic games articles stack all of
// these on top of their biography box), embedded child boxes (US state
// pages embed {{Infobox region symbols}} inside {{Infobox U.S. state}};
// Mount Everest embeds the UNESCO World Heritage child box), and
// "(meta)" meta-templates ({{Infobox isotopes (meta)}}).
export const SUPPORTING_INFOBOXES = new Set([
  'Infobox',
  'Infobox3cols',
  'Infobox medal templates',
  'Infobox region symbols',
  'Infobox UNESCO World Heritage Site',
  'Infobox designation list', // embedded child box (heritage designations)
]);

export const isSupportingInfobox = (name) =>
  SUPPORTING_INFOBOXES.has(name) ||
  name.endsWith('(meta)') ||
  name.endsWith(' isotopes'); // per-element isotope-table boxes ({{Infobox americium isotopes}})

// Generic place boxes that lose to any more specific candidate: a US state
// article stacks {{Infobox U.S. state}} + {{Infobox settlement}} — the
// settlement box (18 chars, and "U.S." is short) would win on length alone.
const GENERIC_PLACE = new Set(['Infobox settlement', 'Infobox subdivision']);

// Pick the PRIMARY infobox for a page: exclude supporting boxes, penalize
// generic place boxes, then take the most specific (longest name). Falls
// back to the longest name for legacy-only pages. (`transcludes` is accepted
// for the future specificity ladder but not yet used — transclusion-based
// ranking proved label-divergent for person-family stacks.)
export function primaryInfobox(boxes, transcludes = {}) {
  const candidates = boxes.filter((n) => !isSupportingInfobox(n));
  const pool = candidates.length ? candidates : boxes;
  if (!pool.length) return null;
  const score = (a) => a.length - (GENERIC_PLACE.has(a) ? 1000 : 0);
  return [...pool].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
}

import { chunk, has } from './api.js';
import { MAINTENANCE_CATEGORY_RE } from './peers.js';

// Stage B+: sub-cluster the BARE peers — categories they share with each
// other reveal a possible "no infobox customary" sub-genre (the doc's
// event-vs-concept case: 7 bare institution articles sharing the same
// category while 26 boxed elections share another).
export async function findBareClusters({ api, bareTitles, minMembers = 3, maxTitles = 60 }) {
  const titles = bareTitles.slice(0, maxTitles);
  if (titles.length < minMembers) return [];
  const shared = new Map(); // category name -> Set(bare titles)
  for (const batch of chunk(titles, 50)) {
    const data = await api.enwiki({
      action: 'query',
      titles: batch.join('|'),
      prop: 'categories',
      cllimit: 100,
      clshow: '!hidden', // prop=categories returns no hidden flag — exclude via clshow
    });
    for (const page of data.query?.pages ?? []) {
      for (const c of page.categories ?? []) {
        const name = c.title.replace(/^Category:/, '');
        if (MAINTENANCE_CATEGORY_RE.test(name)) continue;
        if (!shared.has(name)) shared.set(name, new Set());
        shared.get(name).add(page.title);
      }
    }
  }
  return [...shared.entries()]
    .filter(([, s]) => s.size >= minMembers)
    .map(([category, s]) => ({ category, n: s.size, members: [...s] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
}

// Resolve template redirects + direct transclusions (one batched call):
// {{Infobox prepared food}} redirects to {{Infobox food}}; and if template A
// transcludes template B ({{Infobox U.S. state}} is built on {{Infobox
// settlement}}), A is the specialization. Returns {redirectMap,
// transcludes} keyed by canonical (post-redirect) template name.
export async function fetchTemplateFacts(api, names) {
  const redirectMap = {};
  const transcludes = {}; // canonical name -> Set(infobox-family names it directly transcludes)
  const uniq = [...new Set(names)].filter(Boolean);
  for (const batch of chunk(uniq, 50)) {
    const d = await api.enwiki({
      action: 'query',
      titles: batch.map((n) => `Template:${n}`).join('|'),
      redirects: 1,
      prop: 'templates',
      tllimit: 500,
      tlnamespace: 10,
      formatversion: 2,
    });
    for (const r of d.query?.redirects ?? []) {
      redirectMap[r.from.replace(/^Template:/, '')] = r.to.replace(/^Template:/, '');
    }
    for (const p of d.query?.pages ?? []) {
      const canon = p.title.replace(/^Template:/, '');
      transcludes[canon] = new Set(
        (p.templates ?? [])
          .map((t) => t.title.replace(/^Template:/, ''))
          .filter((n) => INFOBOX(n))
      );
    }
  }
  return { redirectMap, transcludes };
}

// Back-compat wrapper.
export const resolveTemplateRedirects = (api, names) =>
  fetchTemplateFacts(api, names).then((r) => r.redirectMap);

const noop = () => {};

// Fetch complete template lists for a set of pages.
//
// tllimit=500 is a per-REQUEST total (not per-page), and the API silently
// drops trailing pages when the budget lands exactly on a page boundary (no
// continue token) — so this is a multi-pass loop:
//   - big batches (50 titles) + tltitle continuation rounds: each round
//     serves another ~500 templates, so ~15 rounds cover 150 peers instead
//     of 30 separate small-batch calls;
//   - a batch whose cumulative template count reached the 500 cap may have
//     starved its trailing pages — empty results there are SUSPECT and are
//     re-queued; a batch that ended below the cap is complete, so its empty
//     pages are genuinely bare;
//   - re-queue passes use 10-title batches (10 typical pages ≈ 300 templates
//     < 500, so truncation is effectively impossible and genuinely bare
//     pages verify as bare); anything still suspect after that is resolved
//     with individual queries, which cannot be starved at all.
async function fetchPageData(api, titles, log) {
  const pageData = new Map(); // title -> {templates: [], page}
  let toFetch = [...titles];
  let pass = 0;
  while (toFetch.length && pass < 3) {
    const next = [];
    const batchSize = pass === 0 ? 50 : 10;
    for (const batch of chunk(toFetch, batchSize)) {
      const params = {
        action: 'query',
        titles: batch.join('|'),
        prop: 'templates|pageprops|info',
        tllimit: 500,
        tlnamespace: 10,
      };
      let cumulative = 0;
      for (let round = 0; ; round++) {
        const data = await api.enwiki(params);
        for (const page of data.query?.pages ?? []) {
          if (!pageData.has(page.title)) pageData.set(page.title, { templates: [], page });
          const tpls = page.templates ?? [];
          pageData.get(page.title).templates.push(...tpls.map((t) => t.title));
          cumulative += tpls.length;
        }
        const cont = data.continue;
        // NB: with multiple props (templates|pageprops|info) the API uses the
        // GENERIC continuation: `continue: '||pageprops|info'` + the module
        // param `tlcontinue` (pageid|ns|title). A single-prop query instead
        // returns `tltitle`. Check both, echo both back.
        const resume = cont?.tltitle ?? cont?.tlcontinue;
        if (!resume) break;
        if (round >= 20) {
          console.warn('  [census] continuation exceeded 20 rounds; remainder dropped');
          break;
        }
        Object.assign(params, cont); // echo back continue (+ tltitle/tlcontinue)
      }
      // budget exhausted => trailing empties may be starved; re-queue them
      if (cumulative >= 500) {
        for (const t of batch) {
          const got = pageData.get(t);
          if (got && got.templates.length === 0) next.push(t);
        }
      }
    }
    toFetch = next;
    pass++;
    log({ stage: 'census', done: titles.length - toFetch.length, total: titles.length });
  }
  // final safety: individual queries cannot be starved — resolves any page
  // still suspect (only possible after truncation in a 10-title batch, i.e.
  // a page with >50 templates in a batch of near-maximum size)
  for (const t of toFetch) {
    const d = await api.enwiki({
      action: 'query',
      titles: t,
      prop: 'templates|pageprops|info',
      tllimit: 500,
      tlnamespace: 10,
    });
    const p = d.query.pages[0];
    pageData.set(t, {
      templates: (p.templates ?? []).map((x) => x.title),
      page: p,
    });
  }
  return pageData;
}

// Stats for any subset of evaluated peers (used for the flat census AND the
// tiered neighborhood evaluation).
export function statsOf(evaluated) {
  const total = evaluated.length;
  const withInfobox = evaluated.filter((p) => p.infoboxes.length > 0);
  const withSpecific = withInfobox.filter((p) => p.primary).length;
  const distribution = {};
  for (const p of withInfobox) {
    if (p.primary) distribution[p.primary] = (distribution[p.primary] ?? 0) + 1;
  }
  const dominantEntry = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    n: total,
    withInfobox: withInfobox.length,
    coverage: total ? withInfobox.length / total : 0,
    distribution,
    dominant: dominantEntry ? { template: dominantEntry[0], count: dominantEntry[1] } : null,
    dominanceShare: dominantEntry ? dominantEntry[1] / (withSpecific || 1) : 0,
  };
}

export async function runCensus({ api, peers, peerOrigin = {}, peerTier = {}, log = noop }) {
  const evaluated = []; // {title, origin, infoboxes, sidebars}
  const skipped = [];

  log({ stage: 'census', label: 'Peer infobox census', done: 0, total: peers.length });
  const pageData = await fetchPageData(api, peers, log);

  for (const [title, { templates: raw, page }] of pageData) {
    if (page.missing) { skipped.push({ title, why: 'missing' }); continue; }
    if (page.ns !== 0) { skipped.push({ title, why: 'ns' }); continue; }
    if (has(page, 'redirect')) {
      skipped.push({ title, why: 'redirect' });
      continue;
    }
    if (has(page.pageprops, 'disambiguation')) {
      skipped.push({ title, why: 'disambiguation' });
      continue;
    }
    const sd = page.pageprops?.['wikibase-shortdesc'] ?? '';
    if (SHORTDESC_EXCLUDE.test(sd)) {
      skipped.push({ title, why: 'shortdesc' });
      continue;
    }
    const all = raw.map((t) => t.replace(/^Template:/, ''));
    const infoboxes = all.filter((n) => INFOBOX(n));
    evaluated.push({
      title,
      origin: peerOrigin[title] ?? [],
      tier: peerTier[title] ?? Infinity,
      infoboxes,
      primary: primaryInfobox(infoboxes),
      sidebars: all.filter((n) => SIDEBAR(n)),
    });
  }

  // Normalize template redirects and compute transclusion-based specificity
  // (one batched call) so primaries and the distribution use canonical names
  // ({{Infobox prepared food}} -> {{Infobox food}}) and the specialization
  // wins over the generic (U.S. state over settlement).
  const { redirectMap, transcludes } = await fetchTemplateFacts(
    api,
    [...new Set(evaluated.flatMap((p) => p.infoboxes))]
  );
  if (Object.keys(redirectMap).length) {
    for (const p of evaluated) {
      p.infoboxes = [...new Set(p.infoboxes.map((n) => redirectMap[n] ?? n))];
    }
  }
  for (const p of evaluated) p.primary = primaryInfobox(p.infoboxes, transcludes);
  const stats = statsOf(evaluated);
  const total = stats.n;
  const withInfobox = stats.withInfobox;
  const coverage = stats.coverage;
  const distribution = stats.distribution;
  const dominantEntry = stats.dominant;
  const dominanceShare = stats.dominanceShare;
  const bare = evaluated.filter((p) => p.infoboxes.length === 0);

  // Sub-cluster split: same-P31 peers vs category-only peers (n>=3 to count).
  // Returns coverage + the dominant template WITHIN the group — the doc's
  // event-vs-concept case (26/27 boxed elections vs 0/7 bare institutions)
  // means within-genre dominance is the strongest recommendation signal.
  const split = (isSparql) => {
    const g = evaluated.filter((p) => p.origin.includes('sparql') === isSparql);
    if (g.length < 3) return null;
    const boxed = g.filter((p) => p.infoboxes.length > 0);
    const dist = {};
    for (const p of boxed) {
      if (p.primary) dist[p.primary] = (dist[p.primary] ?? 0) + 1;
    }
    const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0] ?? null;
    return {
      n: g.length,
      boxed: boxed.length,
      coverage: boxed.length / g.length,
      dominant: top ? { template: top[0], count: top[1] } : null,
      dominantShare: top ? top[1] / boxed.length : 0,
    };
  };

  return {
    total,
    withInfobox,
    coverage,
    distribution,
    dominant: dominantEntry, // statsOf already returns {template, count}
    dominanceShare,
    bare: bare.map((p) => p.title),
    sidebarOnly: bare.filter((p) => p.sidebars.length > 0).map((p) => p.title),
    subCluster: { byClass: split(true), byCategoryOnly: split(false) },
    skipped,
    evaluated,
  };
}
