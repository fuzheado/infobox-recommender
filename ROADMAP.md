# ROADMAP — infobox-recommender

**Last updated:** 2026-10-05 · Complements `HANDOFF.md` (status), `status-quo.md`
(why it exists), `test/EVALUATION.md` (what the engine gets wrong), and
`signals.md` (signal hypotheses). This doc is the *what's next* — prioritized
with effort estimates and the eval targets each item should move.

---

## Where we are

- **Engine (Stages A–C): mature and honest.** 88-case corpus, **57 pass /
  6 fail / 25 abstain — 90% on decisive verdicts** (`test/EVALUATION.md`).
- **The failure analysis is reassuringly boring**: 4 of the 6 fails are
  judgment calls or weak labels where the recommender is arguably *right*
  (trace fossils, set-index pages). Only **2 are genuine engine gaps** —
  both are the **specificity ladder** (publisher ⊂ company, person vs
  officeholder vs musical artist). The 25 abstains are the designed honest
  middle band; the documented lever to convert them is **semantic
  sub-clustering** (`signals.md` H3).
- **Distribution: functional but reach-limited.** Toolforge web UI with a
  good report renderer, validate mode, shareable URLs; CLI + JSON API;
  unit suite (`npm test`). The status-quo research shows the real need
  lives at the *moment of editing* — the tool is still a destination, not
  an aid.

**The bottleneck is no longer accuracy — it's reach.**

## Strategy

Two tracks, run in parallel:

- **Track A — Engine:** convert the remaining fails and abstains.
  Specificity ladder first (cheap, fixes 2 fails), then semantic
  sub-clustering (the big abstain lever).
- **Track B — Reach:** put verdicts where editors work. Userscript,
  talk-page posting, backlog triage. Accuracy is already where the market
  assessment said it needs to be; the documented need is at the point of
  editing, not at a URL.

---

## Tier 1 — do next (highest leverage)

### 1. Template specificity ladder (Track A · effort: small · fixes 2/6 fails)

Pick the *most specific* template via a template ⊂ template map
(publisher ⊂ company, officeholder ⊂ person, astronaut ⊂ person). Seeds
already exist: `fetchTemplateFacts()` in `lib/census.js` returns the
transclusion graph per run; the reference map is `Category:Infobox
templates`' subcategory tree.

- **Watch out:** the `primaryInfobox` comment records that transclusion
  ranking "proved label-divergent for person-family stacks" — seed from the
  category tree, use transclusion only as cross-check, and keep the
  subsidiary-box penalties from 2026-08-28 as the first filter layer.
- **Eval target:** Strengholt Holding (publisher/company) passes;
  person/officeholder/musical-artist near-misses resolve; 57 → 59+ pass,
  or fails shrink to the true judgment-call set.
- **Second reason to do this (2026-10-05 peer-cap study):** the decision is about
  **twice as sensitive to dominance as to coverage** (17 cases sit within ±0.05
  of the 0.5 dominance threshold, against 9 for coverage), and every failure a
  *small* peer pool produces is a template-**family** confusion (badminton player
  ⊂ person, UK place ⊂ settlement, company ⊂ restaurant). Counting dominance over
  families rather than exact templates attacks both problems — and would relax
  the pressure that currently argues for a large pool (see §7a item 3).

### 2. Semantic sub-clustering via LiftWing topics (Track A · effort: medium · converts abstains)

Cluster the peer set by topic to (a) drop wrong-genre peers (enzymes in
Venice campos sets, the mixed spa genre around Blue Lagoon) and (b) split
event-vs-concept for the institution/"none" cases — the doc's stated next
step (`EVALUATION.md` §6.3, `signals.md` H3).

- **Approach:** the `outlink-topic-model` LiftWing model (it replaced the older
  `articletopic`; ORES-style alias `{wiki}-articletopic`) is proven infra — the
  WMF Microtask Generator uses it today (same endpoint, skill:
  `wikimedia-ml-services`). Batch-fetch topic vectors for the peer set at
  census time, cluster, and feed a sub-cluster split into `lib/decide.js`.
- **Eval target:** abstains → decisive verdicts on the concept/institution
  class (Prince-elector cluster); accuracy on decisive verdicts ≥ 92%.

### 3. Userscript (Track B · effort: medium · the distribution win)

The libs are runtime-agnostic by design — same files run in a browser
userscript with `{ cacheDir: null, paceMs: 0 }` (enwiki calls are
same-origin; Wikidata needs `origin=*`, anonymous read-only supported).

- **Roll-out:** personal script on `User:Fuzheado/common.js` first, then a
  gadget once the repo is public. Add an "Check infobox practice" action to
  article pages (and the VE template-insert flow if feasible), rendering
  the existing report in a panel — `public/app.js` renderer transfers
  directly.
- **Success:** the "which infobox?" question answered *at the moment it is
  asked*, which is the gap every prior attempt (T184145, TemplateWizard,
  Microtask Generator) stopped short of.

### 4. Copy talk-page summary + w.wiki shortlink (Track B · effort: tiny)

