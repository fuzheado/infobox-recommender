# ROADMAP — infobox-recommender

**Last updated:** 2026-08-28 · Complements `HANDOFF.md` (status), `status-quo.md`
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

### 2. Semantic sub-clustering via LiftWing topics (Track A · effort: medium · converts abstains)

Cluster the peer set by topic to (a) drop wrong-genre peers (enzymes in
Venice campos sets, the mixed spa genre around Blue Lagoon) and (b) split
event-vs-concept for the institution/"none" cases — the doc's stated next
step (`EVALUATION.md` §6.3, `signals.md` H3).

- **Approach:** the `articletopics` LiftWing model is proven infra — the
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

### 8. Outcome tracking — measure adoption (Track A · evidence)

Store each analysis (title, verdict, date) server-side (JSONL on
Toolforge) and re-check later: did articles with a "recommend" verdict
later gain that template? An **actual adoption-rate number** is the missing
evidence for the status-quo "genuine need" question — stronger than any
argument in `status-quo.md`.

### 9. Backlog-age analysis + stale-tag cleanup (Track B · research + maintenance)

Quantify the `|date=` distribution on {{Infobox requested}} tags (the
demand check recommended in `status-quo.md` §8.1) and offer a supervised
workflow: validate → remove the tag. 57/601 backlog articles carry the tag
*and* an infobox — a small, safe, visible contribution to
WikiProject Infoboxes.

---

## Tier 3 — visibility & polish

10. **Repo public + Diff post + WikiProject outreach** — the README's next
    step; a Diff writeup fits the project's research lineage; the
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

- **Other wikis / i18n** — dewiki *avoids* biography infoboxes; the census
  culture is per-wiki. P31 machinery generalizes, the norms don't.
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
