// Unit tests for the two-axis decision model (TWO_AXIS):
//   * coverage decides WHETHER (is an infobox customary here?)
//   * dominance advises WHICH  (and never vetoes WHETHER)
//
// Run: node --test test/two-axis.test.mjs   (or: npm test)
//
// The change was approved on measurements (88-case corpus, 2026-10-05): the
// legacy single verdict let dominance veto coverage, so the 50–70% coverage band
// produced 14 recommendations while the ≥70% band produced 9 abstentions. These
// tests pin the new band boundaries, the advice statuses, the tier preference
// and — importantly — that the legacy path is untouched while the flag is off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsOf } from '../lib/census.js';
import {
  decide,
  decideTwoAxis,
  templateAdvice,
  COVERAGE_RECOMMEND,
  COVERAGE_NONE,
  DOMINANCE_DOMINANT,
} from '../lib/decide.js';

// --- helpers ---------------------------------------------------------------

/** Build a census from a compact peer list: {box, tier}. */
function censusOf(peers, { bare = [], subCluster = {} } = {}) {
  const evaluated = peers.map((p, i) => ({
    title: p.title ?? `Peer ${i}`,
    infoboxes: p.box ? [p.box] : [],
    primary: p.box ?? null,
    tier: p.tier ?? 1,
  }));
  const s = statsOf(evaluated);
  return { ...s, total: s.n, bare, sidebarOnly: [], subCluster, skipped: [], evaluated };
}

/** n peers, `boxed` of them boxed, using `template` (or a cycle of templates). */
function pool(n, boxed, template = 'Infobox example', opts = {}) {
  return censusOf(
    Array.from({ length: n }, (_, i) => ({
      box: i < boxed ? (Array.isArray(template) ? template[i % template.length] : template) : null,
      tier: opts.tierFor ? opts.tierFor(i) : 1,
    })),
    opts
  );
}

const page = { ns: 0, pageprops: {} };
const run = (census, opts = {}) =>
  decideTwoAxis({ title: 'Example', page, census, banners: [], bareCluster: [], ...opts });

// --- the WHETHER axis (coverage) -------------------------------------------

test('coverage >= 70% recommends an infobox', () => {
  const r = run(pool(10, 7)); // exactly at the threshold
  assert.equal(r.verdict, 'recommend');
  assert.match(r.reason, /Most peers have an infobox \(70% of 10\)/);
});

test('coverage just below 70% is weak/mixed, not a recommendation', () => {
  const r = run(pool(100, 69)); // 69%
  assert.equal(r.verdict, 'weak-signal');
  assert.match(r.reason, /weak\/mixed/);
});

test('coverage <= 15% means no infobox customary', () => {
  const r = run(pool(20, 3)); // 15%
  assert.equal(r.verdict, 'none-warranted');
  assert.match(r.reason, /no infobox appears customary/);
});

test('a tiny evaluable pool is an honest low-confidence abstention', () => {
  const r = run(pool(4, 4));
  assert.equal(r.verdict, 'weak-signal');
  assert.equal(r.confidence, 'low');
});

test('small coherent bare pools keep the "none" verdict', () => {
  const r = run(pool(12, 2)); // <15 peers, <=20% coverage
  assert.equal(r.verdict, 'none-warranted');
});

test('the bare-cluster rule still produces none-warranted in the middle band', () => {
  // Coverage 10/40 = 25% (the rule's ceiling), 6 bare peers, 5 of them sharing one category.
  const census = pool(40, 10, 'Infobox example', { bare: ['a', 'b', 'c', 'd', 'e', 'f'] });
  const r = decideTwoAxis({
    title: 'Example',
    page,
    census,
    banners: [],
    bareCluster: [{ category: 'Bare genre', n: 5 }],
  });
  assert.equal(r.verdict, 'none-warranted');
  assert.match(r.reason, /no-infobox sub-genre cluster/);
});

