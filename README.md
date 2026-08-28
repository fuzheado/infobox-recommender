# infobox-recommender — POC

Peer-census infobox recommender for English Wikipedia, per the research doc
`infobox-recommendation.md`. 

For an article with no infobox, run a simple peer-examination and form a recommendation: 

(1) discover peer articles (Wikidata P31 siblings, most specific shared categories, WikiProject banners), 

(2) run an infobox census over them, 

(3) decide whether an infobox is customary and which template dominates.

## Approach (executive summary)

This tool answers the question many Wikipedia editors have when creating new articles: 

"Should this infoboxless article have an infobox, and if so which template?" 

This tool aims to simulate what humans already do by running an **infobox census over the article's peers** rather than by matching the article itself against template rules.

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
evidence — peer counts, coverage, template distribution (each peer counts
its PRIMARY infobox only — supporting boxes like {{Infobox3cols}},
medal-record wrappers, and subsidiary section boxes like
{{Infobox university rankings}} never win), event-vs-concept sub-cluster
splits — so
an editor can weigh the argument themselves,
consistent with MOS:INFOBOXUSE, which explicitly treats "similar articles do
or don't have infoboxes" as a legitimate consensus argument. On an 88-case
labeled corpus — 57 backlog-derived stale-tag labels plus 31
manual/canonical validate
cases
(sets with universal boxes: presidents, states, foods, …) — the pipeline
scores 90% accuracy on decisive verdicts, with
abstention treated as the designed honest answer in the ambiguous middle
band.

## Why this tool exists — the documented need

Research into the status quo (`status-quo.md`) — how editors actually decide
whether and which infobox to add — found the "which infobox?" step is a
known, documented, still-unserved gap:

