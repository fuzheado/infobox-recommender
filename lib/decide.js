// lib/decide.js — Stage C: decision logic (research doc §5).
//
// - coverage >= 50% + dominant template (>= half of boxed peers) -> recommend
//   that template. Same-class (P31) peers dominate when numerous enough —
//   that's the strongest genre signal (doc: 26/27 imperial elections).
// - coverage <= 25% -> "no infobox customary" (high-value negative).
// - middle band -> weak signal; defer to WikiProject banner / talk page.
// - Exclusions: disambiguation, redirects, lists, non-mainspace.
// - < 5 evaluable peers -> downgrade everything to weak signal.
//
// Template specificity ladder (Infobox astronaut < Person < generic) via the
// template-category taxonomy is future work; POC picks the mode and reports
// the full distribution.

import { has } from './api.js';
import { statsOf } from './census.js';

const LIST_RE = /^(List|Lists|Timeline|Outline|Index) of/i;

// --- Early stop (EARLY_STOP): is more census work pointless? ----------------
//
// True when the census already supports a ONE-SIDED verdict strongly enough that
// further peers are unlikely to change it: a strong recommend (most peers boxed,
// one template dominating) or a strong negative (almost nobody boxed). The mid
// band is deliberately excluded — that is where extra peers carry information.
//
// `minN` exists because a small pool is not a small version of the full pool: it
// is the most specific slice of it, and specificity != typicality. The 2026-10-05
// cap study measured this: caps of 25-75 score 81-85% against 90% at 100+,
// recommending {{Infobox badminton player}} / {{Infobox UK place}} where the
// genre's editors chose person / settlement. So the default caller requires a
// sample at least as large as the accuracy plateau before honouring a stop.
export function isDecisiveStop(
  census,
  { minCoverage = 0.8, minDominance = 0.7, minN = 20, maxNoneCoverage = 0.15 } = {}
) {
  if (!census || !(census.total >= minN)) return false;
  if (
    census.coverage >= minCoverage &&
    census.dominant &&
    (census.dominanceShare ?? 0) >= minDominance
  ) {
    return true;
  }
  return census.coverage <= maxNoneCoverage;
}

// Evidence object shared by the flat decision and the tiered evaluation.
export function buildEvidence(census, banners, bareCluster) {
  return {
    total: census.total,
    coverage: census.coverage,
    withInfobox: census.withInfobox,
    dominanceShare: census.dominanceShare,
    distribution: census.distribution,
    dominant: census.dominant,
    bare: census.bare.slice(0, 8),
    boxedPeers: census.evaluated
      .filter((p) => p.infoboxes.length > 0)
      .slice(0, 8)
      .map((p) => ({ title: p.title, template: p.primary ?? p.infoboxes[0] })),
    sidebarOnly: census.sidebarOnly.slice(0, 8),
    subCluster: census.subCluster,
    bareCluster,
    skipped: census.skipped,
    banners,
  };
}

