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

// Evidence object shared by the flat decision and the tiered evaluation.
export function buildEvidence(census, banners, bareCluster) {
  return {
    total: census.total,
    coverage: census.coverage,
    withInfobox: census.withInfobox,
    distribution: census.distribution,
    dominant: census.dominant,
    bare: census.bare.slice(0, 8),
    boxedPeers: census.evaluated
      .filter((p) => p.infoboxes.length > 0)
      .slice(0, 8)
      .map((p) => ({ title: p.title, template: p.infoboxes[0] })),
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
  const c = subCluster.byClass;
  if (c && c.n >= 5 && c.coverage >= 0.5 && c.dominant) {
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

