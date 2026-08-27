# Infobox Recommender — Evaluation

**Date:** 2026-08-27 (six campaigns) · **Scope:** POC pipeline (Stages A–C) · **Corpus:** 87 cases (64 backlog + 23 canonical)
**Result: 56 pass / 6 fail / 25 abstain — 90% accuracy on decisive verdicts** (after canonical ground-truth corpus + Wikidata pointer peers)

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

### 1.5 Canonical ground-truth corpus (23 cases, campaign 6)

Beyond the backlog-derived labels, a **canonical validate corpus** was added:
articles whose correct answer is essentially uncontroversial because they
belong to a set with a universal infobox practice. The risk of synthetic
labels is acknowledged — these are not "should have an infobox" claims about
edge cases, but *set-membership confirmations*: if 45+ of the 46 US
presidents use {{Infobox officeholder}}, the peer census on any president
should confirm it. All 23 cases are run in validate mode (the article HAS an
infobox; the census must confirm the choice):

- **Sets with universal boxes**: presidents (Lincoln, Washington →
  officeholder), US states (Wyoming, California → U.S. state), foods (Hot
  dog, Hamburger → food), countries (France, United States → country),
  cities (New York City, Oxford → settlement), the Beatles → musical
  artist, Mount Everest → mountain, Nile → river, Venus → planet, Oxygen →
  element, Coca-Cola → drink, The Naked Now → television episode,
  Tyrannosaurus → Automatic taxobox, Star Wars (film) → film, Minecraft →
  video game, Mona Lisa → artwork, New York Yankees → MLB, FIFA World Cup →
  football tournament.
- **Expectation format**: `consistent[:Template]` — the eval asserts the
  validate comparison says the existing infobox matches peer practice
  (optionally the exact template).

These cases are *also* the sharpest regression net: they exercise the
primary-infobox selection, the infobox-family filter (Speciesbox,
Automatic taxobox), redirect normalization (prepared food → food, beverage →
drink), supporting-box rules (UNESCO child box on Everest, region-symbols on
states, per-element isotope tables on elements), and the Wikidata pointer
discovery (§5.9). Result: **21/23 pass; 2 honest abstains** — Oxygen (per-
element wrapper boxes fragment the element class) and New York Yankees
(mixed MLB/seasons pool) — both show the correct template as the visible
dominant.

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

**56 pass / 6 fail / 25 abstain · 90% (56/62) on decisive verdicts · 29% abstention rate** (87-case corpus)

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
| pass → **abstain** (4, campaign 4) | Brooke Hodge, Robert N. Charrette, Shari McMahan, Tony Greenstein — honest corrections: their peers stack {{Infobox person}} with longer boxes, which the old all-boxes counting double-counted past the 50% bar (§5.7) |
| abstain → **pass** (3, campaign 5) | Robert N. Charrette, Sushirrito, Tony Greenstein — tiered-neighborhood rescues (§5.8) |
| abstain → **pass** (1, campaign 6) | Roberta Gropper — rescued by P39 pointer peers (§5.9) |

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
| 7 — maintenance-category filter (5.6) | 64 | 35 | 6 | 23 | 85% |
| 8 — tiered neighborhoods (Dallas Cowboys fix) | 64 | 35 | 6 | 23 | 85% |
| 9 — wd same-type pointers (5.7) | 64 | 36 | 6 | 22 | 86% |
| 10 — canonical ground-truth corpus (1.5) | 87 | **56** | **6** | **25** | **90%** |

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

### 5.7 Primary-infobox selection (campaign 4)

Gaelic games articles exposed the stack problem: a single peer can transclude
six infobox-family templates (generic {{Infobox}}, legacy {{Infobox3cols}},
{{Infobox Gaelic games biography}}, {{Infobox Gaelic games player}},
{{Infobox medal templates}}, {{Infobox sportsperson}}) and the medal-record
wrapper was winning as the "dominant". Fix: each peer contributes exactly
one PRIMARY box — supporting templates (generic/legacy wrappers, medal
wrappers, embedded child boxes, `(meta)`/` isotopes` meta-tables) are never
candidates, and the most specific candidate (longest name, with a
curated generic-place penalty for {{Infobox settlement}}/{{Infobox
subdivision}}) wins. Paul Grimley now correctly recommends {{Infobox Gaelic
games biography}} (41/44) instead of the medal wrapper.

