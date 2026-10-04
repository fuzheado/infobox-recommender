// lib/peers.js — Stage A: peer discovery.
//
// Ranked signals (per research doc §5):
//   1. Wikidata P31 (instance of) siblings — same class, cross-language.
//      Class instance counts come from early-terminating per-class samples
//      (keyed by CLASS QID, so the expensive query is shared by every
//      article of that class via the disk cache). Classes >500 instances are
//      too heterogeneous to census (e.g. Q5 human) and are skipped.
//   2. Most specific shared categories — the article's non-maintenance
//      categories ranked by member count (categoryinfo), fewest first.
//   3. WikiProject banners on the talk page (informational; the {{Infobox
//      requested}} pointer per the doc).
//
// The three signals run concurrently (request starts stay >=1s apart via the
// shared api pacing; latencies overlap). `log` emits progress events for the
// web UI / SSE stream.

import { chunk } from './api.js';

export const MAINTENANCE_CATEGORY_RE =
  /^(Articles |Wikipedia |Pages |CS1 |Use (dmy|British|American|Oxford) (dates|English)|Commons category|All Wikipedia|All articles|All pages|All stub|Webarchive|Coordinates on Wikidata|Short description)|( stubs?| stub categories)$/i;

// Intersection categories: lifecycle/year groupings that are NOT genre
// categories ("1960 establishments in Texas" mixes radio stations, schools
// and football teams). Events' "X in YYYY" categories stay (they ARE genre
// for events, e.g. "1346 in the Holy Roman Empire").
export const INTERSECTION_CATEGORY_RE =
  /^\d{4}s? (establishments|disestablishments) |(established|disestablished|founded|dissolved|created) in \d{4}/i;

// P31 classes with more instances than this are too heterogeneous to census
// (e.g. Q5 human) — their "siblings" would be noise. Skip them.
export const MAX_CLASS_INSTANCES = 500;

// Early-terminating sample instead of COUNT: WDQS stops at LIMIT, so huge
// classes (10M-row counts) answer fast — any class at the cap is "big".
// Exact per-class counts for small classes are computed client-side.
const SPARQL_CLASS_SAMPLE = `
SELECT ?item WHERE {
  ?item wdt:P31 wd:CLASS .
}
LIMIT 501
`.trim();

const SPARQL_SIBLINGS_FOR_CLASS = `
SELECT DISTINCT ?article WHERE {
  ?item wdt:P31 wd:CLASS .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
LIMIT 100
`.trim();

// Same-type pointers: items sharing the article's P39 (position held — all
// presidents share "President of the United States"), P179 (part of the
// series — episodes of one show), or P361 (part of — states of one
// country). Only same-kind things share these values.
const SPARQL_SHARED_VALUE = `
SELECT DISTINCT ?article WHERE {
  VALUES ?v { VALUES_PLACEHOLDER }
  ?item wdt:PROP ?v .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
LIMIT 200
`.trim();

// P155/P156 chain: only same-type things can precede/succeed each other.
const SPARQL_CHAIN_NEIGHBORS = `
SELECT DISTINCT ?article WHERE {
  wd:QID wdt:P155|wdt:P156 ?n .
  ?article schema:about ?n ; schema:isPartOf <https://en.wikipedia.org/> .
}
LIMIT 50
`.trim();

const titleFromArticleUrl = (url) =>
  decodeURIComponent(url.split('/wiki/')[1]).replaceAll('_', ' ');

const noop = () => {};