- **[Help:Infobox](https://en.wikipedia.org/wiki/Help:Infobox)** codifies
exactly two discovery methods: browse
[Wikipedia:List of infoboxes](https://en.wikipedia.org/wiki/Wikipedia:List_of_infoboxes)
/ [Category:Infobox templates](https://en.wikipedia.org/wiki/Category:Infobox_templates)
(~2,000 templates), or *find a similar article and copy its infobox*. The
peer census is that second method done systematically — no more manual,
biased "similar article" hunting.
- **The WMF investigated the same idea and stopped short**: the 2017
Community Wishlist [Infobox wizard
proposal](https://meta.wikimedia.org/wiki/2017_Community_Wishlist_Survey/Editing/Infobox_wizard)
(copy-paste "from other articles" is "the most common practice"; errors
propagate) was investigated as
[T184145](https://phabricator.wikimedia.org/T184145) and delivered only as
**TemplateWizard** — template *insertion* by name, no topic/category
selection (which users explicitly asked for and never got).
- **The newest WMF tooling still defers the step**: the [Microtask
Generator](https://microtask-generator.toolforge.org/) ([Diff
writeup](https://diff.wikimedia.org/2026/03/23/from-overwhelming-lists-to-bite-sized-edits-meet-the-microtask-generator/),
2026) flags "add an infobox" as a recommended task — and its own guidance
is *"Find similar articles to copy template structure."*
- **Friction is documented**: Wikimedia Diff (2026) — infoboxes "can be a
barrier for less-experienced editors… tricky to identify the right
infobox" ([source](https://diff.wikimedia.org/2026/02/23/wikidata-powered-infoboxes-for-wikipedia-databox/));
a [2013 ArbCom case](https://en.wikipedia.org/wiki/Wikipedia:Arbitration/Requests/Case/Infoboxes)
grew out of infobox disputes; the
[{{Infobox requested}}](https://en.wikipedia.org/wiki/Template:Infobox_requested)
backlog (~627 articles in [this
category](https://en.wikipedia.org/wiki/Category:Wikipedia_articles_with_an_infobox_request))
sits mostly uncleared — 9% of tags are already stale.
- **The obvious alternative — Wikidata-driven auto-infoboxes (Databox) — is
off the table on enwiki**, which rejected them in the [2018 Infobox
RfC](https://en.wikipedia.org/wiki/Wikipedia:Wikidata/2018_Infobox_RfC). A
recommendation tool fits enwiki's curated-template norm; automation
doesn't.

Full research — user stories, prior-art check, honest market assessment —
in **`status-quo.md`**.

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
- `/` → search + examples (the list links the live infobox-request
  [backlog category](https://en.wikipedia.org/wiki/Category:Wikipedia_articles_with_an_infobox_request)
  for more candidates)

While the analysis runs, an **article digest** appears immediately (clickable
title, short description, lead paragraph from the REST summary, thumbnail,
and infobox status) so there is something to read — and click out to the
article — during the wait. It also sits atop the final report. Every
template name in the report (verdict, distribution, sub-cluster dominants,
boxed peers) links to its Template: page for inspection. An **About** box
(header/footer link; auto-opens on first visit) explains the method and the
three verdicts for new users. The header title ("Infobox recommender")
resets to the start page and cancels any in-flight analysis.

**Validate mode**: for an article that already has an infobox, the report
shows a "Run peer census to check this choice" button (or use
`?title=X&validate=1` — shareable, and works on the JSON API too). It runs
the census anyway and compares the existing choice against peer practice:
*consistent* (matches the dominant template, e.g. 1612 imperial election),
*atypical* (peers differ — e.g. Joint European Torus uses the generic
{{Infobox}} while 38/57 peers use {{Infobox fusion device}}), or
*inconclusive* (mixed evidence). Also the CLI: `node cli.js X --validate`.

Speed: cold analyses run in ~5–15s (down from 30–90s) thanks to bigger
census batches with continuation, per-class Wikidata sample caching (shared
across every article of the same class), parallel discovery stages, and lazy
sub-cluster analysis — all within the ≥1s request-pacing etiquette (request
starts stay 1s apart; latencies overlap). Repeat analyses are instant (disk
cache). The page shows a live stage checklist with an elapsed timer while
the analysis runs.

Server guards: 2 concurrent analyses max (queue), per-IP throttle (30/5 min),
title sanitization, path-traversal protection.

**Deployed: <https://infobox-recommender.toolforge.org>** (Toolforge
Kubernetes, node20 runtime). Layout note: the k8s node type serves the app
from `~/www/js/` (package.json + server.mjs + lib/ + public/); redeploy =
package the repo (minus cache/), extract as the tool user, then
`webservice --backend=kubernetes node20 restart`. Verified live: cold
150-peer analyses (~21s) complete fine through the Toolforge proxy, warm
repeats are ~0.15s, SSE progress streams. Tool account is created via the
web UI only (toolsadmin); OSI `LICENSE` (MIT) included.

## Docs

| Doc | Contents |
|---|---|
| `HANDOFF.md` | **Start here** — status, quick start, deployment, open threads |
| `infobox-recommendation.md` | Original research: guidance, backlog, tool landscape, algorithm spec (Stages A–D) |
| `signals.md` | Signal landscape & hypotheses — what finds "birds of a feather", candidate signals, H1–H6 verdicts |
| `test/EVALUATION.md` | Evaluation campaigns: dataset construction, scoring, per-case results, failure analysis |
| `engineering-notes.md` | API gotchas (tllimit, tltemplates, redirects, WDQS…) + methodology lessons — read before touching the API layer |
| `status-quo.md` | The documented need — how editors add infoboxes today (workflows, friction, prior art, honest market assessment) |

## Test data & evaluation

`npm run fixtures` builds the labeled test set (`test/fixtures.json`) from the
infobox-request backlog:

- **Stale-tag labels**: 57/601 queue articles (9%) now HAVE an infobox despite
  the {{Infobox requested}} tag — the template editors chose is the consensus
  answer (gold label). Mostly Infobox person/officeholder/company/galaxy.
- **Manual labels**: 31 curated cases — 7 doc-backed demos (1346 election →
  Infobox election, Golden Bull → Infobox document, Prince-elector → none),
  23 canonical validate cases (presidents, states, foods, TV episodes, …),
  and the 2026-08-28 subsidiary-box regression case (Icelandic College of
  Art and Crafts → Infobox university).

`npm run eval` runs the pipeline over all fixtures (warm-cache = fast), scores
verdicts against expectations, and persists per-case results to
`test/results/` (`<date>.json|.md` + `latest.*`). Current: **57 pass / 6 fail / 25 abstain — 90% accuracy on decisive
verdicts** (88-case corpus: 57 backlog + 31 manual/canonical validate cases) (weak-signal counts as
honest abstention).

`npm test` runs the unit suite (`test/census.test.mjs`) — primary-infobox
selection: supporting boxes never win, subsidiary section boxes (university
rankings, medal records, career statistics) lose to the subject box,
generic-place penalty, and specificity ordering.

**Full writeup: `test/EVALUATION.md`** — dataset construction, scoring rules,
per-case table, analysis of every failure, the bugs the eval surfaced (with
the before/after progression 11% → 83% → 71% → 73% → 75% → 84% → 85% → 84% → 85% → 86% → 90%), and
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

## Findings & history (2026-08-28)

Six evaluation campaigns took the pipeline from 11% to 90% decisive
accuracy (1 → 57 pass, 32 → 25 abstain): census correctness fixes, decision
logic hardening, signal upgrades, the maintenance-category filter, tiered
neighborhoods, and the canonical corpus + Wikidata same-type pointers. Key
verified cases: `1346 imperial election` → **recommend Infobox election
(high)** (97% same-class, matches the research doc's demo); `May 1400
imperial election` → **recommend** (the doc's orphaned sibling, correctly
caught); `Prince-elector` / `Amathlai` / `1696 Jacobite assassination plot` →
honest weak-signals (concept genre, P31=human, mixed peers).

**2026-08-28**: the Icelandic College of Art and Crafts run surfaced a
subsidiary-box regression — {{Infobox university rankings}} was winning the
primary slot over {{Infobox university}} on length alone (same class as
medal-record and career-statistics boxes). Fixed with prefix +
subsidiary-suffix penalties in `primaryInfobox` (relative, so standalone
boxes are untouched), guarded by a new unit suite (`npm test`), and added to
the corpus (now 88 cases: 57 backlog + 31 manual/canonical; accuracy steady
at 90%). UI fixes: the About modal's popstate/hash clash (clicking About
re-ran the analysis and stripped the `#about` hash), the header title now
resets to the start page, and Try-an-example links the live infobox-request
backlog.

The full history — every bug found and fixed, the campaign progression
(11% → 83% → 71% → 73% → 75% → 84% → 85% → 84% → 85% → 86% → 90%), and per-case results — lives in
`test/EVALUATION.md` (writeup), `test/results/latest.md` (current per-case
table), and `engineering-notes.md` (API gotchas).

## Next steps

- **Flip repo visibility** — github.com/fuzheado/infobox-recommender is
  private; make it public when ready to share (the About modal links it).
  Deployment itself is done: Toolforge k8s, node20 runtime.
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
