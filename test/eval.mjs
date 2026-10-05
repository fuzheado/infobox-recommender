// test/eval.mjs — run the pipeline over labeled fixtures and compare verdicts
// against ground truth.
//
// Usage:
//   node test/eval.mjs [limit] [--details]
//
// Warm-cache runs are fast (cache-first); the first run per title hits the
// live APIs (~60s/title). Labels come from test/fixtures.json (editor-choice
// stale-tag templates + manual doc-backed cases).
//
// Persists results to test/results/<date>.json + <date>.md (and latest.*),
// so every evaluation is reproducible and reviewable.

import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createApi } from '../lib/api.js';
import { sameFamily } from '../lib/families.js';
import { analyze } from '../lib/analyze.js';

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')
);
const args = process.argv.slice(2);
const limit = parseInt(args[0] ?? '0', 10) || Infinity;
const details = args.includes('--details');

const api = createApi({ cacheDir: 'cache', paceMs: 1000 });
const cases = fixtures.cases.slice(0, limit);
console.log(`eval: ${cases.length} cases (of ${fixtures.cases.length} fixtures)\n`);

const stats = { pass: 0, fail: 0, abstain: 0, excluded: 0 };
const failures = [];
const rows = [];

function evidenceSummary(r) {
  const ev = r.evidence ?? {};
  return {
    total: ev.total,
    coverage: ev.coverage,
    dominant: ev.dominant,
    // EARLY_STOP: how much of the pool the verdict was actually based on. Kept in
    // the recorded results so a run with early stopping is comparable to one
    // without, rather than silently cheaper and unverifiable.
    peerPool: ev.peerPool,
    censusPeers: ev.censusPeers,
    stoppedEarly: ev.stoppedEarly,
    // The dominance ratio belongs in the record: offline analysis otherwise has
    // to re-derive ``boxed'' from the distribution to check a decision, which is
    // how a re-implementation silently drifts from the engine.
    withInfobox: ev.withInfobox,
    dominanceShare: ev.dominanceShare,
    templateAdvice: ev.templateAdvice,
    distribution: Object.fromEntries(
      Object.entries(ev.distribution ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
    ),
    subCluster: ev.subCluster,
    bareCluster: (ev.bareCluster ?? []).slice(0, 3),
    bare: (ev.bare ?? []).slice(0, 5),
  };
}

// Two-axis scoring (independent of which decision path produced the verdict, so
// legacy and TWO_AXIS runs are directly comparable):
//   whether — should the article have an infobox at all? (coverage axis)
//   template — when a template is offered, is it the labelled one? (dominance axis)
function twoAxisScore(r, expected) {
  const exp = expected ?? '';
  if (expected == null || String(exp).trim() === '') return { whether: 'unlabelled', template: null };
  if (String(exp).startsWith('consistent')) return { whether: 'validate', template: null };
  const shouldHave = exp !== 'none';
  let whether = 'abstain';
  if (r.verdict === 'recommend') whether = shouldHave ? 'pass' : 'fail';
  else if (r.verdict === 'none-warranted') whether = shouldHave ? 'fail' : 'pass';
  const offered = r.template ?? r.evidence?.templateAdvice?.template ?? null;
  // Three outcomes now, because a family match is not the same as a miss: the
  // specificity ladder (lib/families.js) means {{Infobox officeholder}} where an
  // editor chose {{Infobox person}} is a defensible choice, not a wrong template.
  let template = null;
  if (shouldHave && offered) {
    template = offered === exp ? 'exact' : sameFamily(offered, exp) ? 'family' : 'other';
  }
  return { whether, template };
}

for (const c of cases) {
  const r = await analyze(api, c.title, { skipExisting: false });
  const expected = c.expected;
  let outcome;

  if (expected == null) {
    // Unlabelled on purpose (no answer can satisfy the label — see
    // test/results/fixture-drift.json). Counted as excluded, never as a failure.
    outcome = 'excluded';
    stats.excluded++;
  } else if (r.verdict === 'error' || r.verdict === 'excluded') {
    outcome = 'excluded';
    stats.excluded++;
  } else if (r.verdict === 'weak-signal') {
    outcome = 'abstain'; // weak-signal is an honest abstention, not an error
    stats.abstain++;
  } else if (typeof expected === 'string' && expected.startsWith('consistent')) {
    // canonical validate-mode ground truth: the article HAS an infobox and
    // peer practice should confirm it (optionally the exact template)
    const want = expected.split(':')[1] ?? null;
    const cmp = r.comparison;
    if (cmp?.status === 'consistent' && (!want || cmp.current === want)) {
      outcome = 'pass';
      stats.pass++;
    } else {
      outcome = 'fail';
      failures.push({ title: c.title, expected, got: r, outcome: 'validate-inconsistent' });
      stats.fail++;
    }
  } else if (r.verdict === 'recommend') {
    if (expected === r.template) {
      outcome = 'pass';
      stats.pass++;
    } else if (expected === 'none') {
      outcome = 'fail'; // false positive: recommended an infobox for a bare genre
      failures.push({ title: c.title, expected, got: r, outcome: 'false-positive' });
      stats.fail++;
    } else {
      outcome = 'fail'; // wrong template
      failures.push({ title: c.title, expected, got: r, outcome: 'wrong-template' });
      stats.fail++;
    }
  } else if (r.verdict === 'none-warranted') {
    if (expected === 'none') {
      outcome = 'pass';
      stats.pass++;
    } else {
      outcome = 'fail'; // false negative
      failures.push({ title: c.title, expected, got: r, outcome: 'false-negative' });
      stats.fail++;
    }
  } else {
    outcome = 'excluded';
    stats.excluded++;
  }

  rows.push({
    case: c,
    verdict: r.verdict,
    template: r.template ?? null,
    confidence: r.confidence ?? null,
    outcome,
    axes: twoAxisScore(r, c.expected),
    evidence: evidenceSummary(r),
  });

  const mark = { pass: 'PASS', fail: 'FAIL', abstain: 'abstain', excluded: 'skip' }[outcome];
  const verdictLine =
    r.verdict === 'recommend'
      ? `${r.verdict}:${r.template}(${r.confidence})`
      : `${r.verdict}${r.template ? ':' + r.template : ''}`;
  console.log(
    `[${mark}] ${c.title.padEnd(46)} expected=${String(expected).padEnd(18)} got=${verdictLine}`
  );
}

const decisive = stats.pass + stats.fail;
const accuracy = decisive ? Math.round((100 * stats.pass) / decisive) : null;
console.log(`\n--- summary ---`);
console.log(
  `pass ${stats.pass} | fail ${stats.fail} | abstain ${stats.abstain} | skip ${stats.excluded}`
);
console.log(
  `accuracy on decisive verdicts: ${accuracy === null ? 'n/a' : accuracy + '%'} (${stats.pass}/${decisive})`
);
{
  const w = { pass: 0, fail: 0, abstain: 0 };
  const t = { exact: 0, family: 0, other: 0 };
  for (const r of rows) {
    const a = r.axes ?? {};
    if (a.whether === 'pass') w.pass++;
    else if (a.whether === 'fail') w.fail++;
    else if (a.whether !== 'validate') w.abstain++;
    if (a.template === 'exact') t.exact++;
    else if (a.template === 'family') t.family++;
    else if (a.template === 'other') t.other++;
  }
  const wd = w.pass + w.fail;
  const tt = t.exact + t.family + t.other;
  console.log(
    `  whether (coverage axis): ${w.pass} pass / ${w.fail} fail / ${w.abstain} abstain — ` +
      `${wd ? Math.round((100 * w.pass) / wd) : 'n/a'}% of decisive`
  );
  console.log(
    `  template axis: ${t.exact}/${tt} exact (${tt ? Math.round((100 * t.exact) / tt) : 'n/a'}%), ` +
      `+${t.family} same-family (${tt ? Math.round((100 * (t.exact + t.family)) / tt) : 'n/a'}% related), ` +
      `${t.other} unrelated`
  );
  const unlabelled = rows.filter((r) => (r.axes ?? {}).whether === 'unlabelled').length;
  if (unlabelled) {
    // NB: computed locally — this block runs before `axes` is declared below, and
    // referring to it here threw a ReferenceError that killed the run *after* the
    // summary printed, so the JSON was silently never written (2026-10-05).
    console.log(`  (${unlabelled} unlabelled case excluded — no answer can satisfy its label)`);
  }
}

if (failures.length && details) {
  console.log('\n--- failures ---');
  for (const f of failures) {
    console.log(`\n${f.title} [${f.outcome}] expected=${f.expected}`);
    const got = f.got;
    console.log(`  verdict: ${got.verdict}${got.template ? ' ' + got.template : ''} (${got.confidence})`);
    if (got.evidence) {
      console.log(`  coverage: ${Math.round(got.evidence.coverage * 100)}% of ${got.evidence.total}`);
      console.log(
        `  distribution: ${Object.entries(got.evidence.distribution ?? {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([t, n]) => `${t} ${n}`)
          .join(', ')}`
      );
    }
  }
}

// Corpus context, recorded with every run so a score is never quoted without it:
//   drift  — the state of the labels (scripts/research/check-fixture-drift.mjs)
//   fingerprint — a hash of the cache's URL set, so two runs can show whether they
//                 measured the same inputs at all (labels are stable; peer sets move)
function corpusContext() {
  let drift = null;
  try {
    const d = JSON.parse(readFileSync('test/results/fixture-drift.json', 'utf8'));
    drift = { checkedAt: d.generatedAt?.slice(0, 10), byBucket: d.byBucket, tagCleared: d.tagCleared };
  } catch {
    /* no drift report yet */
  }
  const h = createHash('sha1');
  let files = 0;
  for (const dir of ['cache', 'cache/templates']) {
    let names = [];
    try {
      names = readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const n of names) {
      h.update(`${dir}/${n}`);
      files++;
      try {
        statSync(`${dir}/${n}`);
      } catch {
        /* raced with the writer */
      }
    }
  }
  return { drift, cacheFingerprint: { files, sha1: h.digest('hex').slice(0, 16) } };
}

// --- persist results ---
const stamp = new Date().toISOString().slice(0, 10);

// Two-axis summary: the combined pass/fail above scores a recommendation on its
// TEMPLATE, so a correct "yes, this genre uses infoboxes" answer is counted as a
// failure when no single template dominates. These two lines separate the axes.
const axes = {
  whether: { pass: 0, fail: 0, abstain: 0, validate: 0, unlabelled: 0, accuracy: null },
  template: { exact: 0, family: 0, other: 0, rate: null, relatedRate: null },
};
for (const r of rows) {
  const a = r.axes ?? {};
  if (a.whether === 'pass') axes.whether.pass++;
  else if (a.whether === 'fail') axes.whether.fail++;
  else if (a.whether === 'validate') axes.whether.validate++;
  else if (a.whether === 'unlabelled') axes.whether.unlabelled++;
  else axes.whether.abstain++;
  if (a.template === 'exact') axes.template.exact++;
  else if (a.template === 'family') axes.template.family++;
  else if (a.template === 'other') axes.template.other++;
}
const wDecisive = axes.whether.pass + axes.whether.fail;
axes.whether.accuracy = wDecisive ? Math.round((100 * axes.whether.pass) / wDecisive) : null;
const tTotal = axes.template.exact + axes.template.family + axes.template.other;
axes.template.rate = tTotal ? Math.round((100 * axes.template.exact) / tTotal) : null;
axes.template.relatedRate = tTotal
  ? Math.round((100 * (axes.template.exact + axes.template.family)) / tTotal)
  : null;

const envFlag = (name, fallback) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(raw));
};
const context = corpusContext();
const result = {
  meta: {
    date: stamp,
    fixtures: fixtures.meta,
    cases: cases.length,
    limit,
    pipeline: 'infobox-recommender POC',
    twoAxis: envFlag('TWO_AXIS', true),
    earlyStop: envFlag('EARLY_STOP', false),
    ...context,
  },
  summary: { ...stats, decisive, accuracy },
  axes,
  results: rows,
};
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const jsonPath = new URL(`./results/${stamp}.json`, import.meta.url);
writeFileSync(jsonPath, JSON.stringify(result, null, 2));
writeFileSync(new URL('./results/latest.json', import.meta.url), JSON.stringify(result, null, 2));

