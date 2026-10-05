// Guard for the labelled corpus: every `expected` value must be something a run
// can actually satisfy.
//
// This exists because two fixtures carried `expected: "Infobox"` — the generic
// meta-template that isSupportingInfobox() deliberately never treats as a
// primary — so the eval counted the tool wrong for not naming it. A label the
// engine can never produce is a corpus bug, and it should fail here rather than
// silently depress the score.
//
// Run: node --test test/fixture-labels.test.mjs   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INFOBOX, isSupportingInfobox } from '../lib/census.js';

const { cases, meta } = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));

const labelOf = (c) => {
  const e = c.expected;
  if (e == null) return null; // deliberately unlabelled
  const s = String(e);
  return s.startsWith('consistent:') ? s.slice('consistent:'.length) : s;
};

test('every fixture label is a real, recommendable template (or none / null)', () => {
  for (const c of cases) {
    const label = labelOf(c);
    if (label == null || label === 'none') continue;
    assert.ok(
      INFOBOX(label),
      `${c.title}: label "${label}" is not an infobox-family template name (INFOBOX() rejects it)`
    );
    assert.ok(
      !isSupportingInfobox(label),
      `${c.title}: label "${label}" is a supporting/meta template — the engine never recommends ` +
        `it as a primary, so no run can satisfy this label (see test/results/fixture-drift.json)`
    );
  }
});

test('the corpus records which backlog it froze and when it was audited', () => {
  assert.ok(meta.builtAt, 'meta.builtAt is missing');
  assert.ok(meta.labelAudit, 'meta.labelAudit is missing');
  assert.match(meta.provenance ?? '', /frozen/i);
});

test('unlabelled cases are explicit, not accidental', () => {
  const unlabelled = cases.filter((c) => c.expected == null);
  for (const c of unlabelled) {
    assert.match(
      String(c.labelSource ?? ''),
      /unlabelled/i,
      `${c.title}: an unlabelled case must say why in labelSource`
    );
  }
});

test('validate labels name a template the engine could confirm', () => {
  for (const c of cases) {
    const e = String(c.expected ?? '');
    if (!e.startsWith('consistent:')) continue;
    const want = e.split(':')[1];
    assert.ok(want && INFOBOX(want), `${c.title}: validate label "${e}" does not name a usable template`);
  }
});