export async function discoverPeers({
  api,
  title,
  qid,
  p31Classes, // optional: pre-fetched P31 class QIDs (from analyze's wbgetclaims) — avoids a second claims fetch
  pointerClaims = {}, // {p39, p179, p361, p155, p156}: value QIDs from wbgetclaims
  maxCategoryCandidates = 5,
  maxCategoryMembers = 50,
  maxTotal = 150,
  log = noop,
} = {}) {
  const sparqlPeers = new Map(); // title -> Set(class QIDs)
  const wdPeers = new Map(); // title -> Set('wd:P39' style tags)
  const categoryPeers = new Set();
  const banners = [];
  const counts = { sparql: 0, category: 0, wd: 0, total: 0, classes: null };

  log({ stage: 'peers', label: 'Discovering peers' });

  // --- three independent signals run concurrently ---
  // (1a) article's P31 classes (wikibase, fast — skipped when p31Classes is
  // given); (2) categories + member counts; (3) talk-page banners. Request
  // starts stay >=1s apart (shared api pacing); latencies overlap.
  const [wdData, catsData, bannersData] = await Promise.all([
    qid && !p31Classes
      ? api
          .wikidata({ action: 'wbgetentities', ids: qid, props: 'claims', formatversion: 2 })
          .catch((e) => {
            console.warn(`  [peers] wbgetentities failed: ${e.message}`);
            return null;
          })
      : Promise.resolve(null),
    (async () => {
      try {
        const data = await api.enwiki({
          action: 'query',
          prop: 'categories',
          titles: title,
          cllimit: 500,
          // NB: prop=categories does NOT return a `hidden` flag in the
          // response — hidden categories must be excluded via clshow.
          clshow: '!hidden',
        });
        return data;
      } catch (e) {
        console.warn(`  [peers] categories failed: ${e.message}`);
        return null;
      }
    })(),
    (async () => {
      try {
        const data = await api.enwiki({
          action: 'query',
          prop: 'templates',
          titles: `Talk:${title}`,
          tllimit: 500,
          tlnamespace: 10,
        });
        return data;
      } catch (e) {
        console.warn(`  [peers] banners failed: ${e.message}`);
        return null;
      }
    })(),
  ]);

  // --- Signal 3: banners (from the concurrent fetch) ---
  for (const tpl of bannersData?.query?.pages?.[0]?.templates ?? []) {
    const name = tpl.title.replace(/^Template:/, '');
    if (name.startsWith('WikiProject') || name.startsWith('WP ')) banners.push(name);
  }

  // --- Signal 1b: Wikidata same-type pointers ---
  // Per-VALUE queries: each P39 position / P179 series / P361 set is a clean
  // same-kind group (P39=President of the United States -> all presidents),
  // cached per value so every president reuses the POTUS query. P155/P156
  // chain neighbors: only same-type things precede/succeed each other.
  const wdGroups = []; // {kind:'wd', name, size, members}
  if (qid) {
    try {
      const tasks = [];
      for (const prop of ['P39', 'P179', 'P361']) {
        for (const v of (pointerClaims[prop.toLowerCase()] ?? []).slice(0, 6)) {
          tasks.push({ prop, value: v, kind: 'set' });
        }
      }
      const chainVals = [...(pointerClaims.p155 ?? []), ...(pointerClaims.p156 ?? [])];
      if (chainVals.length) tasks.push({ prop: 'P155/P156', kind: 'chain' });
      const PER_VALUE_LIMIT = 60;
      const results = await Promise.all(
        tasks.map(async (t) => {
          if (t.kind === 'chain') {
            return { ...t, rows: await api.sparql(SPARQL_CHAIN_NEIGHBORS.replace('QID', qid)) };
          }
          // One request per PROPERTY (a UNION of per-value subqueries) instead
          // of one per value: a politician with six P39 values used to issue
          // six WDQS queries — up to 19 across the three properties — which the
          // pacer then spread over many waves. Each value keeps its OWN
          // LIMIT 60 inside the UNION, because a single shared LIMIT starves
          // the later values (measured: George Washington lost 19 officeholder
          // peers and the verdict flipped to weak-signal).
          const vals = (pointerClaims[t.prop.toLowerCase()] ?? []).slice(0, 6);
          if (!vals.length) return { ...t, rows: [] };
          const branches = vals
            .map(
              (v) =>
                `{ SELECT DISTINCT ?article ?v WHERE { VALUES ?v { wd:${v} } ` +
                `?item wdt:${t.prop} ?v . ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . } ` +
                `LIMIT ${PER_VALUE_LIMIT} }`
            )
            .join(' UNION ');
          const rows = await api.sparql(`SELECT DISTINCT ?article ?v WHERE { ${branches} }`);
          // ?v comes back as a URI — normalise to the QID so the tier labels
          // (and the per-value grouping) match what the claims gave us.
          const byValue = new Map();
          for (const r of rows) {
            const qid_ = String(r.v ?? '').split('/').pop();
            if (!qid_) continue;
            if (!byValue.has(qid_)) byValue.set(qid_, []);
            if (byValue.get(qid_).length < PER_VALUE_LIMIT) byValue.get(qid_).push(r);
          }
          return { ...t, multi: [...byValue.entries()].map(([v, rs]) => ({ value: v, rows: rs })) };
        })
      );
      // labels for the tier display (P39: President of the United States)
      const valueQids = [
        ...new Set(['P39', 'P179', 'P361'].flatMap((p) => (pointerClaims[p.toLowerCase()] ?? []).slice(0, 6))),
      ];
      const labelMap = {};
      if (valueQids.length) {
        const lab = await api
          .wikidata({ action: 'wbgetentities', ids: valueQids.join('|'), props: 'labels', languages: 'en', formatversion: 2 })
          .catch(() => null);
        for (const [q, e] of Object.entries(lab?.entities ?? {})) labelMap[q] = e?.labels?.en?.value ?? q;
      }
      // 'set' tasks carry their per-value groups; the chain task carries rows.
      const flat = results.flatMap((r) =>
        r.multi ? r.multi.map((m) => ({ prop: r.prop, value: m.value, rows: m.rows })) : [r]
      );
      for (const { prop, value, rows } of flat) {
        const members = rows
          .map((r) => titleFromArticleUrl(r.article))
          .filter((t) => t && t !== title);
        if (members.length >= 2) {
          for (const t of members) {
            if (!wdPeers.has(t)) wdPeers.set(t, new Set());
            wdPeers.get(t).add(`wd:${prop}`);
          }
          wdGroups.push({
            kind: 'wd',
            name: value ? `${prop}: ${labelMap[value] ?? value}` : prop,
            size: members.length,
            members,
          });
        }
      }
      if (wdGroups.length) {
        log({ stage: 'peers', label: 'Wikidata pointer peers', props: wdGroups.map((g) => g.name).join(',') });
      }
    } catch (e) {
      console.warn(`  [peers] wd pointers failed: ${e.message}`);
    }
  }

  // --- Signal 1: Wikidata P31 siblings ---
  if (qid) {
    try {
      const claims = p31Classes
        ? { P31: p31Classes.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })) }
        : (wdData?.entities?.[qid]?.claims ?? {});
      const classes = (claims.P31 ?? [])
        .map((c) => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
      // per-class instance samples (early-terminating LIMIT), keyed by class
      // QID so the URL — and thus the disk cache — is shared across every
      // article of the same class
      const samples = await Promise.all(
        classes.map((cls) => api.sparql(SPARQL_CLASS_SAMPLE.replace('CLASS', cls)))
      );
      const smallClasses = classes.filter((cls, i) => {
        const n = samples[i].length; // rows at the cap (501) mean "big"
        return n <= MAX_CLASS_INSTANCES;
      });
      const siblingSets = await Promise.all(
        smallClasses.map((cls) =>
          api.sparql(SPARQL_SIBLINGS_FOR_CLASS.replace('CLASS', cls))
        )
      );
      for (let i = 0; i < smallClasses.length; i++) {
        const cls = smallClasses[i];
        for (const { article } of siblingSets[i]) {
          if (!article || !article.includes('/wiki/')) continue;
          const t = titleFromArticleUrl(article);
          if (t === title) continue;
          if (!sparqlPeers.has(t)) sparqlPeers.set(t, new Set());
          sparqlPeers.get(t).add(cls);
        }
      }
      log({ stage: 'peers', label: 'Same-class (P31) siblings', sparql: sparqlPeers.size, classes: smallClasses.length });
      counts.classes = { total: classes.length, used: smallClasses.length };
    } catch (e) {
      console.warn(`  [peers] SPARQL failed: ${e.message}`);
    }
  }

  // --- Signal 2: most specific shared categories (fewest members) ---
  // categoryinfo member counts replace the name-length heuristic (H1 in
  // signals.md). Intersection categories ("1960 establishments in Texas")
  // are excluded — they mix genres. Fallback: name length, as before.
  const MIN_CATEGORY_MEMBERS = 3;
  const MAX_CATEGORY_MEMBERS = 1000;
  const catGroups = []; // {kind:'category', name, size, members: []}
  try {
    const cats = (catsData?.query?.pages?.[0]?.categories ?? [])
      .filter(
        (c) =>
          !c.hidden &&
          !MAINTENANCE_CATEGORY_RE.test(c.title.replace(/^Category:/, '')) &&
          !INTERSECTION_CATEGORY_RE.test(c.title.replace(/^Category:/, ''))
      )
      .map((c) => c.title);
    const info = {}; // category title -> member count
    const infoBatches = await Promise.all(
      chunk(cats, 50).map((batch) =>
        api.enwiki({ action: 'query', prop: 'categoryinfo', titles: batch.join('|') })
      )
    );
    for (const d of infoBatches) {
      for (const p of d.query?.pages ?? []) info[p.title] = p.categoryinfo?.pages ?? Infinity;
    }
    const ranked = cats
      .map((t) => ({ title: t, members: info[t] ?? Infinity }))
      .filter((c) => c.members >= MIN_CATEGORY_MEMBERS && c.members <= MAX_CATEGORY_MEMBERS)
      .sort((a, b) => a.members - b.members || b.title.length - a.title.length)
      .slice(0, maxCategoryCandidates);
    const deep = ranked.length
      ? ranked
      : cats
          .map((t) => ({ title: t, members: Infinity }))
          .sort((a, b) => b.title.length - a.title.length)
          .slice(0, maxCategoryCandidates);
    const memberSets = await Promise.all(
      deep.map((cat) =>
        api.enwiki({
          action: 'query',
          list: 'categorymembers',
          cmtitle: cat.title,
          cmnamespace: 0,
          cmlimit: maxCategoryMembers,
        })
      )
    );
    for (let i = 0; i < deep.length; i++) {
      const members = memberSets[i].query?.categorymembers ?? [];
      catGroups.push({
        kind: 'category',
        name: deep[i].title.replace(/^Category:/, ''),
        size: deep[i].members,
        members: members.map((m) => m.title).filter((t) => t !== title),
      });
      for (const m of members) {
        if (m.title !== title) categoryPeers.add(m.title);
      }
    }
    log({ stage: 'peers', label: 'Category peers', category: categoryPeers.size });
    counts.category = categoryPeers.size;
  } catch (e) {
    console.warn(`  [peers] categories failed: ${e.message}`);
  }

  // --- Tier groups: classes + categories ranked by size (tightest first) ---
  // "Start small and adapt": each peer is assigned the tightest tier that
  // contains it; the decision layer evaluates tiers in order and expands
  // only when the current tier is not decisive (Dallas Cowboys -> NFL teams
  // (32) before the wider American-football pool).
  const classGroups = [];
  for (const cls of classByPeerKeys()) {
    const members = [...sparqlPeers.entries()]
      .filter(([, set]) => set.has(cls))
      .map(([t]) => t);
    if (members.length >= 2) {
      classGroups.push({ kind: 'class', name: cls, size: members.length, members });
    }
  }
  const groups = [...classGroups, ...wdGroups, ...catGroups].sort(
    (a, b) => a.size - b.size || a.name.localeCompare(b.name)
  );
  const tierByPeer = new Map(); // title -> smallest tier index containing it
  groups.forEach((g, i) => {
    for (const t of g.members) {
      if (!tierByPeer.has(t)) tierByPeer.set(t, i + 1); // 1-based tiers
    }
  });

  // Combine; keep per-peer origin for the sub-cluster check in census.
  // Order matters for the 150-peer cap: sparql, then CATEGORY, then wd
  // pointers last, so pointer peers never displace category peers.
  const origin = new Map(); // title -> Set('sparql' | 'wd' | 'category')
  for (const t of sparqlPeers.keys()) origin.set(t, new Set(['sparql']));
  for (const t of categoryPeers) {
    if (!origin.has(t)) origin.set(t, new Set());
    origin.get(t).add('category');
  }
  for (const t of wdPeers.keys()) {
    if (!origin.has(t)) origin.set(t, new Set());
    origin.get(t).add('wd');
  }

  const peers = [...origin.keys()].slice(0, maxTotal);
  counts.sparql = sparqlPeers.size;
  counts.wd = wdPeers.size;
  counts.total = peers.length;
  log({
    stage: 'peers',
    label: 'Peer set ready',
    sparql: sparqlPeers.size,
    category: categoryPeers.size,
    total: peers.length,
  });

  return {
    qid,
    peers,
    peerOrigin: Object.fromEntries([...origin.entries()].map(([t, s]) => [t, [...s]])),
    classByPeer: Object.fromEntries(
      [...sparqlPeers.entries()].map(([t, s]) => [t, [...s]])
    ),
    peerTier: Object.fromEntries(tierByPeer),
    groups: groups.map((g) => ({ kind: g.kind, name: g.name, size: g.size })),
    banners,
    counts,
  };

  function classByPeerKeys() {
    const keys = new Set();
    for (const set of sparqlPeers.values()) for (const c of set) keys.add(c);
    return [...keys];
  }
}
