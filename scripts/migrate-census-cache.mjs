#!/usr/bin/env node
// scripts/migrate-census-cache.mjs — harvest per-page template data out of the
// existing URL-keyed batch cache into the per-page cache (cache/templates/).
//
// Why: batched API responses are cached under a key that contains the batch
// composition, so any change to batching (e.g. census batch size 50 → 25)
// invalidates every entry even though the per-page answers are identical. That
// cost one full cold crawl of the eval corpus (and a 429 from the API). This
// migrates what we already fetched, so such changes become free.
//
// Usage: node scripts/migrate-census-cache.mjs [--dry]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApi } from '../lib/api.js';

const dry = process.argv.includes('--dry');
const CACHE = 'cache';
const api = createApi({ cacheDir: CACHE, paceMs: 0 });

let scanned = 0;
let harvested = 0;
let skipped = 0;

for (const file of readdirSync(CACHE)) {
  if (!file.endsWith('.json')) continue;
  scanned++;
  let body;
  try {
    body = JSON.parse(readFileSync(join(CACHE, file), 'utf8'));
  } catch {
    skipped++;
    continue;
  }
  const pages = body?.query?.pages;
  if (!Array.isArray(pages)) continue;
  for (const page of pages) {
    // only entries that carry what the census needs
    if (!page || typeof page.title !== 'string' || !Array.isArray(page.templates)) continue;
    if (!page.pageprops && !page.ns) continue; // not a templates|pageprops|info response
    const entry = {
      templates: page.templates.map((t) => (typeof t === 'string' ? t : t.title)),
      page,
    };
    // do not clobber a richer existing entry (more templates) with a starved one
    const existing = api.readKeyed('templates', page.title);
    if (existing && (existing.templates?.length ?? 0) >= entry.templates.length) {
      skipped++;
      continue;
    }
    if (!dry) api.writeKeyed('templates', page.title, entry);
    harvested++;
  }
}

console.log(`${dry ? '[dry run] ' : ''}scanned ${scanned} cache files; harvested ${harvested} page entries; skipped ${skipped}`);
