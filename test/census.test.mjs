// Unit tests for the infobox-family census primitives — most importantly
// PRIMARY-box selection, where subsidiary section boxes ({{Infobox
// university rankings}} under {{Infobox university}}, {{Infobox medal
// record}} under {{Infobox sportsperson}}) must never win the primary slot.
//
// Regression: 2026-08-28 — "Icelandic College of Art and Crafts" surfaced a
// peer (Reykjavík University) whose {{Infobox university rankings}} box
// beat {{Infobox university}} on the old longest-name heuristic.
//
// Run: node --test test/   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primaryInfobox, isSupportingInfobox } from '../lib/census.js';

test('subsidiary box never wins when the subject box is present', () => {
  // The reported regression: {{Infobox university}} + {{Infobox university
  // rankings}} on Reykjavík University.
  assert.equal(
    primaryInfobox(['Infobox', 'Infobox university', 'Infobox university rankings']),
    'Infobox university'
  );
  // US/UK ranking variants (Stanford, Oxford) share no name prefix with the
  // subject box — caught by the subsidiary-suffix rule.
  assert.equal(
    primaryInfobox(['Infobox', 'Infobox university', 'Infobox US university ranking']),
    'Infobox university'
  );
  assert.equal(
    primaryInfobox(['Infobox', 'Infobox university', 'Infobox UK university rankings']),
    'Infobox university'
  );
  // Medal record box under a sportsperson biography (tie on length — the
  // suffix rule must break it in the biography's favor).
  assert.equal(
    primaryInfobox(['Infobox sportsperson', 'Infobox medal record']),
    'Infobox sportsperson'
  );
  // Career-statistics box under a tennis biography.
  assert.equal(
    primaryInfobox(['Infobox tennis biography', 'Infobox tennis career statistics']),
    'Infobox tennis biography'
  );
});

test('standalone subsidiary-named boxes are untouched (relative penalty only)', () => {
  assert.equal(primaryInfobox(['Infobox university rankings']), 'Infobox university rankings');
  assert.equal(primaryInfobox(['Infobox award']), 'Infobox award');
  assert.equal(primaryInfobox(['Infobox medal record']), 'Infobox medal record');
});

test('supporting/legacy/meta boxes never win', () => {
  assert.equal(
    primaryInfobox(['Infobox person', 'Infobox medal templates', 'Infobox astronaut']),
    'Infobox astronaut'
  );
  assert.equal(
    primaryInfobox(['Infobox U.S. state', 'Infobox settlement', 'Infobox region symbols']),
    'Infobox U.S. state'
  );
  assert.equal(isSupportingInfobox('Infobox'), true);
  assert.equal(isSupportingInfobox('Infobox3cols'), true);
  assert.equal(isSupportingInfobox('Infobox isotopes (meta)'), true);
  assert.equal(isSupportingInfobox('Infobox americium isotopes'), true);
  assert.equal(isSupportingInfobox('Infobox university'), false);
});

test('generic place boxes lose to more specific candidates', () => {
  assert.equal(
    primaryInfobox(['Infobox settlement', 'Infobox U.S. state']),
    'Infobox U.S. state'
  );
  assert.equal(
    primaryInfobox(['Infobox subdivision', 'Infobox settlement']),
    'Infobox subdivision' // both generic-place: equal penalty, longer name wins
  );
});

test('specificity (longest name) still wins between real subject boxes', () => {
  assert.equal(primaryInfobox(['Infobox person', 'Infobox officeholder']), 'Infobox officeholder');
  assert.equal(primaryInfobox(['Infobox person', 'Infobox astronaut']), 'Infobox astronaut');
  assert.equal(primaryInfobox(['Infobox election', 'Infobox former country']), 'Infobox former country');
});

test('empty input returns null; legacy-only pages fall back to longest', () => {
  assert.equal(primaryInfobox([]), null);
  assert.equal(primaryInfobox(['Infobox', 'Infobox3cols']), 'Infobox3cols');
});
