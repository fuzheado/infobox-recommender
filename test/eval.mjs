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
    distribution: Object.fromEntries(
      Object.entries(ev.distribution ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
    ),
    subCluster: ev.subCluster,
    bareCluster: (ev.bareCluster ?? []).slice(0, 3),
    bare: (ev.bare ?? []).slice(0, 5),
  };
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
const result = {
  meta: {
    date: stamp,
    fixtures: fixtures.meta,
    cases: cases.length,
    limit,
    pipeline: 'infobox-recommender POC',
  },
  summary: { ...stats, decisive, accuracy },
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
