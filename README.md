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
fetch every peer's template list in small batched `prop=templates` calls (a
per-request budget gotcha makes large batches silently lossy) and count
infobox-family templates. If a strong majority of same-class peers carry the
same specific infobox — e.g. 30/31 imperial elections use
{{Infobox election}} — we recommend it with the evidence attached; if peers
are overwhelmingly bare, we return "no infobox customary"; otherwise we
abstain with a weak-signal rather than guess. Every verdict ships its
evidence — peer counts, coverage, template distribution, event-vs-concept
sub-cluster splits — so an editor can weigh the argument themselves,
consistent with MOS:INFOBOXUSE, which explicitly treats "similar articles do
or don't have infoboxes" as a legitimate consensus argument. On a 64-case
labeled corpus drawn from the infobox-request backlog (editor-consensus
labels), the pipeline scores 84% accuracy on decisive verdicts, with
abstention treated as the designed honest answer in the ambiguous middle
band.

## Usage

```sh
node cli.js "1346 imperial election"
node cli.js "Prince-elector" "May 1400 imperial election" --json
```

First run does live API calls (~10 requests/article, ≥1s apart); everything is
disk-cached in `cache/` (SHA1-URL-keyed JSON) so re-runs are instant.

## Architecture (dual-runtime JS)

```
lib/api.js     Action API + WDQS client: UA etiquette, pacing, retry/backoff,
               cache-first disk cache. Uses global fetch (Node ≥18 / browser).
lib/peers.js   Stage A: P31 siblings (SPARQL), deepest categories, banners
lib/census.js  Stage B: batched prop=templates census, infobox-family filter,
               peer pruning, sub-cluster split (same-class vs category-only)
lib/decide.js  Stage C: thresholds, exclusions, confidence
cli.js         Node CLI harness (exploration / batch runs)
```

The libs are pure logic + a thin `fetch` layer — the same code will back the
future userscript (pacing/caching disabled there; same-origin API calls on
enwiki, `origin=*` CORS for Wikidata).

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
`test/results/` (`<date>.json|.md` + `latest.*`). Current: **32 pass / 6 fail
/ 26 abstain — 84% accuracy on decisive verdicts** (weak-signal counts as
honest abstention).

**Full writeup: `test/EVALUATION.md`** — dataset construction, scoring rules,
per-case table, analysis of every failure, the bugs the eval surfaced (with
the before/after progression 11% → 83% → 71% → 73% → 75% → 84%), and
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

## Live findings (2026-08-27)

### Evaluation-driven fixes

- The eval caught a second census bug: tllimit's per-request 500-template
  budget silently starves trailing pages when it lands exactly on a page
  boundary (alphabetical processing, NO continue token). Fixed with small
  batches (5) + tltitle continuation + self-healing re-query of any page that
  comes back empty (single-title queries cannot be starved).
- Bare {{Infobox}} (the generic meta-template) is now excluded from
  recommendation candidates (kept in coverage) — it was winning as the
  "dominant" template on noisy peer sets.
- `none-warranted` now requires very low coverage (<15%) or a small coherent
  peer set, or a strong bare sub-genre cluster within the doc's 25% band —
  the doc's "peers share the no-infobox trait" condition made structural.
  This stopped false "no infobox customary" claims on mixed genres (e.g.
  Jeremiah Clarke: 25% coverage, scattered bare peers → now honest abstain).

### Case results

- `1346 imperial election` → **recommend Infobox election (high)**: 97%
  same-class coverage (30/31, unanimous among boxed); matches the research
  doc's demo.
- `May 1400 imperial election` → **recommend Infobox election (high)**: the
  doc's "orphaned sibling" — correctly caught.
- `Prince-elector` → **weak-signal**: P31 classes genuinely too big
  ("historical position" 1,302, "noble title") so only the category signal
  fires; member-count category selection tightened the peer set (102→51
  peers, coverage 38%→43%); the concept sub-genre stays below the
  none-warranted bar, so the verdict stays honest.
- `Amathlai` (biblical person, P31=human) → weak-signal 26% coverage:
  category signal only; many peers bare, some Infobox saint / religious
  biography.
- `1696 Jacobite assassination plot` → weak-signal 43%: same-class census
  surfaces "Infobox civilian attack" as the in-class dominant — right
  template in evidence, coverage under the 50% bar.
- `Allied High Commission` → weak-signal 30%: class (377 instances) mostly
  bare; genre in transition.
- Disambiguation and list pages → instant exclusions before any discovery.
- Bugs found & fixed during POC: `tllimit` is a per-request TOTAL (not
  per-page) for prop=templates — truncated lists silently lost infoboxes;
  continuation (`tltitle`) + batch size 20 required. Redirect peers must not
  be resolved (`redirects=1` pollutes the census with wrong-genre targets) —
  detect via the `redirect` key from prop=info. SPARQL returns class values
  as full URLs (strip to bare QID). 4xx (except 429) are permanent — no
  retry. Fetch needs a timeout (WDQS can hang). Exclusions must run before
  discovery. Instance counting via COUNT() is slow on huge classes — use an
  early-terminating LIMIT sample and count client-side.

## Next steps (userscript path)

- The libs are pure logic + `fetch` — same files run in a browser userscript
  with `{ cacheDir: null, paceMs: 0 }`; enwiki calls are same-origin, Wikidata
  needs `origin=*` (anonymous read-only, supported).
- Personal script (User:Fuzheado/common.js) or gadget; UI = a "recommend
  infobox" affordance on article/talk pages using the same `decide()` output.