const md = [
  `# Eval results — ${stamp} (${cases.length} cases)`,
  '',
  `Summary: **${stats.pass} pass / ${stats.fail} fail / ${stats.abstain} abstain** — accuracy on decisive verdicts: **${accuracy}%** (${stats.pass}/${decisive})`,
  '',
  `Two axes — **whether**: ${axes.whether.pass} pass / ${axes.whether.fail} fail / ${axes.whether.abstain} abstain ` +
    `(${axes.whether.accuracy}% on decisive, ${axes.whether.validate} validate + ${axes.whether.unlabelled} unlabelled excluded) · ` +
    `**template**: ${axes.template.exact} exact + ${axes.template.family} same-family of ${tTotal} ` +
    `(${axes.template.rate}% exact, ${axes.template.relatedRate}% related)`,
  '',
  '| outcome | title | expected | verdict | confidence |',
  '|---|---|---|---|---|',
  ...rows.map((r) => {
    const mark = { pass: '✅ PASS', fail: '❌ FAIL', abstain: '— abstain', excluded: '⏭ skip' }[r.outcome];
    const verdict =
      r.verdict === 'recommend' ? `recommend:${r.template}(${r.confidence})` : r.verdict;
    return `| ${mark} | ${r.case.title.replaceAll('|', '\\|')} | ${String(r.case.expected).replaceAll('|', '\\|')} | ${verdict.replaceAll('|', '\\|')} | ${r.confidence ?? '—'} |`;
  }),
  '',
].join('\n');
const mdPath = new URL(`./results/${stamp}.md`, import.meta.url);
writeFileSync(mdPath, md);
writeFileSync(new URL('./results/latest.md', import.meta.url), md);
console.log(`\nresults saved: ${jsonPath.pathname} (+ latest.json / .md)`);