The verdict's core purpose is the MOS:INFOBOXUSE consensus argument — make
it one click: a "Copy talk-page summary" button that renders the evidence
as ready-to-post wikitext (verdict, coverage, distribution, boxed/bare peer
examples) and a `w.wiki` short URL for pasting into the discussion
(shortener API is callable server-side per `wikimedia-url-shortener`).

- **Files:** one button in `public/app.js` + one endpoint in `server.mjs`.
- **Why:** this is the "editor weighs the argument themselves" workflow the
  README promises — currently the user has to assemble it by hand.

### 5. Backlog batch scanner (Track B · effort: small · serves the linked audience)

`node cli.js --batch "Category:Wikipedia articles with an infobox request"
--limit 100` → a worklist table (title, verdict, template, confidence) with
CSV/wikitable export — the same export format as the WMF Microtask
Generator, so the two tools compose.

- **Side effect:** warms the disk cache for the whole backlog, making every
  subsequent `/?title=` analysis instant on Toolforge — the home page's
  "hundreds of real infoboxless articles" link becomes an actionable triage
  queue instead of a category browser.

---

## Tier 2 — strong, moderate effort

### 6. Stage D — draft infobox preview (Track A+B · the "what would it look like" gap)

For a recommended template: pull TemplateData + the article's Wikidata
statements, compute per-field fill rate, and render a *draft* infobox with
the filled values. This is the Databox idea done as a **draft proposal** —
which is what enwiki's curated-template norm permits (the 2018 Infobox RfC
rejected auto-rendered boxes, not editor-posted drafts). Turns "recommend
{{Infobox university}}" into "here's the filled box — post it if you agree".

### 7. Child-box auto-detection + per-element wrapper merge (Track A · hygiene)

- Detect supporting boxes by fetching template content and matching
  `child = yes` / `{{Infobox | child…` instead of the curated
  `SUPPORTING_INFOBOXES` set (keep the curated set as fallback).
- Merge wrapper families transclusively ({{Infobox americium}} wraps
  {{Infobox element}}) so element/isotope distributions unify (the Oxygen
  case currently abstains with a fragmented class).
- Both live in `lib/census.js`, guarded by `npm test`.

### 7a. Analysis latency — done 2026-10-04, with the next levers measured

Audited with `scripts/bench-analysis.mjs` (request-level timeline). Cold runs
were request-count bound: **Canut revolts 20.4s → 6.6s**, **Abraham Lincoln
26.8s → 13.7s** (147 peers), same verdicts, and `npm run eval` stayed at
57/6/25. Fixes: parallel census batches, a shorter census chain (25-title first
pass), one Wikidata request instead of seven, one WDQS query per pointer
property instead of one per value, and a per-page cache that survives batch-shape
changes. Details and the pacing policy: `ARCHITECTURE.md#performance--caching`.

Remaining measured levers, in order of expected value:

1. **Category-member fan-out** (5 requests on a typical article, one per
   candidate category, in one wave) — could be cut by fetching members for
   fewer/merged categories; needs an accuracy check.
2. ~~**Adaptive early stop**~~ — **implemented 2026-10-05, opt-in**. `EARLY_STOP=1`
   censuses in 25-peer stages and stops once the evidence is already decisive
   (coverage ≥ 80% and dominance ≥ 70%, or coverage ≤ 15%, always with n ≥ 20 —
   `isDecisiveStop()` in `lib/decide.js`). Staging costs no extra requests: the
   per-page cache means each peer page is fetched once either way.
   Measured trade-off (`npm run eval`, `test/results/early-stop-study.json`):
   with the default floor (`EARLY_STOP_MIN=100`) it is **verdict-identical**
   (57/6/25, 90%) while censusing **6% fewer peers** (12 of 88 articles stopped
   early); a floor of 25 saves **37%** and costs **4 accuracy points** (86%),
   breaking exactly the over-specific cases the cap study predicted. Left **off
   by default**: the saving is modest and the failure mode is silent.
   Next refinement, if the saving is ever worth chasing: stop on a **tier**
   boundary (tightest group first) instead of a peer count — same savings,
   better-aligned evidence — and model the report as "N of M peers".