export function decide({ title, page, census, banners = [], bareCluster = [] }) {
  if (page.ns !== 0) return { verdict: 'excluded', reason: `namespace ${page.ns}` };
  if (has(page.pageprops, 'disambiguation')) {
    return { verdict: 'excluded', reason: 'disambiguation page' };
  }
  if (has(page, 'redirect')) return { verdict: 'excluded', reason: 'redirect' };
  if (LIST_RE.test(title)) return { verdict: 'excluded', reason: 'list page' };

  const { total, coverage, dominant, dominanceShare, distribution, subCluster } = census;

  const evidence = buildEvidence(census, banners, bareCluster);

  if (total < 5) {
    return {
      verdict: 'weak-signal',
      confidence: 'low',
      reason: `only ${total} evaluable peers — not enough for a census`,
      template: dominant?.template ?? null,
      evidence,
    };
  }

  // Same-P31 peers are the strongest genre signal (sub-cluster override).
  // Requires a REAL dominant — a count-1 plurality must never fire.
  const c = subCluster.byClass;
  if (c && c.n >= 5 && c.coverage >= 0.5 && c.dominant && c.dominantShare >= 0.5) {
    return {
      verdict: 'recommend',
      template: c.dominant.template,
      confidence: c.coverage >= 0.75 && c.dominantShare >= 0.75 ? 'high' : 'medium',
      reason:
        `${Math.round(c.coverage * 100)}% of ${c.n} same-class peers use an infobox; ` +
        `${c.dominant.template} dominates within the class (${c.dominant.count}/${c.boxed} class-boxed)`,
      evidence,
    };
  }

  if (coverage >= 0.5 && dominant && dominanceShare >= 0.5) {
    return {
      verdict: 'recommend',
      template: dominant.template,
      confidence:
        coverage >= 0.75 && dominanceShare >= 0.7 && total >= 10 ? 'high' : 'medium',
      reason:
        `${Math.round(coverage * 100)}% of ${total} peers have an infobox; ` +
        `${dominant.template} dominates (${dominant.count}/${census.withInfobox} boxed)`,
      evidence,
    };
  }

  if (total >= 10 && coverage <= 0.15) {
    return {
      verdict: 'none-warranted',
      confidence: coverage <= 0.08 && total >= 20 ? 'high' : 'medium',
      reason:
        `only ${Math.round(coverage * 100)}% of ${total} peer articles carry an infobox — ` +
        `no infobox appears customary in this genre`,
      evidence,
    };
  }

  // Small, coherent peer sets: low coverage alone is enough (the doc's
  // 0/7 institution-articles case).
  if (total < 15 && coverage <= 0.2) {
    return {
      verdict: 'none-warranted',
      confidence: 'medium',
      reason:
        `only ${Math.round(coverage * 100)}% of ${total} peers carry an infobox — ` +
        `no infobox appears customary in this small, coherent genre`,
      evidence,
    };
  }

  // Middle band: a solid shared-category cluster among bare peers signals a
  // "no infobox customary" sub-genre (doc: event vs concept split). This is
  // what makes none-warranted structurally defensible on mixed peer sets.
  // Ceiling kept at the doc's 25% band — above that, a bare cluster usually
  // just mirrors the whole genre (coverage already says it) and a coherent
  // boxed minority (e.g. 15x Infobox street) is a genre in transition.
  if (coverage <= 0.25 && bareCluster.length && census.bare.length >= 5) {
    const top = bareCluster[0];
    const bareTotal = census.bare.length;
    if (top.n >= 5 && top.n / bareTotal >= 0.4) {
      return {
        verdict: 'none-warranted',
        confidence: 'medium',
        reason:
          `${top.n}/${bareTotal} bare peers share Category:${top.category} — ` +
          `a no-infobox sub-genre cluster within the peer set`,
        template: null,
        evidence,
      };
    }
  }

  return {
    verdict: 'weak-signal',
    confidence: 'medium',
    reason:
      `coverage ${Math.round(coverage * 100)}% is in the ambiguous band; ` +
      `defer to the WikiProject banner / talk page consensus`,
    template: dominant?.template ?? null,
    evidence,
  };
}

// Tiered neighborhood evaluation — "start small and adapt". Peers are
// tagged with the tightest tier (group) containing them: smallest category
// or P31 class first (Dallas Cowboys -> Category:NFL teams (32) before the
// wider American-football pool). Evaluate tiers in order; the first tier
// with >= minTierN evaluated peers that is decisive wins. Thresholds are
// deliberately strict (>=80% coverage, >=70% dominance): weaker circles are
// usually membership categories the article sits in but is not OF (a
// declaration inside an imperial-election category) or place categories
// that mix genres — those fall through to the flat decide(). A coherent
// tight circle must also be consistent with the wider pool (top-2
// templates). Returns null when no tier is decisive.
export function tieredEvaluate(census, { minTierN = 10, minCoverage = 0.8, minShare = 0.7 } = {}) {
  const wide = statsOf(census.evaluated);
  const wideTop2 = Object.entries(wide.distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t);
  const maxTier = Math.max(...census.evaluated.map((p) => p.tier ?? 0), 0);
  for (let k = 1; k <= maxTier; k++) {
    const sub = census.evaluated.filter((p) => (p.tier ?? Infinity) <= k);
    const s = statsOf(sub);
    if (s.n < minTierN) continue;
    if (s.coverage >= minCoverage && s.dominant && s.dominanceShare >= minShare) {
      if (wideTop2.includes(s.dominant.template)) {
        return {
          verdict: 'recommend',
          template: s.dominant.template,
          confidence: s.coverage >= 0.9 && s.dominanceShare >= 0.85 ? 'high' : 'medium',
          reason:
            `tightest coherent neighborhood (tier ${k}: ${s.n} peers, ${Math.round(s.coverage * 100)}% boxed, ` +
            `${s.dominant.template} ${s.dominant.count}/${s.withInfobox}) — consistent with the wider pool`,
          tier: k,
        };
      }
      return {
        verdict: 'weak-signal',
        confidence: 'medium',
        reason:
          `the tightest coherent neighborhood (tier ${k}: ${s.n} peers, ${Math.round(s.coverage * 100)}% boxed, ` +
          `${s.dominant.template} ${s.dominant.count}/${s.withInfobox}) contradicts the wider pool — mixed genre signals`,
        template: s.dominant.template,
        tier: k,
      };
    }
    if (s.coverage <= 0.15 && wide.coverage <= 0.3) {
      return {
        verdict: 'none-warranted',
        confidence: s.coverage <= 0.08 && s.n >= 20 ? 'high' : 'medium',
        reason:
          `only ${Math.round(s.coverage * 100)}% of ${s.n} tightest-neighborhood peers carry an infobox — ` +
          `no infobox appears customary in this genre`,
        tier: k,
      };
    }
  }
  return null;
}