test('dominance never vetoes the whether axis (the bug this fixes)', () => {
  // 76% coverage, templates split → the legacy path abstains, two-axis recommends.
  // Cross-family mix on purpose: artwork (artwork), company (organization), galaxy
  // (astronomical), person (person) — no family reaches half, so this exercises the
  // whole-pool path rather than the family path (see families.test.mjs for that).
  const census = pool(100, 76, ['Infobox artwork', 'Infobox company', 'Infobox galaxy', 'Infobox person']);
  const legacy = decide({ title: 'Example', page, census, banners: [], bareCluster: [] });
  const twoAxis = run(census);
  assert.equal(legacy.verdict, 'weak-signal');
  assert.equal(twoAxis.verdict, 'recommend');
  assert.match(
    twoAxis.reason,
    /no single template dominates across the whole pool — best candidate Infobox artwork \(19\/76 boxed\)/
  );
});

// --- the WHICH axis (dominance, as advice only) ----------------------------

test('advice is "dominant" when one template holds half the boxed peers', () => {
  const a = templateAdvice(pool(20, 10, 'Infobox artwork')); // 100% of boxed
  assert.equal(a.status, 'dominant');
  assert.equal(a.template, 'Infobox artwork');
  assert.equal(a.share, 1);
  assert.equal(a.basis, 'whole-pool');
});

test('advice is "split" below the dominance bar and still names a candidate', () => {
  const census = censusOf([
    ...Array.from({ length: 4 }, () => ({ box: 'Infobox artwork' })),
    ...Array.from({ length: 3 }, () => ({ box: 'Infobox company' })),
    ...Array.from({ length: 3 }, () => ({ box: 'Infobox galaxy' })),
    ...Array.from({ length: 2 }, () => ({ box: null })),
  ]);
  const a = templateAdvice(census);
  assert.equal(a.status, 'split');
  assert.equal(a.template, 'Infobox artwork'); // the plurality, explicitly as advice
  assert.equal(a.share, 0.4);
  assert.deepEqual(a.candidates.slice(0, 3).map((c) => c.template), [
    'Infobox artwork',
    'Infobox company',
    'Infobox galaxy',
  ]);
});

test('an all-bare pool has no template advice at all', () => {
  const a = templateAdvice(pool(10, 0));
  assert.deepEqual(
    { status: a.status, template: a.template, share: a.share, count: a.count },
    { status: 'none', template: null, share: 0, count: 0 }
  );
});

test('a split pool prefers the tightest neighbourhood that agrees', () => {
  // Tight tiers: 12 peers, 10 boxed, all {{Infobox artwork}} (100% of that tier's
  // boxed). Wide pool: 48 more peers, 12 building + 4 venue boxed, so the
  // whole-pool plurality is {{Infobox building}} at 12/26 = 46% (< half) — split.
  // The wide pool mixes FAMILIES (organization + astronomical) on purpose: with
  // building/venue it would be one structure family and the family branch — which
  // now has precedence — would answer instead of the tier branch under test.
  const peers = [
    ...Array.from({ length: 12 }, (_, i) => ({ box: i < 10 ? 'Infobox artwork' : null, tier: i < 6 ? 1 : 2 })),
    ...Array.from({ length: 48 }, (_, i) => ({
      box: i < 12 ? 'Infobox company' : i < 16 ? 'Infobox galaxy' : null,
      tier: 3,
    })),
  ];
  const census = censusOf(peers);
  const wide = templateAdvice(census);
  assert.equal(wide.status, 'split');
  assert.ok(wide.poolShare < DOMINANCE_DOMINANT, 'the whole pool must be genuinely split');
  assert.equal(wide.basis, 'tightest-tier');
  assert.equal(wide.template, 'Infobox artwork');
  assert.equal(wide.tier, 2);
  assert.equal(wide.poolTemplate, 'Infobox company'); // what the whole pool would have said
  assert.ok(wide.share > wide.poolShare);
});

test('a split pool with no coherent tier stays with the whole-pool plurality', () => {
  // One tier only, three templates among 20 boxed peers: top share 40%.
  const peers = Array.from({ length: 40 }, (_, i) => ({
    box: i < 8 ? 'Infobox a' : i < 14 ? 'Infobox b' : i < 20 ? 'Infobox c' : null,
    tier: 1,
  }));
  const a = templateAdvice(censusOf(peers));
  assert.equal(a.status, 'split');
  assert.equal(a.basis, 'whole-pool');
  assert.equal(a.tier, null);
  assert.equal(a.template, 'Infobox a');
  assert.equal(a.poolShare, undefined);
});

// --- wording + contract -----------------------------------------------------

