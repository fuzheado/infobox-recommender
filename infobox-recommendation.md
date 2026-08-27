# Infobox Recommendation — Research Findings

**Date:** 2026-08-26 · **Mode:** exploratory research · **Commissioned by:** Andrew Lih
**Question:** For a Wikipedia article with no infobox, is there a useful and reliable way to
investigate (1) whether an infobox is appropriate and (2) which infobox template it would be —
via peer-article observation and other signals?

All findings below were verified live via the enwiki/MediaWiki APIs on 2026-08-26 unless noted.

---

## 1. What the guidance says (authoritative)

**Wikipedia:Manual of Style/Infoboxes** (MOS:INFOBOXUSE) — verified live:

> "The use of infoboxes is **neither required nor prohibited** for any article. Whether to
> include an infobox, which infobox to include, and which parts of the infobox to use, is
> determined through **discussion and consensus** among the editors at each individual article."

- As of 2026, **~77% of enwiki articles contain an infobox** (Quarry query 103977, cited in MOS).
- **~88% of Featured Articles** and **~35% of Featured Lists** contain an infobox (Quarry 105209).
- On infobox-removal debates, MOS says: *"Arguments based on relevant factors external to the
  article (e.g. **similar articles do or do not have infoboxes**) should be weighed moderately."*
  → **Peer observation is an explicitly recognized argument** in the consensus process.

Implication: there is no rule forcing an infobox anywhere; the live question is always
"what do the peers do" — which is exactly the peer-census approach.

## 2. Existing discovery mechanisms on-wiki

| Mechanism | What it is | Status (live-verified) |
|---|---|---|
| **Wikipedia:List of infoboxes** | Index of infobox templates by subject | Exists; the manual lookup table |
| **Category:Infobox templates** (tree) | Template taxonomy; specialization visible (e.g. *Person infobox templates* → *Astronaut infobox templates* under *Infobox astronaut*) | Exists; used by {{Infobox requested}} as the pointer |
| **WikiProject standardization** | Projects standardize one infobox per subject (e.g. WikiProject Biography → {{Infobox person}}); project banners on talk pages advertise it | The {{Infobox requested}} template explicitly tells editors: "This talk page may contain the banner of a relevant project, that provides the standardized infobox for this type of article" |
| **{{Infobox requested}}** | Talk-page tag: "This article lacks an infobox. You may wish to add one…" | Exists; feeds **Category:Wikipedia articles with an infobox request** — **1,123 entries** (622 pages + 501 dated subcats), plus the dated *WikiProject Wikify* backlog categories |
| **PetScan template filter** | "Find pages in category X **not transcluding** template Y" | The standard power-user way to enumerate missing-infobox candidates (used in cleanup drives) |
| **Wikipedia:WikiProject Infoboxes** | Active maintenance project (design/consensus hub) | Active; `/Statistics` page has the historical ecosystem census (2013: 2.4M infoboxes; Taxobox 227k, Infobox3cols 140k, Infobox officeholder 70k, Infobox French commune 36k, Geobox 20k, Chembox 8k…) |

**Notable negative:** the mobile/desktop **apps have no "Add an infobox" task** — searched
mediawiki.org; suggested edits cover Add an image, Add a link, Add a citation, Add a fact.
The image-suggestion machine (Growth, 2021) has **no infobox equivalent anywhere in WMF tooling**.

## 3. What tools/bots already exist (none recommend infoboxes)

- **InfoboxBot** — BRFA *approved* (2017, operator Garzfoth, Python + mwparserfromhell):
  scope was **fixing non-standard parameters** on {{Infobox power station}}/{{Infobox dam}}
  (~2,500 + ~3,500 articles), *not* recommending or adding infoboxes. Precedent: supervised
  infobox-mass-editing bots are approvable.
- Toolforge registry (2,910 tools scanned): only **4 infobox-related hits** —
  `infobox-image-history` (timeline of infobox image changes), `mrbotinja` (removes flag icons),
  `boring` (YouTube-personality infobox stats), `klexiboxen` (Klexikon infobox/Wikidata sync, de).
  **No recommendation/suggestion tool exists.**
- Community Wishlist: no prominent infobox-suggestion proposal found in quick search.
- Academic: no strong arXiv hits for "automatic infobox generation" (0 exact-phrase results);
  infobox extraction/generation is an established research area historically (e.g. DBpedia's
  infobox ontology extraction) — general knowledge, not live-verified here.

## 4. Live demo: peer census for "1346 imperial election"

A real article from the infobox-request category. Method: siblings via
`Category:Imperial election (Holy Roman Empire)` → 39 peer pages → `prop=templates` census
(batched, continuation-aware) → filter to infobox-family templates.

**Result:**

- **26/26 election-event articles use {{Infobox election}}** — including both 1314 elections,
  both 1400 elections, 1519, 1742, etc. Unanimous within the event sub-genre.
- **1346 imperial election: no infobox** → recommendation: **{{Infobox election}}**, very high confidence.
- **May 1400 imperial election: no infobox** — the lone modern outlier (2,111-byte article,
  pageid 55856046 ≈ recent creation). An orphaned sibling: exactly the kind of article a
  recommender should catch.
