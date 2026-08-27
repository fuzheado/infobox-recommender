# infobox-recommender — POC

Peer-census infobox recommender for English Wikipedia, per the research doc
`infobox-recommendation.md`. For an article with no infobox: (1) discover peer
articles (Wikidata P31 siblings, most specific shared categories, WikiProject
banners), (2) run an infobox census over them, (3) decide whether an infobox
is customary and which template dominates.

## Approach (executive summary)

This recommender answers "should this infoboxless article have an infobox, and
if so which template?" by running an **infobox census over the article's
peers** rather than by matching the article itself against template rules.
Peers are discovered from three signals: Wikidata **P31 (instance-of)
siblings** via SPARQL (classes with >500 instances are skipped as too
heterogeneous), the article's **most specific categories** (ranked by member
count via `categoryinfo`, since the smallest non-trivial category is the
sharpest genre pointer), and **WikiProject banners** as a cross-check. We then
fetch every peer's template list in 50-title batched `prop=templates` calls
(a per-request template budget makes naive large batches silently lossy —
the census uses continuation rounds plus re-queue passes to guarantee
completeness) and count infobox-family templates. If a strong majority of
same-class peers carry the
same specific infobox — e.g. 30/31 imperial elections use
{{Infobox election}} — we recommend it with the evidence attached; if peers
are overwhelmingly bare, we return "no infobox customary"; otherwise we
abstain with a weak-signal rather than guess. Every verdict ships its
evidence — peer counts, coverage, template distribution, event-vs-concept
sub-cluster splits — so an editor can weigh the argument themselves,
consistent with MOS:INFOBOXUSE, which explicitly treats "similar articles do
or don't have infoboxes" as a legitimate consensus argument. On a 64-case
labeled corpus drawn from the infobox-request backlog (editor-consensus
labels), the pipeline scores 85% accuracy on decisive verdicts, with
abstention treated as the designed honest answer in the ambiguous middle
band.

## Usage

```sh
node cli.js "1346 imperial election"
node cli.js "Prince-elector" "May 1400 imperial election" --json
```

First run does live API calls (tens of requests/article, ≥1s apart);
everything is disk-cached in `cache/` (SHA1-URL-keyed JSON) so re-runs are
instant.

## Architecture (dual-runtime JS)

```
lib/api.js     Action API + WDQS client: UA etiquette, pacing, retry/backoff,
               cache-first disk cache. Uses global fetch (Node ≥18 / browser).
lib/peers.js   Stage A: P31 siblings (per-class cached SPARQL samples),
               member-count category selection (clshow=!hidden), banners
lib/census.js  Stage B: 50-title batched prop=templates census (continuation
               + re-queue passes), infobox-family filter, peer pruning,
               sub-cluster split (same-class vs category-only)
lib/decide.js  Stage C: thresholds, exclusions, confidence, evidence
lib/analyze.js Full pipeline for one title (shared by CLI, server, userscript)
cli.js         Node CLI harness (exploration / batch runs)
server.mjs     Zero-dependency web service (report UI + SSE progress + JSON API)
public/        Report renderer (app.js), styles, page shell
```

The libs are pure logic + a thin `fetch` layer — the same code will back the
future userscript (pacing/caching disabled there; same-origin API calls on
enwiki, `origin=*` CORS for Wikidata).

## Web UI (experimental)

Zero-dependency analysis service — the same pipeline as the CLI, with a rich
report renderer, an API mode, and live progress:

```sh
npm run serve        # http://localhost:3000
```

- `/?title=Small-signal+model` → auto-runs the analysis and renders the report (shareable URL)
- `/analyze/stream?title=X` → SSE stream: live stage events (resolve → peers → census i/n → decision), then the result
- `/analyze?title=X&output=json` → API mode: full analysis JSON, CORS-enabled (missing title → 400)
- `/` → search + examples

Speed: cold analyses run in ~5–15s (down from 30–90s) thanks to bigger
census batches with continuation, per-class Wikidata sample caching (shared
across every article of the same class), parallel discovery stages, and lazy
sub-cluster analysis — all within the ≥1s request-pacing etiquette (request
starts stay 1s apart; latencies overlap). Repeat analyses are instant (disk
cache). The page shows a live stage checklist with an elapsed timer while
the analysis runs.

Server guards: 2 concurrent analyses max (queue), per-IP throttle (30/5 min),
title sanitization, path-traversal protection.

Deployment: Toolforge node22 webservice (tool creation is web-UI only at
toolsadmin; OSI `LICENSE` included). Caveat: Toolforge proxy timeouts may
bite cold analyses — if so, the fix is a job/polling pattern, not a longer
request (the SSE stream is a step toward that).

