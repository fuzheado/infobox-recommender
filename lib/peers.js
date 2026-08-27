// lib/peers.js — Stage A: peer discovery.
//
// Ranked signals (per research doc §5):
//   1. Wikidata P31 (instance of) siblings — same class, cross-language.
//      Via WDQS so we get enwiki article URLs directly, plus the class QID
//      per peer (used later for the sub-cluster split).
//   2. Deepest shared categories — the article's non-maintenance categories,
//      longest names first (name length is a cheap specificity heuristic),
//      then their article members.
//   3. WikiProject banners on the talk page (informational; the {{Infobox
//      requested}} pointer per the doc).

import { chunk } from './api.js';

export const MAINTENANCE_CATEGORY_RE =
  /^(Articles |Wikipedia |Pages |CS1 |Use (dmy|British|American|Oxford) dates?|Commons category|All Wikipedia|All articles|Coordinates on Wikidata|Short description)/;

// P31 classes with more instances than this are too heterogeneous to census
// (e.g. Q5 human) — their "siblings" would be noise. Skip them.
export const MAX_CLASS_INSTANCES = 500;

// Early-terminating sample instead of COUNT: WDQS stops at LIMIT, so huge
// classes (10M-row counts) answer fast — any class at the cap is "big".
// Exact per-class counts for small classes are computed client-side.
const SPARQL_CLASS_SAMPLE = `
SELECT ?class WHERE {
  wd:QID wdt:P31 ?class .
  ?item wdt:P31 ?class .
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

const titleFromArticleUrl = (url) =>
  decodeURIComponent(url.split('/wiki/')[1]).replaceAll('_', ' ');

export async function discoverPeers({
  api,
  title,
  qid,
  maxCategoryCandidates = 5,
  maxCategoryMembers = 50,
  maxTotal = 150,
} = {}) {
  const sparqlPeers = new Map(); // title -> Set(class QIDs)
  const categoryPeers = new Set();
  const banners = [];

  // --- Signal 1: Wikidata P31 siblings ---
  // Sample instances per class first (early-terminating LIMIT); only census
  // classes small enough to be a coherent genre (per-class query so big
  // classes never pollute).
  if (qid) {
    try {
      const rows = await api.sparql(SPARQL_CLASS_SAMPLE.replace('QID', qid));
      const perClass = new Map();
      for (const { class: cls } of rows) {
        const q = cls.split('/entity/').pop(); // URL -> bare QID
        perClass.set(q, (perClass.get(q) ?? 0) + 1);
      }
      const smallClasses = [...perClass.entries()]
        .filter(([, n]) => n <= MAX_CLASS_INSTANCES)
        .map(([q]) => q);
      for (const cls of smallClasses) {
        const rows2 = await api.sparql(SPARQL_SIBLINGS_FOR_CLASS.replace('CLASS', cls));
        for (const { article } of rows2) {
          if (!article || !article.includes('/wiki/')) continue;
          const t = titleFromArticleUrl(article);
          if (t === title) continue;
          if (!sparqlPeers.has(t)) sparqlPeers.set(t, new Set());
          sparqlPeers.get(t).add(cls);
        }
      }
    } catch (e) {
      console.warn(`  [peers] SPARQL failed: ${e.message}`);
    }
  }

  // --- Signal 2: most specific shared categories (fewest members) ---
  // categoryinfo member counts replace the name-length heuristic: the
  // smallest non-trivial category the article sits in is the sharpest genre
  // pointer (Imperial election (HRE) @39 beats a year-in-Europe megacategory).
  // Hypotheses H1 in signals.md. Fallback: name length, as before.
  const MIN_CATEGORY_MEMBERS = 3;
  const MAX_CATEGORY_MEMBERS = 1000;
  try {
    const data = await api.enwiki({
      action: 'query',
      prop: 'categories',
      titles: title,
      cllimit: 500,
    });
    const cats = (data.query?.pages?.[0]?.categories ?? [])
      .filter((c) => !c.hidden && !MAINTENANCE_CATEGORY_RE.test(c.title.replace(/^Category:/, '')))
      .map((c) => c.title);
    const info = {}; // category title -> member count
    for (const batch of chunk(cats, 50)) {
      const d = await api.enwiki({
        action: 'query',
        prop: 'categoryinfo',
        titles: batch.join('|'),
      });
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
    for (const cat of deep) {
      const members = await api.enwiki({
        action: 'query',
        list: 'categorymembers',
        cmtitle: cat.title,
        cmnamespace: 0,
        cmlimit: maxCategoryMembers,
      });
      for (const m of members.query?.categorymembers ?? []) {
        if (m.title !== title) categoryPeers.add(m.title);
      }
    }
  } catch (e) {
    console.warn(`  [peers] categories failed: ${e.message}`);
  }

  // --- Signal 3: WikiProject banners on the talk page ---
  try {
    const data = await api.enwiki({
      action: 'query',
      prop: 'templates',
      titles: `Talk:${title}`,
      tllimit: 500,
      tlnamespace: 10,
    });
    for (const tpl of data.query?.pages?.[0]?.templates ?? []) {
      const name = tpl.title.replace(/^Template:/, '');
      if (name.startsWith('WikiProject') || name.startsWith('WP ')) banners.push(name);
    }
  } catch (e) {
    console.warn(`  [peers] banners failed: ${e.message}`);
  }

  // Combine; keep per-peer origin for the sub-cluster check in census.
  const origin = new Map(); // title -> Set('sparql' | 'category')
  for (const t of sparqlPeers.keys()) origin.set(t, new Set(['sparql']));
  for (const t of categoryPeers) {
    if (!origin.has(t)) origin.set(t, new Set());
    origin.get(t).add('category');
  }

  const peers = [...origin.keys()].slice(0, maxTotal);

  return {
    qid,
    peers,
    peerOrigin: Object.fromEntries([...origin.entries()].map(([t, s]) => [t, [...s]])),
    classByPeer: Object.fromEntries(
      [...sparqlPeers.entries()].map(([t, s]) => [t, [...s]])
    ),
    banners,
    counts: { sparql: sparqlPeers.size, category: categoryPeers.size, total: peers.length },
  };
}