- **Concept/institution articles** (Coronation of the Holy Roman Emperor, Prince-elector,
  Electoral capitulation, Electoral College, Kurverein, Interregnum, Declaration of Rhense):
  **0/7 have infoboxes** → the *"no infobox customary for this genre"* case, observable in the
  same category via sub-clustering (event ≠ institution).
- Specialized neighbors prove the specificity ladder: Frankfurt Cathedral → {{Infobox church}};
  Golden Bull of 1356 → {{Infobox document}}; the list article → no infobox (consistent with
  the 35% featured-list stat).

## 5. Algorithm spec: peer-census infobox recommender

**Input:** article title (optionally QID).

**Stage A — peer discovery (ranked signals):**
1. Wikidata **P31 (instance of) siblings** — same class, cross-language (e.g. all "imperial election" items)
2. **Deepest shared categories** (semantic ones: elections, people by occupation, settlements…)
3. **WikiProject banners** on the talk page (the {{Infobox requested}} pointer)

**Stage B — peer infobox census** (cheap: one API call per ~40 peers, `prop=templates`, filter
infobox-family: Infobox*, Taxobox, Geobox, Chembox, Drugbox, Infobox3cols, UK place, French commune):
- coverage rate (share of peers with any infobox)
- template distribution (which templates, how unanimous)
- sub-cluster check (event vs concept split, e.g. 26/27 vs 0/7)

**Stage C — decision logic:**
- coverage ≥ ~50% **and** a dominant template (≥ majority) → **recommend that template**;
  pick the *most specific* one via the template-category ladder (Infobox astronaut ⊂ Person ⊂
  generic), citing peer evidence
- coverage < ~25% **and** peers share the no-infobox trait → **"no infobox customary"**
  (high-value negative, with peer examples — the Prince-elector case)
- middle band → "weak signal", defer to WikiProject banner / talk page consensus
- **Exclusions:** disambiguation pages, redirects, lists (rarely infoboxed by convention),
  sidebar-using articles (detect sidebar templates separately — a sidebar may already serve the role)

**Stage D — feasibility & preview:**
- Check the article's Wikidata item for the template's key parameters (P569/P18/…):
  if the data exists, produce a **draft infobox** with a fill-rate score; if not, note the gap.
- Output: `{recommendation | none-warranted | weak-signal}, confidence, peer evidence,
  draft preview, missing-fields}`.

**Failure modes (honest assessment):** noisy categories (need sub-clustering), non-standard
infoboxes not in the filter list, sidebars miscounted as "no infobox", peer sets too small
(< ~5 peers → downgrade confidence), genres in transition (coverage rising → re-check cadence).

## 6. Where it plugs in

- Directly serves the **1,123-article infobox-request backlog** + the much larger silent
  backlog (the ~23% of articles without infoboxes, minus those appropriately without).
- Complements (not duplicates) the WMF app tasks — no infobox task exists there; this would be
  the first.
- Human-in-the-loop by construction: proposes with evidence; an editor posts.
  Matches the InfoboxBot precedent (supervised bot work is approvable).

## Sources
- en:Wikipedia:Manual of Style/Infoboxes (MOS:INFOBOXUSE), Quarry 103977 / 105209
- en:Template:Infobox requested; en:Category:Wikipedia articles with an infobox request (1,123)
- en:Wikipedia:WikiProject Infoboxes (+/Statistics); en:Wikipedia:Bots/Requests for approval/InfoboxBot
- Live peer census: Category:Imperial election (Holy Roman Empire), 39 articles, prop=templates
- toolinfo registry scan (2,910 tools); mediawiki.org search (app suggested-edits tasks)

---

## Appendix: implementation status (2026-08-27)

This research doc is the spec; it has been implemented and evaluated in this
repo (see README.md for the doc index):

- **Stages A–C implemented** (`lib/peers.js`, `lib/census.js`, `lib/decide.js`)
  with the peer-census recommender validated on the exact demo cases above:
  `1346 imperial election` → recommend {{Infobox election}} (high, 97%
  same-class), `May 1400 imperial election` → recommend (orphan caught),
  concept/institution articles → honest weak-signal (the 0/7 case needs the
  still-future semantic sub-clustering to separate genres automatically).
- **Test corpus**: 64 labeled cases from the infobox-request backlog — the
  9% stale-tag rate (57/601) provides free editor-consensus labels
  (`test/fixtures.json`, `scripts/fetch-queue.mjs`).
- **Eval**: 35 pass / 6 fail / 23 abstain — 85% accuracy on decisive
  verdicts (`test/EVALUATION.md`, results in `test/results/`).
- **Signal upgrades**: member-count category selection + short-description
  structural filtering moved 75% → 84% (`signals.md`, H1/H2 confirmed); a
  maintenance-category filter (clshow=!hidden + ignorable set) moved it to
  85% with no regressions.
- **Stage D** (Wikidata fill-rate draft preview) and the **template
  specificity ladder** remain future work; the userscript path is documented
  in README.
