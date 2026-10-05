// Tests for the peer-sample evidence: ordering, annotations, and the downstream
// contract.
//
// The samples under a verdict ARE the evidence a reader checks, so their order is
// deliberate (closest first, then the recommended template, then alphabetical) and
// their shape is contractual: `bare` stays a list of strings because the Lead
// Balancer userscript renders it directly (HANDOFF §7), while `barePeers` carries
// the annotated version beside it.
//
// Run: node --test test/peer-order.test.mjs   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestClass, fetchAssessments, statsOf } from '../lib/census.js';
import { buildEvidence } from '../lib/decide.js';

const page = { ns: 0, pageprops: {} };

/** Census from [{title, box, tier}] peers. */
function censusOf(peers, extra = {}) {
  const evaluated = peers.map((p) => ({
    title: p.title,
    infoboxes: p.box ? [p.box] : [],
    primary: p.box ?? null,
    tier: p.tier,
  }));
  const s = statsOf(evaluated);
  return {
    ...s,
    total: s.n,
    bare: evaluated.filter((p) => p.infoboxes.length === 0).map((p) => p.title),
    sidebarOnly: [],
    subCluster: {},
    skipped: [],
    evaluated,
    ...extra,
  };
}

test('boxed peers are ordered closest-first, then by recommended template, then A-Z', () => {
  const census = censusOf([
    { title: 'Zeta far', box: 'Infobox artwork', tier: 3 },
    { title: 'Beta near other', box: 'Infobox company', tier: 1 },
    { title: 'Alpha near match', box: 'Infobox person', tier: 1 },
    { title: 'Gamma near family', box: 'Infobox officeholder', tier: 1 },
  ]);
  const ev = buildEvidence(census, [], [], { preferred: 'Infobox person' });
  assert.deepEqual(
    ev.boxedPeers.map((p) => p.title),
    [
      'Alpha near match', // tier 1, exact match, A-Z
      'Gamma near family', // tier 1, same family (officeholder ⊂ person)
      'Beta near other', // tier 1, unmatched
      'Zeta far', // tier 3 last, however well it matches
    ]
  );
  assert.equal(ev.preferredTemplate, 'Infobox person');
  assert.deepEqual(ev.boxedPeers.map((p) => p.tier), [1, 1, 1, 3]);
});

test('bare peers are ordered closest-first then A-Z, and `bare` mirrors that order', () => {
  const census = censusOf([
    { title: 'Zulu bare', box: null, tier: 2 },
    { title: 'Alpha bare', box: null, tier: 2 },
    { title: 'Mike bare', box: null, tier: 1 },
    { title: 'Boxed one', box: 'Infobox artwork', tier: 1 },
  ]);
  const ev = buildEvidence(census, [], []);
  assert.deepEqual(ev.barePeers.map((p) => p.title), ['Mike bare', 'Alpha bare', 'Zulu bare']);
  assert.deepEqual(ev.bare, ['Mike bare', 'Alpha bare', 'Zulu bare']);
});

test('the `bare` field stays an array of strings (Lead Balancer renders it verbatim)', () => {
  const census = censusOf([{ title: 'Some bare article', box: null, tier: 1 }]);
  const ev = buildEvidence(census, [], []);
  assert.ok(Array.isArray(ev.bare));
  for (const b of ev.bare) assert.equal(typeof b, 'string');
  // and boxedPeers keeps the keys that consumer reads
  const boxed = buildEvidence(censusOf([{ title: 'X', box: 'Infobox artwork', tier: 1 }]), [], []);
  assert.deepEqual(Object.keys(boxed.boxedPeers[0]).sort(), ['reviewed', 'template', 'tier', 'title'].sort());
  assert.equal(typeof boxed.boxedPeers[0].title, 'string');
  assert.equal(typeof boxed.boxedPeers[0].template, 'string');
});

