# Infobox Recommender — Evaluation

**Date:** 2026-08-27 (two campaigns) · **Scope:** POC pipeline (Stages A–C) · **Corpus:** 64 labeled cases
**Result: 35 pass / 6 fail / 23 abstain — 85% accuracy on decisive verdicts** (after signal upgrades + maintenance-category filter)

This document is the full writeup of the evaluation campaigns: how the test
set was built, how scoring works, per-case results, an analysis of every
failure, and the bugs the evaluation surfaced. Reproduce it with:

```sh
npm run fixtures   # rebuild test/fixtures.json from the live queue
npm run eval       # run all cases; persists test/results/<date>.json|.md
```

**Campaign 1 (baseline): 24/8/32 — 75%.** **Campaign 2 (signal upgrades,
see §5.5): 32/6/26 — 84%.** **Campaign 3 (maintenance-category
filter, §5.6): 35/6/23 — 85%.** The full per-case table is regenerated on every
run in `test/results/2026-08-27.md` (canonical); §3.2 below lists only the
cases whose outcome changed between campaigns.

---

## 1. Test set construction

### 1.1 Source: the infobox-request backlog

`Category:Wikipedia articles with an infobox request` holds talk pages of
articles that lack an infobox ({{Infobox requested}} tag). On 2026-08-27 the
category had **601 article members** (talk pages with the `Talk:` prefix
stripped).

### 1.2 Stale-tag labels (57 cases) — the key trick

The queue is noisy: articles get tagged, editors later add an infobox, and the
tag is not always removed. For each of the 601 members we fetched the current
template list (batched, 10 titles per call — see §5.1 for why) and found
**57/601 (9%) now have an infobox**. The template an editor chose for a
tagged-request article is the community's consensus answer for that article —
a **gold label** with zero manual effort.

Label distribution (what editors chose for these 57):

| Template | Count |
|---|---|
| Infobox person | 17 |
| Infobox urban feature | 6 |
| Infobox officeholder | 6 |
| Infobox company | 5 |
| Infobox galaxy | 4 |
| Infobox street | 3 |
| Infobox settlement | 2 |
| Infobox television | 2 |
| Infobox restaurant | 2 |
| Infobox (bare) | 2 |
| Infobox laboratory / song / U.S. legislation / book / publisher / family / fossil / military person / … | 1 each |

### 1.3 Manual doc-backed cases (7 cases)

From the live demos in `infobox-recommendation.md`, where the expected answer
was established by an explicit peer census:

| Title | Expected | Basis |
|---|---|---|
| 1346 imperial election | Infobox election | 26/26 peers boxed (doc demo) |
| May 1400 imperial election | Infobox election | doc demo, orphaned sibling |
| Golden Bull of 1356 | Infobox document | doc demo, specialized neighbor |
| Frankfurt Cathedral | Infobox church | doc demo, specialized neighbor |
| Prince-elector | none | doc demo, institution genre 0/7 |
| Declaration of Rhense | none | doc demo, institution genre 0/7 |
| Coronation of the Holy Roman Emperor | none | doc demo, institution genre 0/7 |

### 1.4 Label caveats

- Labels are **editor choice at a point in time**, not necessarily current
  genre consensus. Two cases (Sayfo, Fountain of Wealth) carry the weak label
  "Infobox" (bare meta-template — not a meaningful recommendation target).
- Person-adjacent labels (person vs officeholder vs musical artist) are
  specificity judgment calls; disagreement with the recommender there is
  partially the unimplemented specificity ladder (§6.3).
- Fixtures live in `test/fixtures.json` (rebuilt by `npm run fixtures`),
  manual seeds in `scripts/manual-cases.json`.

---

## 2. Scoring rules

Each case is run through the full pipeline (`lib/analyze.js`: peer discovery →
census → decision) with `skipExisting: false` so stale-tag cases still get a
full recommendation, then compared:

| Verdict | vs expected | Outcome |
|---|---|---|
| recommend: X | X = expected | **pass** |
| recommend: X | X ≠ expected, expected ≠ none | **fail** (wrong template) |
| recommend: X | expected = none | **fail** (false positive) |
| none-warranted | expected = none | **pass** |
| none-warranted | expected = template | **fail** (false negative) |
| weak-signal | anything | **abstain** — the middle band defers by design; never scored as an error |
| excluded / error | — | skip |

Accuracy is reported over **decisive verdicts only** (pass + fail), so
abstentions do not dilute precision.

---

## 3. Results

**35 pass / 6 fail / 23 abstain · 85% (35/41) on decisive verdicts · 36% abstention rate**

The abstention rate is the design working: roughly half of the backlog
articles sit in the ambiguous middle band where peer signals are mixed, and
the recommender says so instead of guessing.

### 3.1 Per-case table

