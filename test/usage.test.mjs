// Unit tests for the privacy-preserving usage log (lib/usage.js).
//
// The privacy assertions are the point of this file: no IPs, no User-Agent,
// no cookies in stored records; referrers reduced to host only; article
// titles never exposed by the public snapshot; raw records pruned at the
// retention window while counts-only aggregates survive.
//
// Run: node --test test/usage.test.mjs   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsage, referrerHost, sanitizeRecord, RAW_RETENTION_DAYS } from '../lib/usage.js';

const tmp = () => mkdtemp(join(tmpdir(), 'usage-test-'));

test('referrerHost returns the bare host, never a path or query', () => {
  assert.equal(referrerHost('https://en.wikipedia.org/wiki/Special:Search?q=secret'), 'en.wikipedia.org');
  assert.equal(referrerHost('http://EN.Wikipedia.ORG/wiki/Foo'), 'en.wikipedia.org');
  assert.equal(referrerHost('https://infobox-recommender.toolforge.org/stats', 'infobox-recommender.toolforge.org'), null); // self
  assert.equal(referrerHost(''), null);
  assert.equal(referrerHost(undefined), null);
  assert.equal(referrerHost('not a url'), null);
  assert.ok(!referrerHost('https://en.wikipedia.org/wiki/Foo').includes('/'));
});

test('sanitizeRecord allowlists fields — headers/PII cannot leak in', () => {
  const rec = sanitizeRecord({
    ts: '2026-10-02T00:00:00.000Z',
    title: 'Example',
    verdict: 'recommend',
    // things that must be dropped:
    ip: '203.0.113.9',
    'user-agent': 'Mozilla/5.0',
    cookie: 'session=abc',
    headers: { authorization: 'Bearer x' },
    referer: 'https://en.wikipedia.org/wiki/Foo',
  });
  assert.deepEqual(Object.keys(rec).sort(), ['title', 'ts', 'verdict']);
  assert.equal(rec.ip, undefined);
  assert.equal(rec.cookie, undefined);
  assert.equal(rec['user-agent'], undefined);
});

test('recorded raw lines carry no IP/UA/cookie and no full referrer; aggregates count', async () => {
  const dir = await tmp();
  const usage = createUsage({ dir });
  await usage.init();
  await usage.record({
    ts: '2026-10-02T10:00:00.000Z',
    kind: 'analyze',
    source: 'stream',
    title: 'May 1400 imperial election',
    verdict: 'recommend',
    template: 'Infobox election',
    confidence: 'high',
    peers: 61,
    coverage: 0.75,
    elapsedMs: 1200,
    ok: true,
    refHost: referrerHost('https://en.wikipedia.org/wiki/Foo'),
    // hostile extras:
    ip: '203.0.113.9',
    ua: 'Mozilla/5.0',
  });
  await usage.record({ ts: '2026-10-02T11:00:00.000Z', kind: 'page', source: 'page' });
  await usage.record({ ts: '2026-10-02T12:00:00.000Z', kind: 'validate', source: 'stream', title: 'Abraham Lincoln', verdict: 'already-has-infobox', ok: true });
  await usage.record({ ts: '2026-10-02T13:00:00.000Z', kind: 'analyze', source: 'json', title: 'Foo', verdict: 'error', ok: false, error: 'missing title' });
  await usage._flush();

  const files = await readdir(join(dir, 'raw'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^usage-2026-10\.jsonl$/);
  const lines = (await readFile(join(dir, 'raw', files[0]), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 4);

  // --- privacy assertions on every stored record ---
  const forbidden = /(^|")(ip|ua|user-?agent|cookie|session|authorization|referer)"/i;
  for (const line of lines) {
    assert.ok(!forbidden.test(line), `stored record must not contain PII fields: ${line}`);
    const rec = JSON.parse(line);
    assert.ok(rec.ts, 'every record is timestamped');
    if (rec.refHost) assert.ok(!rec.refHost.includes('/'), 'referrer must be a host, not a URL');
  }

  const snap = await usage.publicSnapshot({});
  assert.equal(snap.allTime.pageLoads, 1);
  assert.equal(snap.allTime.analyses, 2); // analyze + the failed analyze
  assert.equal(snap.allTime.validations, 1);
  assert.equal(snap.allTime.errors, 1);
  assert.equal(snap.allTime.avgElapsedMs, 1200);
  assert.deepEqual(snap.verdicts, { recommend: 1, 'already-has-infobox': 1, error: 1 });
  assert.equal(snap.templates['Infobox election'], 1);
  assert.deepEqual(snap.sources, { page: 1, stream: 2, json: 1 });
  assert.equal(snap.referrers['en.wikipedia.org'], 1);
  assert.deepEqual(snap.byMonth, { '2026-10': 3 }); // analyses+validations, not page loads
  assert.equal(snap.retainedWindow.distinctArticles, 3);
});

test('public snapshot exposes counts only — no titles, no day-level granularity', async () => {
  const dir = await tmp();
  const usage = createUsage({ dir });
  await usage.init();
  await usage.record({ ts: '2026-10-02T10:00:00.000Z', kind: 'analyze', title: 'Secret Draft Article', verdict: 'recommend', ok: true });
  await usage._flush();
  const snap = await usage.publicSnapshot({});
  const json = JSON.stringify(snap);
  assert.ok(!json.includes('Secret Draft Article'), 'public stats must never contain article titles');
  assert.equal(snap.byDay, undefined, 'day-level breakdown stays server-side');
  assert.equal(snap.retainedWindow.distinctArticles, 1, 'the count is exposed, not the list');
  assert.ok(!('titles' in snap.retainedWindow));
  assert.ok(snap.retention.notCollected.includes('IP addresses'));
  assert.match(snap.retention.rawPerAnalysisRecords, /90 days/);
});

test('raw files older than the retention window are pruned; aggregates survive', async () => {
  const dir = await tmp();
  await mkdir(join(dir, 'raw'), { recursive: true });
  await writeFile(join(dir, 'raw', 'usage-2020-01.jsonl'), '{"ts":"2020-01-01T00:00:00.000Z","title":"Ancient"}\n');
  const usage = createUsage({ dir });
  await usage.init();
  await usage.record({ ts: '2026-10-02T10:00:00.000Z', kind: 'analyze', title: 'Recent', verdict: 'recommend', ok: true });
  await usage._flush();
  const files = (await readdir(join(dir, 'raw'))).sort();
  assert.deepEqual(files, ['usage-2026-10.jsonl'], 'old raw file removed, current kept');
  const snap = await usage.publicSnapshot({});
  assert.equal(snap.retainedWindow.distinctArticles, 1, 'pruned title no longer counted in the retained window');
  assert.equal(snap.allTime.analyses, 1, 'all-time counts are unaffected by pruning');
  assert.equal(RAW_RETENTION_DAYS, 90);
});

test('logging failures never throw (perm-denied dir)', async () => {
  const usage = createUsage({ dir: '/proc/definitely-not-writable/usage' });
  await usage.init();
  await assert.doesNotReject(() => usage.record({ kind: 'analyze', title: 'X', verdict: 'recommend' }));
});