test('ordering is stable without a recommendation, and falls back to A-Z within a tier', () => {
  const census = censusOf([
    { title: 'C', box: 'Infobox artwork', tier: 2 },
    { title: 'A', box: 'Infobox company', tier: 2 },
    { title: 'B', box: 'Infobox galaxy', tier: 2 },
  ]);
  const ev = buildEvidence(census, [], []);
  assert.deepEqual(ev.boxedPeers.map((p) => p.title), ['A', 'B', 'C']);
  assert.equal(ev.preferredTemplate, null);
});

test('review classes are attached as annotations, and their absence is graceful', () => {
  const census = censusOf([
    { title: 'Reviewed boxed', box: 'Infobox artwork', tier: 1 },
    { title: 'Unreviewed boxed', box: 'Infobox artwork', tier: 1 },
    { title: 'Reviewed bare', box: null, tier: 2 },
  ]);
  const assessments = new Map([
    ['Reviewed boxed', { class: 'GA', project: 'Visual arts' }],
    ['Reviewed bare', { class: 'FA', project: 'Visual arts' }],
  ]);
  const ev = buildEvidence(census, [], [], { assessments });
  const byTitle = Object.fromEntries(ev.boxedPeers.map((p) => [p.title, p]));
  assert.equal(byTitle['Reviewed boxed'].reviewed.class, 'GA');
  assert.equal(byTitle['Unreviewed boxed'].reviewed, null);
  assert.equal(ev.barePeers[0].reviewed.class, 'FA');

  const noAssess = buildEvidence(census, [], []);
  for (const p of noAssess.boxedPeers) assert.equal(p.reviewed, null);
  for (const p of noAssess.barePeers) assert.equal(p.reviewed, null);
});

test('the samples stay capped at 8 but report against the full pool', () => {
  const peers = Array.from({ length: 20 }, (_, i) => ({
    title: `Peer ${String(i).padStart(2, '0')}`,
    box: i % 2 ? 'Infobox artwork' : null,
    tier: 1,
  }));
  const ev = buildEvidence(censusOf(peers), [], []);
  assert.equal(ev.boxedPeers.length, 8);
  assert.equal(ev.barePeers.length, 8);
  assert.equal(ev.total, 20);
  assert.equal(ev.withInfobox, 10);
});

// --- bestClass ---------------------------------------------------------------

test('bestClass picks the highest-ranked class across projects', () => {
  assert.deepEqual(bestClass({ Biography: { class: 'C' }, 'Military history': { class: 'FA' } }), {
    class: 'FA',
    project: 'Military history',
  });
  assert.equal(bestClass({ X: { class: 'GA' }, Y: { class: 'B' } }).class, 'GA');
  assert.equal(bestClass({ X: { class: 'Start' } }).class, 'Start');
  assert.equal(bestClass({ X: { class: '' } }), null);
  assert.equal(bestClass({ X: { class: 'weird' } }), null);
  assert.equal(bestClass(null), null);
  assert.equal(bestClass({}), null);
});

// --- fetchAssessments: batching + caching, with a stub api -------------------

test('fetchAssessments batches, caches per title, and survives absent pages', async () => {
  const store = new Map();
  let calls = 0;
  const api = {
    readKeyed: (ns, key) => (ns === 'assess' ? store.get(key) : undefined),
    writeKeyed: (ns, key, value) => ns === 'assess' && store.set(key, value),
    enwiki: async ({ titles }) => {
      calls++;
      const list = String(titles).split('|');
      return {
        query: {
          pages: list
            .filter((t) => t !== 'Missing page')
            .map((t) => ({ title: t, pageassessments: { Biography: { class: 'GA' } } })),
        },
      };
    },
  };
  const titles = Array.from({ length: 60 }, (_, i) => `Article ${i}`);
  titles.push('Missing page');
  const first = await fetchAssessments(api, titles);
  assert.equal(calls, 2, '61 titles → two batched calls');
  assert.equal(first.get('Article 0').class, 'GA');
  assert.equal(first.get('Missing page'), null);
  const second = await fetchAssessments(api, titles);
  assert.equal(calls, 2, 'a second run is fully cache-served');
  assert.equal(second.size, first.size);
});
