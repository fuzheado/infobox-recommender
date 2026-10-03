// build-usage-history.mjs — merge the research outputs into the committed
// dataset behind usage-history.md.
//
// Inputs (produced by the sibling scripts):
//   inventory.json  — cache inventory (scripts/research/extract-cache-inventory.py)
//   adoption.json   — per-article before/after + attribution (adoption-analysis.mjs)
//   phantom.json    — prop=templates vs wikitext audit (phantom-box-check.mjs)
//
// Usage (run from the repo root):
//   node scripts/research/build-usage-history.mjs /tmp/inventory.json /tmp/adoption.json /tmp/phantom.json

import { readFileSync, writeFileSync } from 'node:fs';

const [invPath, adoptPath, phantomPath, outPath = 'usage-history.json'] = process.argv.slice(2);
const inv = JSON.parse(readFileSync(invPath, 'utf8'));
const adopt = JSON.parse(readFileSync(adoptPath, 'utf8'));
const phantom = JSON.parse(readFileSync(phantomPath, 'utf8'));

const adoptByTitle = new Map(adopt.results.map((r) => [r.title, r]));
const phantomByTitle = new Map(phantom.rows.map((r) => [r.title, r]));

const articles = inv.rows.map((row) => {
  const a = adoptByTitle.get(row.title) ?? {};
  const p = phantomByTitle.get(row.title) ?? {};
  const isPhantom = p.phantom === true;
  return {
    title: row.title,
    firstAnalysisAt: new Date(row.first * 1000).toISOString(),
    lastAnalysisAt: new Date(row.last * 1000).toISOString(),
    infoboxAtAnalysis: a.infoboxAtAnalysis ?? null,
    infoboxNowFromTemplatesApi: a.infoboxNow ?? null,
    infoboxNowFromWikitext: p.viaWikitext ?? null,
    phantomBox: isPhantom,
    gainedInfoboxAfterAnalysis: Boolean(a.gainedAfterAnalysis) && !isPhantom,
    addedBy: isPhantom ? null : (a.addedBy ?? null),
    addedAt: isPhantom ? null : (a.addedAt ?? null),
    addedTemplate: isPhantom ? null : (a.addedTemplate ?? null),
    addedComment: isPhantom ? null : (a.addedComment ?? null),
  };
});

const devWindow = articles.filter((x) => x.firstAnalysisAt < '2026-09-01');
const external = articles.filter((x) => x.firstAnalysisAt >= '2026-09-01');
const gains = articles.filter((x) => x.gainedInfoboxAfterAnalysis);

const out = {
  generatedAt: new Date().toISOString(),
  window: {
    from: articles[0]?.firstAnalysisAt?.slice(0, 10),
    to: articles.at(-1)?.firstAnalysisAt?.slice(0, 10),
    note: 'pre-usage-log era; reconstructed from the server-side API cache',
  },
  method: {
    inventory: 'server cache: every Wikimedia API response is stored as SHA1(url).json; REST-summary entries = one analysed article each, mtime = when',
    atAnalysisTime: 'revision current at the analysis timestamp (rvstart/rvdir=older), wikitext scanned for infobox-family templates',
    now: 'prop=templates (canonical) cross-checked against the article wikitext',
    attribution: 'first revision in the window containing an infobox-family template',
    notRecoverable: ['verdict/recommendation returned at the time', 'who ran each analysis (no referrer/IP was logged then)', 'client type (HTML vs API)'],
  },
  totals: {
    analyses: articles.length,
    distinctArticles: new Set(articles.map((a) => a.title)).size,
    hadInfoboxAtAnalysis: articles.filter((a) => a.infoboxAtAnalysis).length,
    bareAtAnalysis: articles.filter((a) => !a.infoboxAtAnalysis).length,
    gainedInfoboxAfterAnalysis: gains.length,
    phantomBoxesExcluded: articles.filter((a) => a.phantomBox).length,
    devWindowAnalyses: devWindow.length,
    externalWindowAnalyses: external.length,
    externalBareStillBare: external.filter((a) => !a.infoboxAtAnalysis && !a.infoboxNowFromWikitext).length,
  },
  adoption: {
    gains: gains.map((g) => ({
      title: g.title,
      analysedAt: g.firstAnalysisAt,
      template: g.addedTemplate,
      addedBy: g.addedBy,
      addedAt: g.addedAt,
      editSummary: g.addedComment,
    })),
    phantomExcluded: articles
      .filter((a) => a.phantomBox)
      .map((a) => ({ title: a.title, apiSaid: a.infoboxNowFromTemplatesApi, wikitextSays: a.infoboxNowFromWikitext })),
  },
  articles,
};

writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.error(`wrote ${outPath}: ${articles.length} analyses, ${gains.length} adoption(s), ${out.totals.phantomBoxesExcluded} phantom(s)`);
