#!/usr/bin/env node
// server.mjs — zero-dependency web service for the infobox recommender.
//
// Runs locally (`node server.mjs`) and on Toolforge (node22 webservice; the
// platform sets PORT). Imports the same lib/ pipeline the CLI uses.
//
// Routes:
//   /                               -> search page + examples (HTML)
//   /?title=Small-signal+model      -> same page, auto-runs the analysis
//   /analyze/stream?title=X         -> SSE: live stage events, then the result
//   /analyze?title=X&output=json    -> API mode: full analysis JSON (CORS *)
//   /stats[?output=json]            -> aggregate usage stats (privacy-preserving)
//   /style.css, /app.js             -> static assets from public/
//
// Guards: max 2 concurrent analyses (queue), per-IP throttle (30 / 5 min),
// title sanitization, path-traversal protection. Repeat analyses are instant
// thanks to the disk cache in cache/.
//
// Usage logging (usage/, gitignored) is privacy-preserving: no IPs, no
// User-Agents, no cookies; referrer host only; raw records pruned at 90 days
// while counts-only aggregates persist. See PRIVACY.md + lib/usage.js.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './lib/api.js';
import { analyze } from './lib/analyze.js';
import { createUsage, referrerHost } from './lib/usage.js';
import { renderStatsPage } from './lib/stats-page.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const MAX_CONCURRENT = 2;
const RATE_LIMIT = { max: 30, windowMs: 5 * 60 * 1000 };
const CACHE_DIR = 'cache';

const api = createApi({ cacheDir: CACHE_DIR, paceMs: 1000 });
const usage = createUsage({ dir: process.env.USAGE_DIR || join(process.cwd(), 'usage') });

// Referrer is reduced to a host (never the full URL) before storage.
const refOf = (req) => referrerHost(req.headers.referer, (req.headers.host ?? '').split(':')[0]);

// Fire-and-forget: usage logging must never affect a response.
function logAnalysis({ kind, source, title, req, startedAt, result, error }) {
  const rec = {
    kind,
    source,
    title,
    ok: !error,
    error: error ? String(error?.message ?? error).slice(0, 200) : undefined,
    elapsedMs: Date.now() - startedAt,
    refHost: refOf(req),
  };
  if (result) {
    rec.verdict = result.verdict;
    rec.template = result.template ?? undefined;
    rec.confidence = result.confidence ?? undefined;
    rec.peers = result.evidence?.total ?? undefined;
    rec.coverage =
      typeof result.evidence?.coverage === 'number'
        ? Math.round(result.evidence.coverage * 100) / 100
        : undefined;
  }
  usage.record(rec).catch(() => {});
}

// --- tiny semaphore: at most MAX_CONCURRENT analyses at once ---
let active = 0;
const waiters = [];
function withSlot(fn) {
  const run = async () => {
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiters.shift();
      if (next) next();
    }
  };
  return active >= MAX_CONCURRENT ? new Promise((r) => waiters.push(r)).then(run) : run();
}

// --- per-IP throttle ---
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (arr.length >= RATE_LIMIT.max) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function serveAsset(res, rel) {
  const file = resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + '/')) return send(res, 403, 'forbidden');
  try {
    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=300' });
    res.end(body);
  } catch {
    send(res, 404, 'not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    if (path === '/' || path === '/index.html') {
      if (path === '/') usage.record({ kind: 'page', source: 'page', refHost: refOf(req) }).catch(() => {});
      return serveAsset(res, 'index.html');
    }

    if (path === '/stats') {
      const snap = await usage.publicSnapshot({ cacheDir: CACHE_DIR });
      if (url.searchParams.get('output') === 'json') {
        return send(res, 200, snap, 'application/json; charset=utf-8', {
          'Access-Control-Allow-Origin': '*',
        });
      }
      return send(res, 200, renderStatsPage(snap), 'text/html; charset=utf-8', {
        'Cache-Control': 'public, max-age=60',
      });
    }

    if (path === '/analyze/stream') {
      const title = (url.searchParams.get('title') ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 300);
      if (!title) {
        return send(res, 400, { error: 'missing "title" parameter' }, 'application/json; charset=utf-8');
      }
      const validate = url.searchParams.get('validate') === '1';
      const ip = req.socket.remoteAddress ?? '?';
      if (throttled(ip)) {
        return send(
          res,
          429,
          { error: `rate limit: ${RATE_LIMIT.max} analyses per ${RATE_LIMIT.windowMs / 60000} minutes` },
          'application/json; charset=utf-8'
        );
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no', // keep nginx/proxies from buffering the stream
      });
      const emit = (event, data) => {
        if (res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const startedAt = Date.now();
      try {
        const result = await withSlot(() =>
          analyze(api, title, { skipExisting: !validate, log: (ev) => emit('stage', ev) })
        );
        emit('result', result);
        logAnalysis({ kind: validate ? 'validate' : 'analyze', source: 'stream', title, req, startedAt, result });
      } catch (e) {
        emit('error', { error: e?.message ?? String(e) });
        logAnalysis({ kind: validate ? 'validate' : 'analyze', source: 'stream', title, req, startedAt, error: e });
      } finally {
        res.end();
      }
      return;
    }

    if (path === '/analyze') {
      const title = (url.searchParams.get('title') ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 300);
      if (!title) {
        return send(res, 400, { error: 'missing "title" parameter' }, 'application/json; charset=utf-8');
      }
      const validate = url.searchParams.get('validate') === '1';
      const ip = req.socket.remoteAddress ?? '?';
      if (throttled(ip)) {
        return send(
          res,
          429,
          { error: `rate limit: ${RATE_LIMIT.max} analyses per ${RATE_LIMIT.windowMs / 60000} minutes` },
          'application/json; charset=utf-8'
        );
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      const startedAt = Date.now();
      try {
        const result = await withSlot(() => analyze(api, title, { skipExisting: !validate }));
        logAnalysis({ kind: validate ? 'validate' : 'analyze', source: 'json', title, req, startedAt, result });
        return send(res, 200, result, 'application/json; charset=utf-8');
      } catch (e) {
        logAnalysis({ kind: validate ? 'validate' : 'analyze', source: 'json', title, req, startedAt, error: e });
        return send(res, 500, { error: e?.message ?? String(e) }, 'application/json; charset=utf-8');
      }
    }

    // static assets from public/ (path-traversal safe)
    const rel = path.replace(/^\/+/, '');
    if (rel && !rel.includes('..')) return serveAsset(res, rel);
    return send(res, 404, 'not found');
  } catch (e) {
    try {
      send(res, 500, { error: String(e?.message ?? e) }, 'application/json; charset=utf-8');
    } catch {
      res.end();
    }
  }
});

await usage.init();
const pruned = await usage.pruneRaw();

server.listen(PORT, () => {
  console.log(`infobox-recommender web UI on http://localhost:${PORT}`);
  if (pruned.length) console.log(`usage: pruned ${pruned.length} raw file(s) past retention`);
});

// Daily retention prune: raw per-analysis records are kept 90 days.
setInterval(() => {
  usage.pruneRaw().catch(() => {});
}, 24 * 60 * 60 * 1000).unref();
