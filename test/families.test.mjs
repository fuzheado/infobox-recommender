// Unit tests for the specificity ladder (lib/families.js) and its use in the
// census aggregates and the template advice.
//
// The ladder exists because the four legacy eval failures were template-FAMILY
// confusions (officeholder vs person, publisher vs company, taxobox vs fossil):
// with only exact names counted, a small pool picks the most specific variant and
// the eval calls it wrong. These tests pin the map's integrity, the family
// aggregates, and the "name the member, state the base" advice.
//
// Run: node --test test/families.test.mjs   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, familyOf, familyById, sameFamily, mappedCount } from '../lib/families.js';
import { INFOBOX, isSupportingInfobox, statsOf } from '../lib/census.js';
import { decideTwoAxis, templateAdvice } from '../lib/decide.js';

const page = { ns: 0, pageprops: {} };
/** Census from a list of primary template names (one peer each). */
function censusOf(templates) {
  const evaluated = templates.map((t, i) => ({
    title: `Peer ${i}`,
    infoboxes: t ? [t] : [],
    primary: t ?? null,
    tier: 1,
  }));
  const s = statsOf(evaluated);
  return { ...s, total: s.n, bare: [], sidebarOnly: [], subCluster: {}, skipped: [], evaluated };
}

// --- the map ---------------------------------------------------------------

test('every member is a plausible infobox template name and never a supporting one', () => {
  for (const f of FAMILIES) {
    for (const m of f.members) {
      assert.ok(INFOBOX(m), `${f.id}: "${m}" is not an infobox-family name`);
      assert.ok(!isSupportingInfobox(m), `${f.id}: "${m}" is a supporting/meta template`);
    }
  }
});

test('a family base, when given, is one of its own members', () => {
  for (const f of FAMILIES) {
    if (f.base == null) continue;
    assert.ok(f.members.includes(f.base), `${f.id}: base "${f.base}" is not in its members`);
  }
});

test('the module refuses to load if a template is listed in two families', () => {
  // The guard is a load-time throw; this asserts the invariant holds for the map
  // as shipped (the constructor would have thrown before we got here).
  const seen = new Map();
  for (const f of FAMILIES) {
    for (const m of f.members) {
      assert.ok(!seen.has(m), `"${m}" in both ${seen.get(m)} and ${f.id}`);
      seen.set(m, f.id);
    }
  }
  assert.equal(mappedCount(), seen.size);
});

test('familyOf answers null for unmapped and unknown names', () => {
  assert.equal(familyOf('Infobox officeholder'), 'person');
  assert.equal(familyOf('Infobox person'), 'person');
  assert.equal(familyOf('Infobox publisher'), 'organization');
  assert.equal(familyOf(null), null);
  assert.equal(familyOf('Some template nobody mapped'), null);
});

test('sameFamily is false when either side is unmapped', () => {
  assert.equal(sameFamily('Infobox officeholder', 'Infobox person'), true);
  assert.equal(sameFamily('Infobox officeholder', 'Infobox galaxy'), false);
  assert.equal(sameFamily('Unmapped one', 'Unmapped two'), false);
  assert.equal(sameFamily('Infobox person', 'Unmapped'), false);
  assert.equal(familyById('person').label, 'biographical');
});

// --- the census aggregates --------------------------------------------------

test('statsOf groups a split pool into one dominating family', () => {
  // 3 officeholder + 2 person + 1 writer = the biographical family at 6/6.
  const census = censusOf([
    'Infobox officeholder', 'Infobox officeholder', 'Infobox officeholder',
    'Infobox person', 'Infobox person', 'Infobox writer',
  ]);
  assert.equal(census.dominant.template, 'Infobox officeholder'); // exact plurality
  assert.equal(census.dominanceShare, 0.5);
  assert.equal(census.dominantFamily.id, 'person');
  assert.equal(census.dominantFamily.count, 6);
  assert.equal(census.dominantFamily.base, 'Infobox person');
  assert.equal(census.familyDominanceShare, 1);
});