// --- Two-axis decision (TWO_AXIS) -------------------------------------------
//
// The tool answers two questions (README: "should it have one — and if so,
// which template?"). The legacy single verdict collapsed them, and because the
// recommend rule required dominance AND coverage, the template axis could veto
// the coverage axis. Measured on the 88-case corpus 2026-10-05: the 50–70%
// coverage band produced 14 recommendations while the >=70% band produced 9
// abstentions (one at 97%) — a genre where 76% of peers are boxed abstained,
// while a 56% genre whose templates happened to agree got a recommendation.
//
// Two-axis separates them:
//   * WHETHER — coverage alone: >= 70% "recommend an infobox", <= 15% "no
//     infobox customary", between = weak/mixed (the honest middle).
//   * WHICH — dominance, always reported as ADVICE, never as a gate: either one
//     template dominates (>= half of the boxed peers) or the pool is split, in
//     which case a best candidate is still named.
// `verdict`/`template` keep their meaning for API consumers (the Lead Balancer
// contract), and `templateAdvice` carries the second axis in full, including
// how strong it is.

export const COVERAGE_RECOMMEND = 0.7;
export const COVERAGE_NONE = 0.15;
export const DOMINANCE_DOMINANT = 0.5;
export const ADVICE_MIN_TIER_N = 10;

function topTemplates(distribution, n = 3) {
  return Object.entries(distribution ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([template, count]) => ({ template, count }));
}

// The tightest neighbourhood that agrees on a template: cumulative tiers in the
// same order tieredEvaluate uses (smallest group first). Returns null when no
// tier of minN peers reaches minShare.
function tightestCoherentTier(census, { minN, minShare }) {
  const evaluated = census.evaluated ?? [];
  const maxTier = Math.max(...evaluated.map((p) => p.tier ?? 0), 0);
  for (let k = 1; k <= maxTier; k++) {
    const sub = evaluated.filter((p) => (p.tier ?? Infinity) <= k);
    if (sub.length < minN) continue;
    const s = statsOf(sub);
    if (s.dominant && s.dominanceShare >= minShare) return { tier: k, ...s };
  }
  return null;
}

/**
 * "Which template?" as advice — never a gate, and never empty for a boxed pool:
 * a split pool still gets a best candidate, marked as such.
 */
export function templateAdvice(
  census,
  { minTierN = ADVICE_MIN_TIER_N, minShare = DOMINANCE_DOMINANT } = {}
) {
  const boxed = census.withInfobox ?? 0;
  const candidates = topTemplates(census.distribution);
  const dominant = census.dominant ?? null;
  const share = boxed && dominant ? dominant.count / boxed : 0;
  if (!boxed || !dominant) {
    return { status: 'none', template: null, share: 0, count: 0, boxed, candidates, basis: null, tier: null };
  }
  if (share >= minShare) {
    return {
      status: 'dominant', template: dominant.template, share, count: dominant.count,
      boxed, candidates, basis: 'whole-pool', tier: null,
    };
  }
  // Split pool: the whole-pool plurality may understate what the closest peers
  // do, so prefer the tightest neighbourhood that does agree when one exists
  // (worked example: whole pool 32% artwork, tightest coherent tier 74%).
  const tier = tightestCoherentTier(census, { minN: minTierN, minShare });
  if (tier) {
    return {
      status: 'split', template: tier.dominant.template, share: tier.dominanceShare,
      count: tier.dominant.count, boxed: tier.withInfobox, candidates,
      basis: 'tightest-tier', tier: tier.tier, poolShare: share, poolTemplate: dominant.template,
    };
  }
  return {
    status: 'split', template: dominant.template, share, count: dominant.count,
    boxed, candidates, basis: 'whole-pool', tier: null,
  };
}