## Docs

| Doc | Contents |
|---|---|
| `infobox-recommendation.md` | Original research: guidance, backlog, tool landscape, algorithm spec (Stages A–D) |
| `signals.md` | Signal landscape & hypotheses — what finds "birds of a feather", candidate signals, H1–H6 verdicts |
| `test/EVALUATION.md` | Evaluation campaigns: dataset construction, scoring, per-case results, failure analysis |
| `engineering-notes.md` | API gotchas (tllimit, tltemplates, redirects, WDQS…) + methodology lessons — read before touching the API layer |

## Test data & evaluation

`npm run fixtures` builds the labeled test set (`test/fixtures.json`) from the
infobox-request backlog:

- **Stale-tag labels**: 57/601 queue articles (9%) now HAVE an infobox despite
  the {{Infobox requested}} tag — the template editors chose is the consensus
  answer (gold label). Mostly Infobox person/officeholder/company/galaxy.
- **Manual labels**: 7 doc-backed cases (1346 election → Infobox election,
  Golden Bull → Infobox document, Prince-elector → none, …).

`npm run eval` runs the pipeline over all fixtures (warm-cache = fast), scores
verdicts against expectations, and persists per-case results to
`test/results/` (`<date>.json|.md` + `latest.*`). Current: **35 pass / 6 fail
/ 23 abstain — 85% accuracy on decisive verdicts** (weak-signal counts as
honest abstention).

**Full writeup: `test/EVALUATION.md`** — dataset construction, scoring rules,
per-case table, analysis of every failure, the bugs the eval surfaced (with
the before/after progression 11% → 83% → 71% → 73% → 75% → 84% → 85%), and
limitations.

## Single-article invocation

```sh
node cli.js "Secular equilibrium"   # full pipeline, human summary + JSON
node cli.js "A" "B" "C" --json       # multiple titles, machine-readable only
```

## Known POC limitations (from research doc §5)

- Noisy categories need stronger sub-clustering — the P31-class split + bare
  peer shared-category clusters are the first cut; category-only peers can
  still be wrong genre (e.g. people-in-category vs institution article).
- Huge P31 classes (e.g. Q5 human, "noble title") are skipped via an
  early-terminating instance sample (>500 dropped) — those articles fall
  back to the category signal alone.
- Template specificity ladder (Infobox astronaut ⊂ Person ⊂ generic) not yet
  implemented — POC picks the mode template; bare {{Infobox}} never wins.
- Stage D (Wikidata fill-rate draft preview) not implemented.
- Sidebars are detected and reported but don't yet veto a recommendation.

## Findings & history (2026-08-27)

Three evaluation campaigns took the pipeline from 11% to 85% decisive
accuracy (24 → 35 pass, 32 → 23 abstain): census correctness fixes, decision
logic hardening, signal upgrades, and the maintenance-category filter. Key
verified cases: `1346 imperial election` → **recommend Infobox election
(high)** (97% same-class, matches the research doc's demo); `May 1400
imperial election` → **recommend** (the doc's orphaned sibling, correctly
caught); `Prince-elector` / `Amathlai` / `1696 Jacobite assassination plot` →
honest weak-signals (concept genre, P31=human, mixed peers).

The full history — every bug found and fixed, the campaign progression
(11% → 83% → 71% → 73% → 75% → 84% → 85%), and per-case results — lives in
`test/EVALUATION.md` (writeup), `test/results/latest.md` (current per-case
table), and `engineering-notes.md` (API gotchas).

## Next steps

- **Deploy to Toolforge** (tool creation is web-UI only; then
  `webservice --backend=kubernetes node22 start`) so shareable report URLs
  work on-wiki; canonical repo: github.com/fuzheado/infobox-recommender
  (private — flip visibility when ready to share).
- **Semantic sub-clustering** (lead/extract embeddings or ORES topics) — the
  main lever for the remaining abstains and the concept-genre cases
  (signals.md H3).
- **Template specificity ladder** — pick the most specific template via the
  template taxonomy (publisher ⊂ company; fixes near-miss fails).
- **Stage D** — Wikidata fill-rate draft infobox preview.
- **Userscript**: the libs are pure logic + `fetch` — same files run in a
  browser userscript with `{ cacheDir: null, paceMs: 0 }`; enwiki calls are
  same-origin, Wikidata needs `origin=*` (anonymous read-only, supported).
  Personal script (User:Fuzheado/common.js) or gadget; the web UI's report
  renderer transfers directly.