test('statsOf leaves families empty for unmapped templates', () => {
  const census = censusOf(['Some unmapped box', 'Another unmapped box']);
  assert.equal(census.dominantFamily, null);
  assert.equal(census.familyDominanceShare, 0);
  assert.deepEqual(census.familyDistribution, {});
});

// --- the advice ------------------------------------------------------------

test('a family split names the most-used member and states the base', () => {
  const census = censusOf([
    'Infobox officeholder', 'Infobox officeholder', 'Infobox musical artist',
    'Infobox person', 'Infobox person', 'Infobox writer', 'Infobox galaxy',
  ]);
  const a = templateAdvice(census);
  assert.equal(a.status, 'split');
  assert.equal(a.basis, 'family');
  assert.equal(a.template, 'Infobox officeholder'); // the member editors use most
  assert.equal(a.family.label, 'biographical');
  assert.equal(a.family.base, 'Infobox person'); // the general option
  assert.ok(a.family.share >= 0.5);
});

test('exact dominance still wins over the family branch', () => {
  const census = censusOf([
    'Infobox officeholder', 'Infobox officeholder', 'Infobox officeholder', 'Infobox person',
  ]);
  const a = templateAdvice(census);
  assert.equal(a.status, 'dominant');
  assert.equal(a.basis, 'whole-pool');
  assert.equal(a.family, undefined);
});

test('the recommendation reason names the member and the general option', () => {
  // 75% coverage (recommend) with the biographical family dominating.
  const census = censusOf([
    ...Array.from({ length: 4 }, () => 'Infobox officeholder'),
    ...Array.from({ length: 4 }, () => 'Infobox person'),
    ...Array.from({ length: 2 }, () => 'Infobox musical artist'),
    ...Array.from({ length: 2 }, () => null),
  ]);
  const r = decideTwoAxis({ title: 'Example', page, census, banners: [], bareCluster: [] });
  assert.equal(r.verdict, 'recommend');
  assert.match(r.reason, /the biographical family covers 100% of boxed peers/);
  assert.match(r.reason, /most used Infobox officeholder/);
  assert.match(r.reason, /general option Infobox person/);
  assert.equal(r.templateAdvice.basis, 'family');
});

test('the weak band says the family is the fallback, not a recommendation', () => {
  // company 2 + publisher 2 + restaurant 1: no single template reaches half (2/5),
  // but the organization family covers 5/5 — the case the ladder exists for.
  const census = censusOf([
    ...Array.from({ length: 2 }, () => 'Infobox company'),
    ...Array.from({ length: 2 }, () => 'Infobox publisher'),
    ...Array.from({ length: 1 }, () => 'Infobox restaurant'),
    ...Array.from({ length: 6 }, () => null),
  ]); // 5/11 coverage → weak/mixed
  const r = decideTwoAxis({ title: 'Example', page, census, banners: [], bareCluster: [] });
  assert.equal(r.verdict, 'weak-signal');
  assert.match(r.reason, /weak\/mixed/);
  assert.match(r.reason, /the organization family covers 100% of boxed peers/);
  assert.match(r.reason, /general option Infobox organization/);
});

test('a dominant template still states its family general option', () => {
  const census = censusOf([
    ...Array.from({ length: 8 }, () => 'Infobox officeholder'),
    ...Array.from({ length: 2 }, () => 'Infobox person'),
    ...Array.from({ length: 2 }, () => null),
  ]);
  const a = templateAdvice(census);
  assert.equal(a.status, 'dominant');
  assert.equal(a.template, 'Infobox officeholder');
  assert.equal(a.base, 'Infobox person'); // the general option, stated alongside
  const r = decideTwoAxis({ title: 'Example', page, census, banners: [], bareCluster: [] });
  assert.match(r.reason, /Infobox officeholder dominates \(8\/10 boxed\); general option Infobox person/);
});

test('an unmapped dominant template has no base to state', () => {
  const census = censusOf([
    ...Array.from({ length: 8 }, () => 'Some unmapped box'),
    ...Array.from({ length: 2 }, () => null),
  ]);
  const a = templateAdvice(census);
  assert.equal(a.status, 'dominant');
  assert.equal(a.base, null);
});
