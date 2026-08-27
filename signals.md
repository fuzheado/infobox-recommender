# Infobox Recommender — Signal Landscape & Hypotheses

**Date:** 2026-08-27 · **Status:** findings + hypotheses; cheap-win results appended after implementation

This doc answers the question: *how do we find "birds of a feather" — peer
articles whose infobox practice predicts the right template for an
infoboxless article — and which signals are worth adding?*

---

## 1. What the pipeline uses today

Peer discovery (`lib/peers.js`) proposes candidates from three ranked sources;
the infobox census (`lib/census.js`) is the arbiter — discovery only proposes,
the evidence (what infoboxes peers actually carry) decides.

| # | Signal | Mechanics | Eval receipts (64-case corpus, 2026-08-27) |
|---|---|---|---|
| 1 | **Wikidata P31 siblings** | SPARQL: same "instance of" class, cross-language; classes >500 instances dropped (too heterogeneous, e.g. Q5 human); per-class sample queries are cached per class, so the cost amortizes across every article of that class | Fired in only **12/64** cases — the backlog skews to people/objects whose classes are huge. When it fires it is the strongest signal: imperial elections at **97% unanimous class → high confidence** |
| 2 | **Categories** | Article's non-maintenance categories ranked by **member count** (`categoryinfo`, fewest = most specific; `clshow=!hidden` + an ignorable set), top 5, members (ns=0, ≤50 each) become peers | The **workhorse: 33 of 35 passes rode category-only peer sets** (people, companies, galaxies, TV series). Also the main noise source: enzymes in Venice-campo sets, firearm-cartridge articles in a physics-concept set |
| 3 | **WikiProject banners** | Detected on the talk page and displayed in evidence (the doc's "standardized infobox pointer") | **Not yet used to find peers** — detected but unused as a peer source |

**Deliberately not used:** short description, lead paragraph, wikitext,
pageviews, ORES topics, template taxonomy.

The census (`prop=templates` over proposed peers, batched + self-healing) then
produces coverage, per-template distribution, same-class vs category-only
split, and bare-peer sub-clusters. The decision layer (`lib/decide.js`) turns
that into recommend / none-warranted / weak-signal.

## 2. What the eval says about signal contribution

From `test/results/latest.json` (campaign 3, 2026-08-27):

- **35/35 passes** break down as **33 category-driven, 2 class-driven**
  (the two imperial elections). Categories are doing ~94% of the work.
- **12/64** cases had a usable same-class group (n≥3). For the rest, P31 was
  either absent or the class exceeded the 500-instance cap (people).
- The 6 fails split: 2 judgment calls (person vs officeholder for
  politicians), 2 where the recommender is arguably right and the editor
  label is the outlier (Noronha 9%, Piscichnus 1%), 1 weak label (Sayfo), 1
  specificity-ladder gap (publisher ⊂ company).
- The 23 abstains are the honest middle band — mixed peer signals.

**Consequences:**
1. Category peer quality dominates overall accuracy → improving category
   selection is the highest-leverage cheap change.
2. P31 is rare but decisive when it fires → worth protecting/strengthening,
   not replacing.
3. The dominant failure pattern inside abstains/fails is **wrong-genre peers
   admitted via categories** (topical noise) — no amount of category
   selection fixes this completely; it needs semantic signals.

## 3. Candidate signals, honestly rated

| Signal | Cost | Value | Best use |
|---|---|---|---|
| **Category member counts** (`categoryinfo`) | 1 batched call/article | **High, cheap** | Replace the name-length heuristic: fewest members = most specific category = better peers |
| **Short description** (`wikibase-shortdesc`) | ~free — already in the pageprops the census fetches | Medium | Filter *structural* non-articles out of the peer set (lists, set-index pages, dab-ish pages) that pageprops can't flag |
| **Lead paragraph / article summary + embeddings** | REST summary per peer + embedding inference | **High (the big one)** | Semantic neighbors attack the worst failure mode: topical wrong-genre peers (enzymes in campos, cartridges in physics). Also enables event-vs-concept sub-clustering |
| **Wikidata descriptions/labels** | free (SPARQL already returns items) | Low–Med | Same filtering role as shortdesc, cross-language |
| **ORES / LiftWing article topics** | 1 call/peer | Med–High | Topic labels → sub-cluster peers (the doc's 0/7 institution case is a topic-cluster problem) |
| **WikiProject banner → project categories** | 1 extra API call | Medium | Untapped peer source; projects standardize infoboxes by subject |
| **Wikidata same-type pointers** (P39 position held, P179 part of the series, P361 part of, P155/P156 preceded/succeeded by) | wbgetclaims + 1 SPARQL per value (cached per value) | **High — implemented (campaign 6)** | "Only same-kind things share a position, a series, a set, or a succession chain" — finds true peers when P31 is unusable (people) or absent (Hot dog). Lincoln → all presidents via P39; episodes → their series via P179 |
| **Template taxonomy** (Category:Infobox templates tree) | 1-time crawl, cached | High (different stage) | The specificity ladder (publisher ⊂ company) — fixes near-miss fails, not peer finding |
| **Pageviews / popularity** | cheap | ~Zero | Popularity ≠ genre; wrong axis |
| **`list=search` "similar articles"** | cheap | Low | Title/lead-text driven, weak genre signal |
| **Infobox parameters / Wikidata fill rate** | — | Stage D | Draft preview, not peer finding |

## 4. Hypotheses

- **H1 — Member-count category selection beats name length.** The smallest
  non-trivial category an article sits in is its sharpest genre pointer
  (Imperial election (HRE) @ 39 members beats "1346 in Europe" @ hundreds).
  *Test: swap the heuristic, re-run the 64-case eval.*
- **H2 — Short-description filtering removes structural noise cheaply.**
  Set-index articles and "list of" pages are bare *by convention*; they drag
  coverage down and create fake bare clusters (Noronha's "All set index
  articles"). pageprops can't flag them; `wikibase-shortdesc` can.
  *Test: exclude shortdescs matching list/set-index/index patterns, re-run.*
- **H3 — Topical wrong-genre noise is irreducible without semantic signals.**
  Enzymes in a Venice-campo peer set and cartridges in a physics set share
  categories with the target; no structural filter removes them. Embeddings
  or ORES topics are required (H3 is why the big win is deferred).
- **H4 — The 500-instance P31 cap is roughly right but worth re-testing.**
  Classes at 356/377 instances (1696 Jacobite plot, Allied High Commission)
  were admitted after the cap moved 300→500 and gave coherent, useful peers.
  A higher cap (1000?) trades noise for coverage — measure on the eval.
- **H5 — WikiProject banners are an untapped peer source.** Banners already
  point to the standardized infobox; project article lists (or the project's
  categories) would give consensus-backed peers. Medium effort.
- **H6 — Abstain-heavy behavior is correct.** Precision on decisive verdicts
  is the metric that matters; forcing the middle band would trade honest
  abstention for wrong recommends.
- **H7 — Same-type Wikidata pointers beat classes for people (confirmed,
  campaign 6).** P31=human is dropped at the 500-instance cap, but P39
  (position held) still finds all presidents, P179 finds series members, P361
  set members, P155/P156 chain neighbors. Per-VALUE queries keep the sets
  clean and cacheable (the POTUS query is shared by every president).

## 5. Cheap wins implemented this session

1. **Category selection via `categoryinfo` member counts (H1)** —
   `lib/peers.js`: rank the article's non-maintenance categories by member
   count (filtered to 3–1000 members; name-length tiebreak; name-length
   fallback if nothing qualifies), take the top 5.
2. **Structural short-description filtering (H2)** — `lib/census.js`:
   peers whose `wikibase-shortdesc` matches `^(list of|lists of|set
   index|wikimedia|index of|disambiguation|timeline of|outline of)` are
   skipped as non-article pages (the shortdesc is already in the census
   response — zero extra calls).

## 6. Results after the cheap wins

Re-ran the full 64-case eval with both cheap wins in place (2026-08-27):

**Before: 24 pass / 8 fail / 32 abstain — 75% decisive**
**After (campaign 5): 35 pass / 6 fail / 23 abstain — 85% decisive** — the best result yet.
Campaign 5 added **tiered neighborhoods** ("start small and adapt"): peers are
tagged with the tightest category/P31-class group containing them, the
report shows cumulative per-tier strata, and when the flat logic abstains a
decisive tight circle (>=80% coverage, >=70% dominance, consistent with the
wider pool) rescues a verdict — e.g. Dallas Cowboys -> Category:NFL teams
(32): 31/31 gridiron. Intersection categories ("1960 establishments in
Texas") are excluded from discovery. Three abstains rescued (Charrette,
Sushirrito, Greenstein), zero regressions.

**After (campaign 6): 56 pass / 6 fail / 25 abstain — 90% decisive (87-case
corpus).** Wikidata same-type pointer peers (P39/P179/P361/P155/P156, H7)
plus the 23-case canonical validate corpus (sets with universal boxes:
presidents, states, foods, …). The canonical cases flushed out five real
defects (Speciesbox family gap, redirect normalization, transclusion-based
primary rules, supporting-box rules, byClass share requirement) — see
`test/EVALUATION.md` §1.5/§5.7. Old 64-case corpus exactly preserved. — primary-infobox
selection (each boxed peer contributes its PRIMARY box only; supporting
boxes — generic {{Infobox}}, legacy Infobox3cols, {{Infobox medal templates}}
— never win). Gaelic games case fixed (Infobox Gaelic games biography 41/44
instead of the medal wrapper), and 4 people cases moved to honest abstains:
their peers stack {{Infobox person}} with longer boxes, which the old code
double-counted to cross the 50% bar.

(Campaign 3: a **maintenance-category filter** — hidden categories were
leaking through because `prop=categories` returns no `hidden` flag in
formatversion=2; fixed with `clshow=!hidden` + an extended ignorable set
including stub categories, which are *not* hidden on enwiki. Three
abstain→pass, zero regressions, no maintenance cats left in any evidence.
See `engineering-notes.md` §1.8.)

What moved:

| Change | Cases |
|---|---|
| abstain → **pass** | Brad Gilmore, Izabella Pawelczynska, John Darrenkamp, Maani Petgar, Svend Foyn (all Infobox person — tighter peer sets crossed the 50% coverage bar), Frankfurt Cathedral (Infobox church) |
| fail → **abstain** | Golden Bull of 1356 — the P31-polluted byClass override no longer fires; honest abstain instead of the wrong recommend |
| abstain → abstain (cleaner evidence) | Prince-elector, Declaration of Rhense, Coronation (concept genres now get tighter on-genre peer sets: Prince-elector 102→51 peers) |

Remaining 6 fails, unchanged in character:
- José Ignacio Ustarán / Mercy Faith Lakisa — person vs officeholder judgment calls (politicians)
- Noronha (9% of 43) / Piscichnus (1% of 144) — none-warranted on genuinely bare genres; editor labels are outliers
- Sayfo — weak label (bare "Infobox" isn't a recommendation target)
- Strengholt Holding — publisher ⊂ company, the missing specificity ladder

**Hypothesis verdicts:**
- **H1 confirmed** — member-count category selection improved peer quality across the board (coverage stats rose on nearly every case; the workhorse categories are now genuinely on-genre).
- **H2 confirmed** — shortdesc filtering removed set-index/list noise (Noronha's fake "All set index articles" bare cluster vanished; peer set 123→43) at zero extra API cost.
- **H3 stands** — topical wrong-genre noise (enzymes in campos, cartridges in physics) is the remaining abstain driver; semantic sub-clustering is the next step.
- **H6 confirmed** — precision on decisive verdicts improved while abstention stayed high (26/64) — the honest middle band pays off.

## 7. Roadmap (in priority order)

1. ~~categoryinfo category selection~~ (this session)
2. ~~shortdesc structural filtering~~ (this session)
3. **Semantic sub-clustering** — lead/extract embeddings (or ORES topics)
   over the peer set to split events vs concepts and drop topical noise →
   converts abstains into confident verdicts, including the doc's
   institution-article cases.
4. **Template specificity ladder** — Category:Infobox templates tree walk →
   "pick the most specific" (fixes publisher/company, person/officeholder).
5. **WikiProject-banner-driven peers** (H5).
6. **Stage D** — Wikidata fill-rate draft preview.