test('a split recommendation names the candidate without UI instructions', () => {
  const r = run(pool(100, 80, ['Infobox artwork', 'Infobox company', 'Infobox galaxy', 'Infobox person']));
  assert.equal(r.verdict, 'recommend');
  assert.match(r.reason, /best candidate Infobox artwork/);
  // `reason` is an API field: the Lead Balancer userscript shows it as its summary
  // line, so it must not point at parts of this tool's own page.
  assert.doesNotMatch(r.reason, /distribution|chart|below/i);
});

test('reasons stay short enough for a downstream 400-char clip', () => {
  // The consumers clip at 400 chars (HANDOFF §7). Keep a margin so a longer
  // template name cannot silently truncate the sentence mid-way.
  for (const census of [
    pool(100, 80, ['Infobox artwork', 'Infobox building', 'Infobox venue', 'Infobox bridge']),
    pool(100, 56, 'Infobox artwork'),
    pool(20, 3),
    pool(200, 30),
    pool(4, 4),
    pool(100, 80, 'Infobox officeholder'), // dominant + family general option
  ]) {
    const r = run(census);
    assert.ok(r.reason.length <= 360, `reason is ${r.reason.length} chars: ${r.reason}`);
  }
});

test('a weak case with a dominant template offers it as advice', () => {
  const r = run(pool(100, 56, 'Infobox artwork'));
  assert.equal(r.verdict, 'weak-signal');
  assert.match(r.reason, /If you do add one, Infobox artwork dominates/);
  assert.equal(r.template, 'Infobox artwork');
  assert.equal(r.templateAdvice.status, 'dominant');
});

test('the verdict vocabulary and the Lead Balancer fields are unchanged', () => {
  const allowed = new Set(['recommend', 'weak-signal', 'none-warranted', 'excluded']);
  for (const census of [pool(20, 3), pool(100, 56), pool(100, 80), pool(4, 4)]) {
    const r = run(census);
    assert.ok(allowed.has(r.verdict), `unexpected verdict ${r.verdict}`);
    assert.ok('template' in r, 'template field must exist for API consumers');
    assert.ok('confidence' in r);
    assert.ok(r.evidence && typeof r.evidence === 'object');
  }
});

test('advice rides in the evidence so the report can render it', () => {
  // Four templates over 80 boxed peers = 25% each, genuinely split.
  const r = run(pool(100, 80, ['Infobox artwork', 'Infobox company', 'Infobox galaxy', 'Infobox person']));
  assert.equal(r.verdict, 'recommend');
  assert.equal(r.evidence.templateAdvice.status, 'split');
  assert.equal(r.evidence.templateAdvice.template, 'Infobox artwork');
});

test('exclusions are returned before any census reasoning', () => {
  const r = decideTwoAxis({
    title: 'Example',
    page: { ns: 0, pageprops: { disambiguation: '' } },
    census: pool(50, 50),
    banners: [],
    bareCluster: [],
  });
  assert.equal(r.verdict, 'excluded');
});

// --- the legacy path stays the default --------------------------------------

test('decide() still applies the old both-conditions rule (default until approved)', () => {
  // 56% coverage + 53% dominance: legacy recommends (this is the Colonna del
  // Leone shape), two-axis calls it weak/mixed with dominant-template advice.
  const census = censusOf([
    ...Array.from({ length: 8 }, () => ({ box: 'Infobox artwork' })),
    ...Array.from({ length: 7 }, () => ({ box: 'Infobox monument' })),
    ...Array.from({ length: 12 }, () => ({ box: null })),
  ]); // 15/27 = 56% coverage, 8/15 = 53% dominance
  const legacy = decide({ title: 'Example', page, census, banners: [], bareCluster: [] });
  const twoAxis = run(census);
  assert.equal(legacy.verdict, 'recommend');
  assert.equal(legacy.template, 'Infobox artwork');
  assert.equal(twoAxis.verdict, 'weak-signal');
  assert.match(twoAxis.reason, /weak\/mixed/);
  assert.equal(twoAxis.templateAdvice.status, 'dominant');
});

test('the thresholds are exported for the docs and the eval narrative', () => {
  assert.equal(COVERAGE_RECOMMEND, 0.7);
  assert.equal(COVERAGE_NONE, 0.15);
  assert.equal(DOMINANCE_DOMINANT, 0.5);
});