Eval cost: 85% → **84%** — four people cases (Brooke Hodge, Charrette,
McMahan, Greenstein) moved to honest abstains. Their peers stack {{Infobox
person}} with longer boxes (scientist, officeholder, academic); the old
code counted person in every stack, inflating it past the 50% dominance
bar. The abstains are corrections, not regressions — the labels are
single-choice and the stacks genuinely lack a dominant primary.

### 5.8 Tiered neighborhoods (campaign 5)

**Dallas Cowboys (validate)**: "Inconclusive" despite 31/31 NFL-team peers
being unanimous — the pool was diluted by intersection categories
("1960 establishments in Texas" mixes radio stations, schools and football
teams) and by a wide flat census that could not see the tight circle. The
user's "start small and adapt" instinct is standard locality practice in
proximity search: the tightest coherent neighborhood is the informative
one. Implemented:
- **Intersection categories excluded** from discovery (lifecycle/year
  groupings: `established in YYYY`, `YYYY establishments in X` — but event
  "X in YYYY" categories stay, they ARE genre for events).
- **Tier strata**: every peer is tagged with the tightest group containing
  it (P31 classes and categories ranked by size); the report shows
  cumulative per-tier stats (Neighborhood tiers panel); the CLI prints a
  tiers line.
- **Tiered rescue**: when the flat logic abstains, a decisive tight circle
  (≥80% coverage, ≥70% dominance, consistent with the wider pool top-2)
  can produce the verdict. Flat logic keeps authority — tiers never
  override a flat verdict. That guard matters: tiers-with-authority
  produced false positives (a declaration inside an imperial-election
  category confidently recommended as an election event — membership ≠
  genre) and label-divergent overrides (badminton player vs person).
- Result: 84% → **85%**; Dallas Cowboys validate flips to **consistent**
  ({{Infobox gridiron football team}} — note {{Infobox NFL team}} is a
  redirect to it, and Dallas transcludes both, a migration leftover).
  Currently zero fixtures exercise the tiered rescue (the Dallas-class
  cases are handled by the flat path post-exclusion); the mechanism is
  kept as the safety net for abstentions with strong tight circles.

### 5.9 Wikidata same-type pointer peers + canonical corpus (campaign 6)

**The insight** (proposed by the user, validated empirically): Wikidata
properties like *part of* (P361), *part of the series* (P179), and
*preceded/succeeded by* (P155/P156) are **same-type pointers** — only things
of the same kind can share a set, a series, or a succession chain. When P31
is unusable (people: Q5 human, dropped at >500 instances) or absent (Hot
dog has no P31 at all), these pointers still find true peers. P39 (position
held) extends the idea: every US president shares P39 = President of the
United States.