The canonical per-case table (all 64 rows) is regenerated into
test/results/2026-08-27.md by every `npm run eval` — see also
`test/results/latest.md`. It shows outcome, expected label, verdict, and
confidence for every case.

### 3.2 Outcome changes between campaigns (baseline → signal upgrades)

| Change | Cases |
|---|---|
| abstain → **pass** (8, campaign 2) | Brad Gilmore, Izabella Pawelczynska, John Darrenkamp, Maani Petgar, Svend Foyn (Infobox person — tighter peer sets crossed the coverage bar), Frankfurt Cathedral (Infobox church) |
| fail → **abstain** (campaign 2) | Golden Bull of 1356 (P31-polluted override no longer fires) |
| abstain → **pass** (3, campaign 3) | Piazza dell'Esquilino, Piazzale Roma, Serena Morena (maintenance-category filter cleaned the peer sets) |
| abstain → abstain (cleaner evidence, campaign 2) | Prince-elector, Declaration of Rhense, Coronation (concept genres got tighter on-genre peer sets) |

(6 of the 8 baseline fails remain: the two person/officeholder judgment
calls, the two none-warranted-vs-outlier cases, the weak-label Sayfo case,
and the Strengholt specificity gap. Golden Bull of 1356 and Felix Greissle
now abstain — Golden Bull's evidence correctly surfaces Infobox document.)

---

## 4. Failure analysis (current 6 fails)

### 4.1 Judgment calls (person vs officeholder vs musical artist)

**José Ignacio Ustarán / Mercy Faith Lakisa** — politicians where the
recommender picked `officeholder`/`person` and the editor chose the other.
Both templates are defensible for politicians; the doc's "pick the most
specific template via the template-category ladder" is not yet implemented.
**Felix Greissle** (conductor) — expected `Infobox musical artist`, got
`Infobox person`; the peer census genuinely favors `Infobox person` (30 vs 5
among peers). Not obviously wrong.

### 4.2 Specificity ladder gap (unimplemented Stage C feature)

**Strengholt Holding** — expected `Infobox company`, got `Infobox publisher`
(a company subclass — arguably *more* specific and acceptable).

### 4.3 Weak labels / recommender arguably right

**Piscichnus** (trace fossil) — expected `Infobox fossil`, got `none-warranted
(high)`: 1% of 144 peers boxed (99 same-class trace fossils), bare cluster
"Trace fossil stubs". Peer consensus is unambiguous: trace fossils almost
never have infoboxes. The editor's choice is an outlier, not genre consensus —
the recommender's claim is the better call.
**Noronha** (surname/set-index page) — expected `Infobox family`, got
`none-warranted`: 9% of 43 peers boxed after shortdesc filtering removed the
set-index noise. Again the peer-based claim is defensible; the label is an
editor outlier.
**Sayfo** — expected bare `Infobox` (a meaningless label), got
`recommend: Infobox civilian attack (high)` on solid peer evidence (90%
coverage). The fixture is at fault, not the recommender.

(Golden Bull of 1356 was the campaign-1 genuine gap — P31 pollution — and
now abstains honestly after the category selection upgrade; see §3.2.)

---

## 5. Bugs the evaluation surfaced (and their fixes)

### 5.1 `tllimit` is a per-REQUEST total for `prop=templates` (silent data loss)

The API's `tllimit=500` for prop=templates is a total for the whole request,
not per page. Worse: with multi-title queries the API processes titles
alphabetically and, when the budget lands exactly on a page boundary, silently
drops the remaining pages **without a continue token** (verified: first 15
pages consumed exactly 500 templates; the last 4 — including Brooke Hodge and
Brad Gilmore — returned empty lists). Bare `{{Infobox}}` sorts early
alphabetically, so it was also systematically over-represented while specific
boxes were starved.

*Fix (lib/census.js, campaign 1):* batch size 5 + `tltitle` continuation
for mid-page truncation + **self-healing**: any page that comes back empty
is re-queried individually (a single-title query cannot be starved). Zero
results are now trustworthy. *Evolved since:* 50-title batches
+ continuation rounds (`tltitle` **or** `tlcontinue` — engineering-notes
§1.7) + suspect-only re-queue passes + a final individual pass.

### 5.2 Bare `{{Infobox}}` was winning as the "recommended" template

The generic meta-template dominated noisy distributions (e.g. 77 bare
`Infobox` vs 39 `Infobox settlement` among Wisconsin-town peers) and was being
recommended verbatim. *Fix:* bare `{{Infobox}}` counts toward coverage but is
excluded from the candidate distribution — the recommendation is always a
specific template.

### 5.3 `none-warranted` fired without the doc's second condition

The doc's rule is "coverage < ~25% **and peers share the no-infobox trait**".
The first version dropped the second half, producing false "no infobox
customary" claims on mixed peer sets (Jeremiah Clarke: 25% coverage, scattered
bare peers, 45 boxed with `Infobox person`). *Fix:* `none-warranted` now
requires either very low coverage (≤15%), or a small coherent peer set (<15
peers, ≤20%), or a strong bare sub-genre cluster (≥5 bare peers sharing a
category, ≥40% of all bare peers) within the 25% band.

