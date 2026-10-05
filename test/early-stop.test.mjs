// Unit tests for the EARLY_STOP machinery:
//   - censusStages()      (lib/census.js)  — which pool prefixes to census
//   - isDecisiveStop()    (lib/decide.js)  — when a stop is allowed
//
// Run: node --test test/early-stop.test.mjs   (or: npm test)
//
// The behaviour under test is opt-in (EARLY_STOP=1); these tests pin the rule
// itself, so the dangerous direction — stopping on a SMALL, decisive-looking
// pool, which the 2026-10-05 cap study showed is biased toward over-specific
// templates — stays visible rather than accidental.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { censusStages } from '../lib/census.js';
import { isDecisiveStop } from '../lib/decide.js';

// --- censusStages -----------------------------------------------------------

test('censusStages always ends at the full pool, even for a tiny or empty pool', () => {
  assert.deepEqual(censusStages(0), [0]);
  assert.deepEqual(censusStages(1), [1]);
  assert.deepEqual(censusStages(20), [20]);
  assert.deepEqual(censusStages(25), [25]);
});

test('censusStages uses 25-peer boundaries (the census batch size)', () => {
  assert.deepEqual(censusStages(100), [25, 50, 75, 100]);
  assert.deepEqual(censusStages(150), [25, 50, 75, 100, 125, 150]);
});

test('censusStages ends exactly at a non-multiple pool (no peers left uncensused)', () => {
  assert.deepEqual(censusStages(112), [25, 50, 75, 100, 112]);
  assert.deepEqual(censusStages(26), [25, 26]);
});

test('censusStages is ascending and never exceeds the pool', () => {
  for (const size of [0, 3, 25, 26, 99, 100, 137, 150, 251]) {
    const stages = censusStages(size);
    assert.equal(stages.at(-1), size, `last stage must be the whole pool (size ${size})`);
    for (let i = 0; i < stages.length; i++) {
      assert.ok(stages[i] <= size, `stage ${stages[i]} exceeds pool ${size}`);
      if (i) assert.ok(stages[i] > stages[i - 1], 'stages must ascend');
    }
  }
});

// --- isDecisiveStop ---------------------------------------------------------

const census = (over = {}) => ({
  total: 100,
  coverage: 0.5,
  dominanceShare: 0.5,
  dominant: { template: 'Infobox person', count: 50 },
  ...over,
});

test('isDecisiveStop: a strong recommend stops', () => {
  assert.equal(isDecisiveStop(census({ coverage: 0.9, dominanceShare: 0.8 })), true);
  assert.equal(isDecisiveStop(census({ coverage: 0.8, dominanceShare: 0.7 })), true); // inclusive
});

test('isDecisiveStop: a strong negative stops (almost nobody boxed)', () => {
  assert.equal(isDecisiveStop(census({ coverage: 0.1, dominanceShare: 0 })), true);
  assert.equal(isDecisiveStop(census({ coverage: 0.15 })), true); // inclusive
});

test('isDecisiveStop: the ambiguous middle never stops — that is where peers inform', () => {
  assert.equal(isDecisiveStop(census({ coverage: 0.5, dominanceShare: 0.6 })), false);
  assert.equal(isDecisiveStop(census({ coverage: 0.76, dominanceShare: 0.95 })), false); // below coverage bar
  assert.equal(isDecisiveStop(census({ coverage: 0.95, dominanceShare: 0.6 })), false); // split templates
  assert.equal(isDecisiveStop(census({ coverage: 0.16 })), false); // just above the negative bar
});

test('isDecisiveStop: a count-1 "dominant" is not dominance', () => {
  assert.equal(isDecisiveStop(census({ coverage: 0.9, dominanceShare: 0.02 })), false);
  assert.equal(isDecisiveStop(census({ coverage: 0.9, dominanceShare: 0.95, dominant: null })), false);
});

test('isDecisiveStop: a small pool is refused regardless of how decisive it looks', () => {
  // The measured failure mode: 25 same-class peers can be unanimous for a
  // hyper-specific template (badminton player) that the wider genre rejects.
  for (const total of [0, 5, 19]) {
    assert.equal(
      isDecisiveStop(census({ total, coverage: 0.95, dominanceShare: 0.95 })),
      false,
      `pool of ${total} must not be stoppable`
    );
  }
  assert.equal(isDecisiveStop(census({ total: 20, coverage: 0.95, dominanceShare: 0.95 })), true);
});

test('isDecisiveStop: thresholds are overridable and empty input is safe', () => {
  const weak = census({ coverage: 0.6, dominanceShare: 0.55, total: 30 });
  assert.equal(isDecisiveStop(weak), false);
  assert.equal(isDecisiveStop(weak, { minCoverage: 0.5, minDominance: 0.5, minN: 20 }), true);
  assert.equal(isDecisiveStop(null), false);
  assert.equal(isDecisiveStop({}), false);
});
