// lib/usage.js — privacy-preserving usage logging for the web service.
//
// Design constraints (Wikimedia privacy / data-retention guidance):
//   * NEVER store IP addresses, User-Agent strings, cookies, or session ids.
//     Toolforge's own web logs already hold IPs (access-restricted) — we do
//     not duplicate them, and we never expose those.
//   * Referrers are reduced to the HOST only ("en.wikipedia.org"), never the
//     full URL (paths/queries can carry watchlists, search terms, tokens).
//   * Records are built from an explicit ALLOWLIST of fields, so an
//     unexpected header or context object cannot leak into the log.
//   * Raw, per-analysis records are user-identifiable in the weak sense that
//     they show which article someone looked up → retained 90 days, then
//     pruned automatically. Monthly JSONL files make pruning trivial.
//   * Aggregate counters (no titles, no timestamps finer than a month) are
//     not identifiable → kept indefinitely, so the totals survive pruning.
//   * Article titles are recorded ONLY in the raw log for maintainer-side
//     adoption analysis; the public /stats view exposes counts, never titles.

import { appendFile, mkdir, readdir, readFile, rename, unlink, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const RAW_RETENTION_DAYS = 90;

// Fields allowed in a raw record. Anything not listed here is dropped.
const ALLOWED_FIELDS = new Set([
  'ts',
  'kind', // 'analyze' | 'validate' | 'page'
  'source', // 'html' | 'stream' | 'json' | 'page'
  'title', // the article under analysis (raw log only; pruned at 90 days)
  'verdict',
  'template',
  'confidence',
  'peers',
  'coverage',
  'elapsedMs',
  'ok',
  'error',
  'refHost', // referrer HOST only
]);

/** Reduce a Referer header to a bare lowercase host. Never returns a path. */
export function referrerHost(referer, selfHost = null) {
  if (!referer || typeof referer !== 'string') return null;
  let host;
  try {
    host = new URL(referer).host.toLowerCase();
  } catch {
    return null;
  }
  if (!host || host === (selfHost ?? '').toLowerCase()) return null;
  // A referrer host is a hostname (or IP literal); keep it short and sane.
  return host.slice(0, 100);
}

/** Keep only allowlisted, non-empty fields; drop undefined/null/empty. */
export function sanitizeRecord(entry) {
  const out = {};
  for (const [k, v] of Object.entries(entry ?? {})) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

function emptyAggregates() {
  return {
    version: 1,
    firstRecordedAt: null,
    lastRecordedAt: null,
    totals: { pageLoads: 0, analyses: 0, validations: 0, errors: 0, elapsedMsSum: 0, elapsedMsCount: 0 },
    verdicts: {},
    confidence: {},
    templates: {},
    sources: {},
    referrers: {},
    months: {}, // { '2026-10': analyses }  — month granularity only
  };
}

const bump = (obj, key) => {
  if (key === undefined || key === null || key === '') return;
  obj[key] = (obj[key] ?? 0) + 1;
};

export function createUsage({ dir, retentionDays = RAW_RETENTION_DAYS, now = () => Date.now() } = {}) {
  const rawDir = join(dir, 'raw');
  const aggFile = join(dir, 'stats.json');
  let agg = null;
  let flushing = null;
  let dirty = false;

  async function load() {
    if (agg) return agg;
    try {
      agg = JSON.parse(await readFile(aggFile, 'utf8'));
    } catch {
      agg = emptyAggregates();
    }
    return agg;
  }

  async function flush() {
    if (!dirty) return;
    dirty = false;
    const tmp = `${aggFile}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(agg, null, 1));
      await rename(tmp, aggFile);
    } catch {
      dirty = true; // retry on the next record
    }
  }
  const scheduleFlush = () => {
    if (flushing) return;
    flushing = flush().finally(() => {
      flushing = null;
    });
  };

  /** Append one privacy-filtered record. */
  async function record(entry) {
    const rec = sanitizeRecord(entry);
    if (!rec.ts) rec.ts = new Date(now()).toISOString();
    const d = new Date(rec.ts);
    const a = await load();

    // --- aggregates: counts only, month granularity, no titles ---
    if (rec.kind === 'page') a.totals.pageLoads++;
    else if (rec.kind === 'validate') a.totals.validations++;
    else a.totals.analyses++;
    if (rec.ok === false) a.totals.errors++;
    if (typeof rec.elapsedMs === 'number') {
      a.totals.elapsedMsSum += rec.elapsedMs;
      a.totals.elapsedMsCount++;
    }
    bump(a.verdicts, rec.verdict);
    bump(a.confidence, rec.confidence);
    bump(a.templates, rec.template);
    bump(a.sources, rec.source);
    bump(a.referrers, rec.refHost);
    if (rec.kind !== 'page') bump(a.months, monthKey(d));
    if (!a.firstRecordedAt) a.firstRecordedAt = rec.ts;
    a.lastRecordedAt = rec.ts;
    dirty = true;

    try {
      await mkdir(rawDir, { recursive: true });
      await appendFile(join(rawDir, `usage-${monthKey(d)}.jsonl`), `${JSON.stringify(rec)}\n`);
    } catch {
      // Logging must never break a request.
    }
    scheduleFlush();
    return rec;
  }

  /** Delete raw files older than the retention window. */
  async function pruneRaw() {
    const removed = [];
    let files = [];
    try {
      files = await readdir(rawDir);
    } catch {
      return removed;
    }
    const cutoff = new Date(now() - retentionDays * 86400_000);
    const cutoffKey = monthKey(cutoff);
    for (const f of files) {
      const m = /^usage-(\d{4})-(\d{2})\.jsonl$/.exec(f);
      if (!m) continue;
      const key = `${m[1]}-${m[2]}`;
      if (key < cutoffKey) {
        try {
          await unlink(join(rawDir, f));
          removed.push(f);
        } catch {
          /* ignore */
        }
      }
    }
    return removed;
  }

  /** Summarise the retained raw window (no titles leave this function). */
  async function rawWindowSummary() {
    const out = { files: 0, records: 0, distinctArticles: 0, oldestAt: null, newestAt: null, byDay: {} };
    const titles = new Set();
    let files = [];
    try {
      files = (await readdir(rawDir)).filter((f) => f.endsWith('.jsonl')).sort();
    } catch {
      return out;
    }
    out.files = files.length;
    for (const f of files) {
      let text = '';
      try {
        text = await readFile(join(rawDir, f), 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let rec;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        out.records++;
        if (rec.title) titles.add(rec.title);
        if (rec.ts) {
          if (!out.oldestAt || rec.ts < out.oldestAt) out.oldestAt = rec.ts;
          if (!out.newestAt || rec.ts > out.newestAt) out.newestAt = rec.ts;
          const day = rec.ts.slice(0, 10);
          out.byDay[day] = (out.byDay[day] ?? 0) + 1;
        }
      }
    }
    out.distinctArticles = titles.size;
    return out;
  }

  async function cacheStats(cacheDir) {
    try {
      const files = (await readdir(cacheDir)).filter((f) => f.endsWith('.json'));
      let bytes = 0;
      for (const f of files) {
        try {
          bytes += (await stat(join(cacheDir, f))).size;
        } catch {
          /* ignore */
        }
      }
      return { cachedApiResponses: files.length, cacheMb: Math.round((bytes / 1048576) * 10) / 10 };
    } catch {
      return { cachedApiResponses: 0, cacheMb: 0 };
    }
  }

  /**
   * Public view: aggregate counters that persist indefinitely, plus a
   * summary of the retained raw window. NO article titles, NO per-day
   * breakdown (day-level granularity can reveal an individual's activity
   * pattern; it stays in the raw log for maintainers).
   */
  async function publicSnapshot({ cacheDir } = {}) {
    const a = await load();
    const raw = await rawWindowSummary();
    const top = (obj, n) => Object.fromEntries(Object.entries(obj).sort((x, y) => y[1] - x[1]).slice(0, n));
    const avgElapsedMs = a.totals.elapsedMsCount ? Math.round(a.totals.elapsedMsSum / a.totals.elapsedMsCount) : null;
    return {
      generatedAt: new Date(now()).toISOString(),
      allTime: {
        firstRecordedAt: a.firstRecordedAt,
        lastRecordedAt: a.lastRecordedAt,
        pageLoads: a.totals.pageLoads,
        analyses: a.totals.analyses,
        validations: a.totals.validations,
        errors: a.totals.errors,
        avgElapsedMs,
      },
      verdicts: a.verdicts,
      confidence: a.confidence,
      templates: top(a.templates, 15),
      sources: a.sources,
      referrers: top(a.referrers, 15),
      byMonth: a.months,
      retainedWindow: {
        days: retentionDays,
        records: raw.records,
        distinctArticles: raw.distinctArticles,
        oldestAt: raw.oldestAt,
        newestAt: raw.newestAt,
      },
      ...(cacheDir ? await cacheStats(cacheDir) : {}),
      retention: {
        rawPerAnalysisRecords: `${retentionDays} days, then pruned automatically`,
        aggregates: 'counts only, month granularity — kept indefinitely',
        notCollected: ['IP addresses', 'User-Agent strings', 'cookies', 'session identifiers', 'full referrer URLs'],
      },
    };
  }

  return {
    record,
    pruneRaw,
    publicSnapshot,
    rawWindowSummary,
    init: async () => {
      await load();
      await pruneRaw();
    },
    _aggregates: () => agg, // tests
    _flush: flush, // tests
  };
}
