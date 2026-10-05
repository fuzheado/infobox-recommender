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

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createApi } from '../lib/api.js';
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
  if (String(exp).startsWith('consistent')) return { whether: 'validate', template: null };
  const shouldHave = exp !== 'none';
  let whether = 'abstain';
  if (r.verdict === 'recommend') whether = shouldHave ? 'pass' : 'fail';
  else if (r.verdict === 'none-warranted') whether = shouldHave ? 'fail' : 'pass';
  const offered = r.template ?? r.evidence?.templateAdvice?.template ?? null;
  const template = shouldHave && offered ? (offered === exp ? 'exact' : 'other') : null;
  return { whether, template };
}

for (const c of cases) {
  const r = await analyze(api, c.title, { skipExisting: false });
  const expected = c.expected;
  let outcome;

  if (r.verdict === 'error' || r.verdict === 'excluded') {
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
  const t = { exact: 0, other: 0 };
  for (const r of rows) {
    const a = r.axes ?? {};
    if (a.whether === 'pass') w.pass++;
    else if (a.whether === 'fail') w.fail++;
    else if (a.whether !== 'validate') w.abstain++;
    if (a.template === 'exact') t.exact++;
    else if (a.template === 'other') t.other++;
  }
  const wd = w.pass + w.fail;
  const tt = t.exact + t.other;
  console.log(
    `  whether (coverage axis): ${w.pass} pass / ${w.fail} fail / ${w.abstain} abstain — ` +
      `${wd ? Math.round((100 * w.pass) / wd) : 'n/a'}% of decisive`
  );
  console.log(
    `  template (dominance axis): ${t.exact}/${tt} exact — ${tt ? Math.round((100 * t.exact) / tt) : 'n/a'}% ` +
      `(of cases where a template is offered and the label names one)`
  );
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

// --- persist results ---
const stamp = new Date().toISOString().slice(0, 10);

// Two-axis summary: the combined pass/fail above scores a recommendation on its
// TEMPLATE, so a correct "yes, this genre uses infoboxes" answer is counted as a
// failure when no single template dominates. These two lines separate the axes.
const axes = {
  whether: { pass: 0, fail: 0, abstain: 0, validate: 0, accuracy: null },
  template: { exact: 0, other: 0, rate: null },
};
for (const r of rows) {
  const a = r.axes ?? {};
  if (a.whether === 'pass') axes.whether.pass++;
  else if (a.whether === 'fail') axes.whether.fail++;
  else if (a.whether === 'validate') axes.whether.validate++;
  else axes.whether.abstain++;
  if (a.template === 'exact') axes.template.exact++;
  else if (a.template === 'other') axes.template.other++;
}
const wDecisive = axes.whether.pass + axes.whether.fail;
axes.whether.accuracy = wDecisive ? Math.round((100 * axes.whether.pass) / wDecisive) : null;
const tTotal = axes.template.exact + axes.template.other;
axes.template.rate = tTotal ? Math.round((100 * axes.template.exact) / tTotal) : null;

const result = {
  meta: {
    date: stamp,
    fixtures: fixtures.meta,
    cases: cases.length,
    limit,
    pipeline: 'infobox-recommender POC',
    twoAxis: process.env.TWO_AXIS === '1' || /^(1|true|yes|on)$/i.test(process.env.TWO_AXIS ?? ''),
    earlyStop: /^(1|true|yes|on)$/i.test(process.env.EARLY_STOP ?? ''),
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
    `(${axes.whether.accuracy}% on decisive, ${axes.whether.validate} validate cases excluded) · ` +
    `**template**: ${axes.template.exact}/${tTotal} exact (${axes.template.rate}%)`,
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