3. **Peer-set size — measured 2026-10-05: keep 150.** The cap binds for **24 of
   88** articles (median candidate pool 100, max 350); for the rest it is inert.
   `scripts/research/peer-cap-study.mjs` sweeps it and re-runs the real pipeline
   (validated: at 150 it reproduces `test/results/latest.json` case-for-case —
   57/6/25, 90%). Findings:
   - accuracy by cap: **81% (25) · 81% (50) · 85% (75) · 90% (100) · 89% (125) ·
     90% (150) · 89% (uncapped)**. A small pool is not "safer": the tightest
     circle is the *most specific* group, and specificity ≠ typicality — at cap
     25 the tool recommends {{Infobox badminton player}} / {{Infobox UK place}}
     / {{Infobox company}} where the genre's editors chose person / settlement /
     restaurant. Wrong decisive calls: 11 at cap 25 vs 6 at 150.
   - **no dilution:** boxed rate *rises* with discovery rank (72% at ranks 1–25 →
     84% at 201+), median coverage is flat (0.756 at 150 vs 0.761 uncapped), and
     per-article coverage moves both ways (36 down >2pts, 32 up >2pts, median
     delta 0.000). The tail is dominated by same-type pointer peers, mostly boxed.
   - what extra peers dilute is **dominance** (template agreement): median 0.739
     at cap 25 → 0.655 at 150. 17 cases sit within ±0.05 of the 0.5 dominance
     threshold vs 9 near coverage — the decision is ~2× more dominance-sensitive.
   - verdict changes vs the uncapped pool: **0 (150)**, 1 (125), 5 (100), 8 (75),
     11 (50), 20 (25). Cap 100 is the accuracy plateau and defensible **only** as
     a cost trade (5/88 verdicts change, direction mixed) — needs a bigger corpus
     before adopting.
   - design smell, low urgency: truncation happens in *signal* order (all P31-class
     peers → categories → pointer peers last), so the cap cuts the highest-precision
     cohort first — 449 pointer peers across the 24 binding articles (Abraham
     Lincoln loses 101 of its 227). Verdict-neutral today (150 vs uncapped = 0
     verdict changes); it would matter only if one huge class flooded the cap.
   Numbers: `test/results/peer-cap-study.json`.

### 7b. Phantom-box coverage inflation (Track A · accuracy · measured)

`prop=templates` reports templates used by *transcluded* templates too, so a
page whose template internally calls `{{Infobox}}` is counted as boxed.
Measured 2026-10-03 (`usage-history.md`, `scripts/research/phantom-box-check.mjs`):
**1 phantom in 70 articles (~1.4% of articles, ~9% of "boxed" verdicts)** —
small, and no verdict flipped in the sample, but it inflates coverage.
Fix options: confirm boxed-ness from the article's own wikitext when a verdict
is close to a threshold, or re-check candidate dominants. Don't switch the
whole census to wikitext fetching — 150 peers per run is the cost that bought
batched `prop=templates`.

### 8. Outcome tracking — measure adoption (Track A · evidence)

**Substrate in place (2026-10-03):** `usage/` records one privacy-filtered line
per analysis (verdict, template, title, timestamp; 90-day raw retention,
counts-only aggregates at `/stats`), and `scripts/usage-report.mjs --adoption`
re-checks whether "recommend" verdicts were later acted on.

**Remaining:** run the adoption report on a schedule (e.g. monthly) and record
the rate in `test/EVALUATION.md`. First observed candidate: *May 1400 imperial
election* — the tool recommended {{Infobox election}}, and an editor added it
on 2026-10-02 (correlation, not proof of causation — which is exactly why the
rate needs measuring over many cases rather than anecdote).

### 9. Backlog-age analysis + stale-tag cleanup (Track B · research + maintenance)

Quantify the `|date=` distribution on {{Infobox requested}} tags (the
demand check recommended in `status-quo.md` §8.1) and offer a supervised
workflow: validate → remove the tag. 57/601 backlog articles carry the tag
*and* an infobox — a small, safe, visible contribution to
WikiProject Infoboxes.

---

## Tier 3 — visibility & polish

10. ~~**Repo public**~~ (**done 2026-08-28**) **+ Diff post + WikiProject
    outreach** — a Diff writeup fits the project's research lineage; the
    WikiProject Infoboxes /assistance page exists for exactly this.
11. **Microtask Generator integration** — their "add an infobox" task ends
    at "find similar articles to copy template structure"; a link to
    `/?title=X` is the natural handoff (their Diff post invites
    collaboration).
12. **UI polish** — analysis-freshness note ("cached as of …"),
    dark theme, confidence tooltips ("why medium?"), keyboard shortcut for
    the search box.

---

## Explicitly not doing

- **Other wikis / i18n** — not now. The cross-edition measurement
  (`wikiprojects-and-i18n.md`, `infobox-naming.md`) shows why: a naive English
  `^Infobox` name rule catches only **60%** of infobox templates across 20
  editions (78.6% even with a position-agnostic ceiling), and 12/20 editions
  fall below 50%. That *supports* the name-independent approach this tool
  already uses (P31 + categories), but porting also needs per-edition census
  norms — dewiki, for example, avoids biography infoboxes by consensus.
- **Browser extension** — the userscript covers it at a fraction of the
  maintenance.
- **Notification/RSS systems** — no demand signal.
- **Auto-posting bots** — enwiki's infobox history (2013 ArbCom case) says
  the community accepts *evidence*, not automation.

---

## Success metrics

| Area | Metric | Current | Target |
|---|---|---|---|
| Engine | accuracy on decisive verdicts | 90% (57/63) | ≥ 92%, fails shrink to true judgment calls |
| Engine | abstain rate | 25/88 | ↓ via sub-clustering (concept/institution class) |
| Reach | userscript/gadget adoption | — | live in common.js; gadget after public |
| Reach | backlog articles analyzed/triaged | ad hoc | batch scanner + warm-cache backlog |
| Evidence | recommendation adoption rate | unknown | measured (Tier 2 #8) |