export function decideTwoAxis({ title, page, census, banners = [], bareCluster = [] }) {
  if (page.ns !== 0) return { verdict: 'excluded', reason: `namespace ${page.ns}` };
  if (has(page.pageprops, 'disambiguation')) {
    return { verdict: 'excluded', reason: 'disambiguation page' };
  }
  if (has(page, 'redirect')) return { verdict: 'excluded', reason: 'redirect' };
  if (LIST_RE.test(title)) return { verdict: 'excluded', reason: 'list page' };

  const { total, coverage } = census;
  const advice = templateAdvice(census);
  const evidence = buildEvidence(census, banners, bareCluster);
  evidence.templateAdvice = advice;
  const pct = Math.round(coverage * 100);
  const out = (verdict, reason, extra = {}) => ({
    verdict, reason, evidence, templateAdvice: advice, ...extra,
  });

  if (total < 5) {
    return out('weak-signal', `only ${total} evaluable peers — not enough for a census`, {
      confidence: 'low', template: advice.template,
    });
  }
  if (total >= 10 && coverage <= COVERAGE_NONE) {
    return out(
      'none-warranted',
      `only ${pct}% of ${total} peer articles carry an infobox — no infobox appears customary in this genre`,
      { confidence: coverage <= 0.08 && total >= 20 ? 'high' : 'medium', template: null }
    );
  }
  // Small, coherent peer sets: low coverage alone is enough (the doc's
  // 0/7 institution-articles case).
  if (total < 15 && coverage <= 0.2) {
    return out(
      'none-warranted',
      `only ${pct}% of ${total} peers carry an infobox — no infobox appears customary in this small, coherent genre`,
      { confidence: 'medium', template: null }
    );
  }
  // Middle band where a solid shared-category cluster among bare peers signals a
  // "no infobox customary" sub-genre (doc: event vs concept split).
  if (coverage <= 0.25 && bareCluster.length && census.bare.length >= 5) {
    const top = bareCluster[0];
    const bareTotal = census.bare.length;
    if (top.n >= 5 && top.n / bareTotal >= 0.4) {
      return out(
        'none-warranted',
        `${top.n}/${bareTotal} bare peers share Category:${top.category} — ` +
          `a no-infobox sub-genre cluster within the peer set`,
        { confidence: 'medium', template: null }
      );
    }
  }

  if (coverage >= COVERAGE_RECOMMEND) {
    const clean = advice.status === 'dominant';
    const reason = clean
      ? `Most peers have an infobox (${pct}% of ${total}), and ${advice.template} dominates ` +
        `(${advice.count}/${advice.boxed} boxed).`
      : `Most peers have an infobox (${pct}% of ${total}), but no single template dominates across the ` +
        `whole pool — best candidate ${advice.template} (${advice.count}/${advice.boxed} boxed${disagreement(advice)}).`;
    return out('recommend', reason, {
      template: advice.template,
      confidence: clean && coverage >= 0.85 && advice.share >= 0.6 ? 'high' : 'medium',
    });
  }

  const reason =
    advice.status === 'dominant'
      ? `Infobox case weak/mixed — ${pct}% of ${total} peers carry an infobox, which is not decisive ` +
        `genre-wide. If you do add one, ${advice.template} dominates (${advice.count}/${advice.boxed} boxed).`
      : `Infobox case weak/mixed — ${pct}% of ${total} peers carry an infobox and the best candidate, ` +
        `${advice.template} (${advice.count}/${advice.boxed} boxed${disagreement(advice)}), is not a clear ` +
        `choice. Defer to the WikiProject banner / talk page.`;
  return out('weak-signal', reason, { confidence: 'medium', template: advice.template });
}

// When the tightest coherent neighbourhood and the whole pool disagree about the
// template, say so rather than silently preferring one. Measured on the corpus:
// preferring the tier is neutral for label-exactness (8 vs 9 of 18 cases) and
// the differences are usually specificity (artist vs person, UK place vs
// settlement) — the reader can judge, and neither answer is hidden.
// Note on `reason`: it is an API field, not just UI copy — the Lead Balancer
// userscript renders it as its summary line (clipped at 400 chars, see
// HANDOFF §7), so it must stay self-contained: no pointers to parts of THIS
// page (the distribution panel), and a length that survives the clip. The web
// UI adds its own pointer to the chart below when the advice is split.

function disagreement(advice) {
  if (advice.basis !== 'tightest-tier' || !advice.poolTemplate) return '';
  if (advice.poolTemplate === advice.template) return ' in the tightest coherent neighbourhood';
  return (
    ` in the closest peers; the whole pool leans ${advice.poolTemplate} ` +
    `(${Math.round((advice.poolShare ?? 0) * 100)}%)`
  );
}