**Discovery design** (`lib/peers.js`):
- Per-VALUE queries: each P39 position / P179 series / P361 set is queried
  separately, so each yields one clean same-kind group (the POTUS set, not
  a mix of Lincoln's five positions). Cached per value — every president
  reuses the POTUS query.
- P155/P156: direct chain-neighbor query (the 1–4 items that precede/
  succeed the article — same-type by construction).
- Value labels (wbgetentities, one batched call) shown in the tier strata:
  "P39: President of the United States".
- Capped at 60 members per group and appended AFTER category peers in the
  pool, so pointer peers never displace category peers under the 150 cap
  (an early version flooded the pool and broke Jesús González Ortega).

**Verified effects**: Lincoln → officeholder 140/145 boxed peers (high),
consistent; The Naked Now → its series' episodes (television episode),
consistent; Wyoming's P361 set joins the U.S.-state class. Roberta Gropper
(abstain→pass) was rescued by P39.

**Refinements the canonical corpus flushed out** (each caught by a ground-
truth case):
1. **Infobox family**: Speciesbox and Automatic taxobox were missing
   (Tyrannosaurus showed "no infobox").
2. **Redirect normalization**: {{Infobox prepared food}} → food, {{Infobox
   beverage}} → drink, {{Infobox NFL team}} → gridiron football team.
   `prop=templates` returns the LITERAL transcluded names, so one batched
   `redirects=1` call canonicalizes them (comparisons, primaries,
   distribution).
3. **Transclusion facts** (same batched call): template A transcluding
   template B reveals the specialization ({{Infobox U.S. state}} is built
   on {{Infobox settlement}}). Currently the fetch is cached for the
   future specificity ladder; the primary selection uses a curated
   generic-place penalty instead — transclusion-based ranking proved
   label-divergent for person-family stacks (writer/artist boxes, built on
   person, would beat {{Infobox person}}).
4. **Supporting boxes**: embedded child boxes ({{Infobox region symbols}}
   on US states, {{Infobox UNESCO World Heritage Site}} on Everest,
   {{Infobox designation list}} on historic sites), meta-templates (names
   ending `(meta)` or ` isotopes` — the per-element isotope tables), and
   medal wrappers never win primary selection.
5. **byClass override hardened**: now requires dominanceShare ≥ 0.5 — a
   count-1 plurality (Oxygen's fragmented element class) can no longer
   fire a recommendation.
6. **Peer-sample display** (Blue Lagoon (geothermal spa) user report): the
   boxed-peers list showed each peer's raw first template (usually the
   generic {{Infobox}}) while the bar chart showed primaries — a
   contradiction the user caught. Now shows the primary. The same report
   exposed {{Infobox designation list}} as another embedded child box
   (inside {{Infobox historic site}}) that was winning primaries by length;
   added to the supporting set, so the bar chart correctly shows
   Infobox historic site (7).

**Result**: old 64-case corpus exactly preserved (35/6/23); canonical set
21/23 (2 honest abstains: Oxygen — per-element wrapper boxes fragment the
class; Yankees — mixed MLB/seasons pool); overall **56/6/25 — 90%**.

---

## 6. Limitations & future work

1. **Specificity ladder** (doc Stage C): pick the most specific template via
   the template-category taxonomy (publisher ⊂ company, officeholder ⊂
   person). Would convert several near-miss fails and abstains into correct
   high-confidence recommends. The transclusion facts already fetched per
   run are the seed for this.
2. **Per-element wrapper merge** (Oxygen): element articles use per-element
   boxes ({{Infobox americium}} wraps {{Infobox element}}), fragmenting the
   class distribution (element 33 + ~44 wrappers). A transclusion-based
   merge would unify them; today Oxygen honestly abstains with Infobox
   element as the visible dominant.
3. **Noisy category peers**: the 150-peer cap and member-count category
   selection still admit wrong-genre peers (enzymes in Venice campos sets;
   the mixed spa genre around Blue Lagoon). Sub-clustering by second-order
   category overlap is the doc's stated next step.
4. **Label set skew**: stale-tag labels skew person/officeholder/company;
   genres like concepts/institutions (the "none" class) are underrepresented
   (3 manual cases only, all abstaining — the machine can't yet separate the
   concept sub-genre without deeper signals).
5. **Stage D** (Wikidata fill-rate draft preview) not implemented.
6. **Child-box auto-detection**: supporting boxes are curated
   (SUPPORTING_INFOBOXES + `(meta)`/` isotopes` suffix rules); templates
   whose content starts with `{{Infobox | child = …` could be detected
   automatically when fetching template content.
7. Fresh live check — `node cli.js "Secular equilibrium"` (physics concept):
   **none-warranted (medium)** — 9% of 85 peers boxed, usable P31 class (31
   same-class peers) — an honest "no infobox customary" for the genre.

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
