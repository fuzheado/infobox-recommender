// lib/api.js — thin MediaWiki Action API + Wikidata SPARQL client.
//
// Etiquette (per AGENTS.md): descriptive UA on every request, >=1s pacing,
// retry/backoff on 429/5xx honoring Retry-After, cache-first disk cache
// (URL-keyed SHA1 JSON) for Node usage.
//
// Dual-runtime: uses global fetch (Node >= 18, browsers), so the same module
// can back a future userscript — there, pacing and disk caching are simply
// disabled (same-origin calls, tiny per-view volume, browser HTTP cache).

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_UA =
  process.env.WIKIMEDIA_USER_AGENT ??
  'infobox-recommender/0.1 (fuzheado github; andrew.lih@gmail.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createApi({
  cacheDir = 'cache',
  paceMs = 1000,
  ua = DEFAULT_UA,
  maxRetries = 4,
  timeoutMs = 60000,
} = {}) {
  let lastRequestAt = 0;
  const caching = Boolean(cacheDir);
  const pacing = paceMs > 0;

  if (caching) mkdirSync(cacheDir, { recursive: true });

  const cachePath = (url) =>
    join(cacheDir, createHash('sha1').update(url).digest('hex') + '.json');

  async function pace() {
    if (!pacing) return;
    const wait = lastRequestAt + paceMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  }

  // GET a URL and parse JSON. Cache hits skip pacing/network entirely.
  async function getJson(url) {
    if (caching) {
      try {
        return JSON.parse(readFileSync(cachePath(url), 'utf8'));
      } catch {
        /* cache miss */
      }
    }
    await pace();

    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res;
      try {
        res = await Promise.race([
          fetch(url, { headers: { 'User-Agent': ua } }),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms: ${url}`)), timeoutMs)
          ),
        ]);
      } catch (e) {
        lastErr = e; // network error or timeout — retry with backoff
        if (attempt === maxRetries) throw lastErr;
        await sleep(Math.min(60, 5 * 2 ** attempt) * 1000);
        continue;
      }
      if (res.ok) {
        const body = await res.text();
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          throw new Error(`Non-JSON response from ${url}: ${body.slice(0, 200)}`);
        }
        if (caching) writeFileSync(cachePath(url), JSON.stringify(data));
        return data;
      }
      if (res.status === 403) {
        throw new Error(`HTTP 403 from ${url} — check User-Agent (${ua})`);
      }
      // 4xx (except 429) are permanent — no retry. 429/5xx: honor
      // Retry-After, else exponential backoff, cap 60s.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const backoff = Math.min(60, retryAfter || 5 * 2 ** attempt);
      lastErr = new Error(`HTTP ${res.status} from ${url}`);
      if (attempt === maxRetries) throw lastErr;
      await sleep(backoff * 1000);
    }
    throw lastErr;
  }

  // Action API. Params may be arrays (joined with '|'); always JSON v2.
  function action(endpoint, params) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      usp.set(k, Array.isArray(v) ? v.join('|') : String(v));
    }
    usp.set('format', 'json');
    usp.set('formatversion', '2');
    return getJson(`${endpoint}?${usp}`);
  }

  const enwiki = (params) => action('https://en.wikipedia.org/w/api.php', params);
  const wikidata = (params) => action('https://www.wikidata.org/w/api.php', params);

  // WDQS SPARQL -> array of { variable: value } rows.
  async function sparql(query) {
    const url =
      'https://query.wikidata.org/sparql?format=json&query=' +
      encodeURIComponent(query);
    const data = await getJson(url);
    return (data.results?.bindings ?? []).map((b) =>
      Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))
    );
  }

  return { getJson, action, enwiki, wikidata, sparql, cachePath };
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Safe `in` check that treats empty-string flags (e.g. disambiguation: "")
// as present — MediaWiki pageprops use "" for boolean-ish props.
export const has = (obj, key) => obj != null && key in obj;