### 5.4 Evaluation history (progression through the fixes)

| Run | Cases | pass | fail | abstain | decisive acc. |
|---|---|---|---|---|---|
| 1 — before fixes | 19 | 1 | 8 | 10 | 11% |
| 2 — after 5.1 + 5.2 | 19 | 5 | 1 | 13 | 83% |
| 3 — full corpus, before 5.3 | 64 | 24 | 10 | 30 | 71% |
| 4 — after 5.3 (structural none-warranted) | 64 | 24 | 9 | 31 | 73% |
| 5 — cluster ceiling tightened to 25% band | 64 | 24 | 8 | 32 | 75% |
| 6 — signal upgrades (5.5 below) | 64 | 32 | 6 | 26 | 84% |
| 7 — maintenance-category filter (5.6) | 64 | **35** | **6** | **23** | **85%** |

### 5.5 Signal upgrades (campaign 2 — see `signals.md` for hypotheses)

Two cheap wins, both confirmed by the eval:

1. **categoryinfo category selection** (`lib/peers.js`): rank the article's
   categories by member count (3–1000 members; name-length tiebreak and
   fallback) instead of name length — the smallest non-trivial category is
   the sharpest genre pointer. Tighter, more on-genre peer sets across the
   board (Prince-elector 102→51 peers; coverage stats rose on nearly every
   case).
2. **Short-description structural filter** (`lib/census.js`): peers whose
   `wikibase-shortdesc` matches list/set-index/index patterns are skipped as
   non-articles — zero extra API calls (the shortdesc was already in the
   census response). Killed fake bare clusters (Noronha's "All set index
   articles" 25-member cluster disappeared; its peer set 123→43).

Result: 75% → **84%** decisive accuracy; +8 abstain→pass, Golden Bull of
1356 fail→abstain; the remaining 6 fails are unchanged in character
(judgment calls, defensible disagreements, one weak label, one specificity
gap). Full hypothesis writeup: `signals.md`.

### 5.6 Maintenance-category filter (campaign 3)

Hidden maintenance categories (All stub articles, Webarchive template wayback
links, …) were leaking into peer sets and — visibly — into the bare-cluster
evidence, because **`prop=categories` returns no `hidden` flag** in
formatversion=2 (the `c.hidden` checks were dead code). Non-hidden stub
categories (Physics stubs, Trace fossil stubs) needed regex coverage too.
Fixes: `clshow='!hidden'` on both categories queries + an expanded
`MAINTENANCE_CATEGORY_RE` (stub suffixes, Webarchive/All pages/All stub
prefixes, Use … English). Result: **84% → 85% (35/6/23)** — three
abstain→pass flips (Piazza dell'Esquilino, Piazzale Roma, Serena Morena),
zero regressions, and no maintenance categories left in any evidence. See
`engineering-notes.md` §1.8 for the API lesson.

---

## 6. Limitations & future work

1. **Specificity ladder** (doc Stage C): pick the most specific template via
   the template-category taxonomy (publisher ⊂ company, officeholder ⊂
   person). Would convert several near-miss fails and abstains into correct
   high-confidence recommends.
2. **P31 pollution** (Golden Bull case): byClass override needs a
   discrimination check against category-only coverage.
3. **Noisy category peers**: the 150-peer cap and name-length category
   heuristic admit wrong-genre peers (enzymes in Venice campos sets,
   firearm-cartridge articles in a physics-concept set). Sub-clustering by
   second-order category overlap is the doc's stated next step.
4. **Label set skew**: stale-tag labels skew person/officeholder/company;
   genres like concepts/institutions (the "none" class) are underrepresented
   (3 manual cases only, all abstaining — the machine can't yet separate the
   concept sub-genre without deeper signals).
5. **Stage D** (Wikidata fill-rate draft preview) not implemented.
6. Fresh live check — `node cli.js "Secular equilibrium"` (physics concept,
   not in fixtures): weak-signal (medium), 36% coverage, same-class 6% —
   honest abstention; the displayed dominant (`Infobox firearm cartridge`) is
   category noise, correctly not recommended.

## 7. Artifacts

| Path | Contents |
|---|---|
| `test/fixtures.json` | 64 labeled cases (57 stale-tag + 7 manual) |
| `scripts/fetch-queue.mjs` | rebuilds fixtures from the live queue |
| `scripts/manual-cases.json` | the 7 doc-backed seeds |
| `test/eval.mjs` | harness; persists results |
| `test/results/2026-08-27.json` | full per-case results with evidence |
| `test/results/2026-08-27.md` | the table above, regenerated |
| `test/results/latest.*` | pointer to the most recent run |
