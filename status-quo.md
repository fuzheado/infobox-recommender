# The status quo: how editors add infoboxes today

**Why this tool exists** — a documented-need assessment for the infobox
recommender. Research performed August 2026 (web search + enwiki Action API +
Phabricator + Meta + Wikimedia Diff). Supporting raw responses are cached in
`cache/research/` (core-pages.json, backlog-stats.json, activity3.json,
backlog-sample.json).

---

## TL;DR

The "which infobox should this article have?" step is a **real, documented,
still-unserved gap**:

- [Help:Infobox] codifies exactly two discovery methods: browse
  [Wikipedia:List of infoboxes] / [Category:Infobox templates] (~2,000
  templates), or *find a similar article and copy its infobox*. The peer
  census in this tool is that second method done systematically.
- The **WMF investigated the same idea** — the 2017 Community Wishlist
  [Infobox wizard proposal] — confirmed copy-paste "from other articles" is
  "the most common practice," but shipped only **TemplateWizard**: template
  *insertion* by name, with no topic-based selection (which users explicitly
  requested and never got).
- The **newest WMF tooling still defers the step**: the [Microtask
  Generator] (2026) flags "add an infobox" as a recommended task, and its own
  guidance for doing it is *"Find similar articles to copy template
  structure."*
- **Friction is documented** in WMF's own blog (infoboxes "can be a barrier
  for less-experienced editors… tricky to identify the right infobox"),
  in a [2013 ArbCom case] born of infobox disputes, and in the [{{Infobox
  requested}}] backlog (~627 articles, mostly uncleared, ~9% of tags already
  stale).
- **The obvious alternative — Wikidata-driven auto-infoboxes (Databox) — is
  off the table on enwiki**, which rejected them in the [2018 Infobox RfC].
  A recommendation tool fits enwiki's curated-template norm; automation
  doesn't.

The honest caveats: the addressable population is narrow (the tagged backlog
plus newcomers at article creation), the riskiest verdicts are the contested
"no infobox" zones, and the incumbent (a 30-second manual look at a similar
article) is free. See [Honest assessment](#honest-assessment) and
[Recommendations](#recommendations).

---

## 1. The question

Before building an infobox recommender, we asked: **what do editors actually
do today to figure out whether an article should have an infobox, and which
template to use?** Is there something already doing "as good as" a peer
census? Who has documented the experience — good or bad — of this process?

This document records what the research found, with sources. It does not
prove demand; it establishes that the *problem* is real and that the
*selection* half of it has been explicitly left unsolved by everyone who has
touched it.

## 2. Method & sources

- Web search across general engines (status-quo queries: how editors decide,
  backlog workflow, village pump/VE friction, existing tools, Wikidata
  auto-infoboxes, Reddit experiences).
- Direct on-wiki checks via the Action API (UA etiquette, paced): page
  wikitext of [Help:Infobox], [MOS:INFOBOXUSE], [WP:WikiProject Infoboxes],
  [Template:Infobox requested]; category sizes for
  [Category:Infobox templates] (2,086 pages) and [Category:Wikipedia
  articles with an infobox request] (627 pages); last-edit timestamps for
  the WikiProject and its /assistance subpage.
- Phabricator: [T184145] (Investigation: Infobox wizard) and its epic
  [T186653] (Template wizard).
- Meta: the [2017 wishlist proposal] and its [results]; [Community
  Tech/Template wizard] project page and [talk page].
- Wikimedia Diff: the [Databox post] (Feb 2026) and the [Microtask
  Generator post] (Mar 2026).
- The tool's own corpus (`test/fixtures.json`, built from the live backlog).

## 3. The documented status quo

### 3.1 The process is codified, and it is manual

[Help:Infobox] states: *"There are two steps required to add an infobox to an
article: 1. Determining which infobox is appropriate for the article 2.
Editing the article."* For step 1 it lists **exactly two ways** an editor
typically determines which infobox to use:

1. **Browse the set of all infoboxes** via [Wikipedia:List of infoboxes] or
   [Category:Infobox templates] — 2,086 templates as of August 2026. This is
   discovery *by name*: you must already know what you're looking for.
2. **Determine the name of the particular infobox used in a similar
   article** — i.e. open a similar article's source, read the `{{Infobox X}}`
   call, then copy the blank template from its documentation page and fill it
   in.

The second method is the "peer inspection" that this tool automates. It is
slow, biased by whichever article the editor happens to find, and requires
knowing *which* articles are similar in the first place — the exact question
the peer census answers with evidence.

[MOS:INFOBOXUSE] adds the decision framework: *"The use of infoboxes is
neither required nor prohibited for any article. Whether to include an
infobox, which infobox to include, and which parts of the infobox to use, is
determined through discussion and consensus among the editors at each
individual article."* Crucially for this tool, it ranks **"similar articles
do or do not have infoboxes" as a legitimate argument of *moderate*
weight** — the recommender's evidence framing (peer counts, coverage,
template distribution) is the policy's own decision framework, operationalized.
The same page reports (via [Quarry], as of 2026) that ~77% of enwiki
articles contain an infobox, 88% of featured articles, 35% of featured
lists — so roughly a fifth of articles are infoboxless, much of it
deliberate (lists, stubs, consensus no-infobox zones).

### 3.2 The community's request infrastructure exists — and doesn't clear

- [Template:Infobox requested] — a talk-page tag ("This article lacks an
  infobox…") that drops articles into [Category:Wikipedia articles with an
  infobox request]. **627 pages** as of August 2026. Several WikiProject
  banners support a `|needs-infobox=yes` parameter (rare: 8 insource hits).
- [WP:WikiProject Infoboxes] — designers'/maintainers' collaboration hub;
  its stated objective literally includes "Add infoboxes to the
  [category] articles." Its talk page's most recent edits are bot archives
  (last edit 2026-08-13, Lowercase sigmabot III).
- [WP:WikiProject Infoboxes/assistance] (WP:IBASSIST) — created April 2018
  because "large number of editors on Wikipedia don't come from technical
  backgrounds" and Teahouse was "too generic" / VP Tech "too technical."
  **Last human edit: 2024-02-24** — effectively defunct.
- The tool's own corpus quantifies the stagnation: of 601 backlog articles
  sampled, **57 (9%) already have an infobox** — the tag sat there so long
  the work was done independently, and the tag was never removed.

So the "requested infobox" pipeline is: tag → category → someone volunteers.
It mostly doesn't clear, which is why the backlog persists at ~600+ articles
year after year.

### 3.3 Humans are the fallback

"Which infobox should I use?" is a recurring [Help desk] question (e.g. Aug
2012: a bridge on the National Register of Historic Places — "Should I use
the NRHP infobox or the bridge infobox or both?" — answered by a human with
a copy-the-example answer). WikiProject talk pages serve the same role for
domain questions. When disagreement escalates, the decision becomes a
process dispute: the [ArbCom Infoboxes case] (opened July 2013, closed
September 2013, amended 2015) grew out of years of infobox debates in
classical music, where [WP:WikiProject Composers] concluded it is "normally
best… to avoid infoboxes altogether for classical musicians" absent
talk-page consensus. **These no-infobox-by-consensus zones are real**, and a
recommender must be able to say "no infobox customary" or abstain — which
this tool does by design.

## 4. Documented friction — user stories, good and bad

| Source | What it says |
|---|---|
| [2017 Wishlist proposal] (fr.wiki editor Snerkl) | *"The most common practice is still to copy and paste it from other articles, which still poses a problem: if the original article had a previous version or an incomplete version of the infobox, it will spread to other articles."* — the error-propagation argument, from a user, in 2017. |
| [Diff: Databox] (WMF/Wikimedia Deutschland, Feb 2026) | *"adding them to an article isn't always so easy. Infoboxes can be a barrier for less-experienced editors who haven't yet mastered the wikitext-syntax… Yet it can be tricky to identify the right infobox for the article topic, and more so to understand the parameters."* |
| [Infoboxer] (Univ. Zaragoza, 2015) | *"the current mechanisms for creating or extending infoboxes are difficult and complex for editors to use. The result is fewer Wikipedia pages with infoboxes and more errors, inaccuracies, and deficiencies in existing infoboxes."* |
| [Template wizard talk page] | Users asked for **search by category/topic** ("Many users doesn't know the exact name of the template to insert"); what shipped (TemplateWizard) searches by name only. |
| [VisualEditor feedback] | Adding an infobox via the transclusion dialog doesn't list parameters; "I still have to go to the infobox template page and individually add each parameter, which significantly hinders editing." |
| Readers (Reddit r/wikipedia, e.g. [Kubrick thread]) | Missing infoboxes are noticed by readers, not just editors. |
| [ArbCom Infoboxes case] (2013) | Infobox decisions can be intensely contested; a formal arbitration case was required for the classical-music area. |

## 5. Prior art — the "as good as" check

Nothing found does what this tool does: **recommend whether an infobox is
customary and which specific template peers use**, with evidence. The near
misses:

| Tool / approach | What it does | Why it isn't "as good as" a peer census |
|---|---|---|
| Manual similar-article lookup ([Help:Infobox]) | Copy an infobox from an article you happen to know | The dominant practice — and the thing being automated. Slow, biased, requires genre knowledge. |
| [TemplateWizard] (from [T184145]/[T186653], 2017 wishlist #5, 106 votes) | Insert + fill any template by name (TemplateData forms) | **Title search only.** The WMF's own investigation reframed the "Infobox wizard" wish as insertion, explicitly *not* selection. Category/topic browsing was requested, never delivered. Adoption lukewarm: 12,777 enwiki opt-ins, ~1,900 dialog launches. |
| VE "Insert template" | Same as above, in VisualEditor | Same limitation; also doesn't answer *whether*. |
| [Microtask Generator] (2026, WMF) | Flags "add an infobox" as a recommended improvement task, with quality/topic/country filters | Its task guidance for infoboxes is literally *"Find similar articles to copy template structure"* — the manual step. **Complement, not competitor**: they do triage, this tool does selection. |
| [Databox] (2018–, Wikidata auto-infobox) | One-word infobox fully populated from Wikidata | **Rejected on enwiki** (see §6). The auto-infobox future exists but not on this wiki. |
| [Infoboxer] (Univ. Zaragoza, research prototype) | Builds a new infobox: picks categories from a tree, suggests attributes/values from LOD statistics | Aims at *constructing/populating* boxes, not choosing among enwiki's existing 2,086 templates; never deployed on enwiki; dormant since ~2016. |
| AWB / bots | Fix parameters, normalize redirects ([AWB tasks]) | No general infobox-adding bot exists on enwiki; bot-added infoboxes would be controversial (see the composers' stance). |
| Search-based maintenance ([CirrusSearch] `insource:` regex; [T194448]) | Find articles *lacking* an infobox (`-insource:/{{[Ii]nfobox/`) | Finds candidates; doesn't recommend a template. |
| [Autocomplete gadget] (Meta) | Context-aware `{{template` autocomplete in the editor | Helps *typing* a name you already know. |

### The WMF's two near-misses

1. **2017**: the [Infobox wizard] wishlist proposal (copy-paste pain,
   propagate-errors) was investigated as [T184145], concluded "this feature
   already exists in Visual Editor" (insert-template modal), and was
   delivered as [TemplateWizard] — insertion only. The *selection* question
   was never addressed.
2. **2026**: the [Microtask Generator] detects the missing-infobox task
   automatically — and defers the *which* question to "find similar
   articles." The Diff post explicitly invites feedback and names edit
   suggestions / structured tasks as future integration targets.

Both teams touched the problem, documented it, and stopped one step short of
the selection step. That is the gap this tool fills.

## 6. Community norms that shape the solution space

- **enwiki rejects automatic infoboxes.** The [2018 Infobox RfC] and its
  aftermath ([use-of-Wikidata essay], [Phase 2 RfC]) produced no consensus
  for Wikidata-driven infoboxes; adoption remains per-template opt-in
  ([Category:Infobox templates using Wikidata]) and is itself contested.
  The community prefers curated, per-article templates. A *recommendation*
  tool respects that norm; a *generation* tool fights it.
- **Consensus, not rule, decides.** [MOS:INFOBOXUSE]: "whether to include an
  infobox, which infobox to include… is determined through discussion and
  consensus." The tool's abstain verdict is the honest answer in the
  contested middle band, and its evidence format ("similar articles do or do
  not have infoboxes") is explicitly the moderate-weight argument the policy
  names.
- **No-infobox zones exist by consensus** (classical music, some FAs).
  "None customary" and abstention are features, not failures.

## 7. Honest assessment

**The need is real but narrow.** Everything documented above says the
*selection* step is hard, especially for non-expert editors, and that no
tool serves it. But three caveats keep this an honest POC rather than a
proven product:

1. **Demand concentrates at two points**: article *creation* (authors
   choosing a box) and the *retro-fit backlog* (~600 tagged articles). Most
   of the ~23% infoboxless articles are lists, stubs, or deliberate
   no-infobox zones — not opportunities.
2. **The incumbent is free and decent**: an experienced editor's 30-second
   look at a similar article is genuinely good. The 90%-on-decisive-verdicts
   evaluation is measured against that benchmark, not against nothing.
   Differentiation must come from speed, evidence, and coverage (handling
   cases where the editor doesn't know a similar article exists).
3. **The riskiest outputs are the contested ones.** Recommending into a
   no-infobox-by-consensus zone (classical music) would be actively harmful
   and could get the tool (or its userscript) branded as a disruption
   generator. The abstain logic is the safety feature — and the reason the
   "wow rate" will stay below 100%.

**What would falsify the need**: if the backlog turned out to be mostly
recent tags (people *are* working it), or if a mainstream tool (VE,
Microtask Generator, Growth structured tasks) added infobox selection, or if
enwiki moved toward Databox-style automation.

## 8. Recommendations

1. **Quantify backlog age** — distribution of `|date=` on
   [Template:Infobox requested] tags. If most are 5+ years old, the pipeline
   is genuinely stalled and the tool has a real maintenance niche.
2. **Pursue integration with the [Microtask Generator]** — its "add an
   infobox" task currently ends at "find similar articles." A per-article
   recommendation link is the natural handoff, and its Diff post explicitly
   invites collaboration (edit suggestions T360489, structured tasks
   T362579).
3. **Ship the userscript / editor-embedded experience first** — the
   highest-value moment is article creation and the VE/template-insert
   dialog, where the "which box?" question actually gets asked.
4. **Prototype against contested zones** (classical music, biographies of
   living people) to prove the abstain logic protects the tool's reputation.
5. **Track the human-ask volume** (Help desk / Teahouse "which infobox?"
   questions per quarter) as a live demand signal.

## 9. Sources

1. Help:Infobox — https://en.wikipedia.org/wiki/Help:Infobox
2. Wikipedia:Manual of Style/Infoboxes (MOS:INFOBOXUSE) — https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Infoboxes
3. Quarry 103977 (infobox coverage ~77%) — https://quarry.wmcloud.org/query/103977
4. Wikipedia:List of infoboxes — https://en.wikipedia.org/wiki/Wikipedia:List_of_infoboxes
5. Category:Infobox templates (2,086 pages) — https://en.wikipedia.org/wiki/Category:Infobox_templates
6. Category:Wikipedia articles with an infobox request (627 pages) — https://en.wikipedia.org/wiki/Category:Wikipedia_articles_with_an_infobox_request
7. Template:Infobox requested — https://en.wikipedia.org/wiki/Template:Infobox_requested
8. Wikipedia:WikiProject Infoboxes — https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Infoboxes
9. Wikipedia:WikiProject Infoboxes/assistance — https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Infoboxes/assistance
10. Wikipedia:Arbitration/Requests/Case/Infoboxes — https://en.wikipedia.org/wiki/Wikipedia:Arbitration/Requests/Case/Infoboxes
11. Wikipedia talk:WikiProject Composers/Infoboxes RfC — https://en.wikipedia.org/wiki/Wikipedia_talk:WikiProject_Composers/Infoboxes_RfC
12. 2017 Community Wishlist Survey: Infobox wizard — https://meta.wikimedia.org/wiki/2017_Community_Wishlist_Survey/Editing/Infobox_wizard
13. 2017 Community Wishlist Survey results (Template wizard #5) — https://meta.wikimedia.org/wiki/Community_Wishlist_Survey_2017/Results
14. Community Tech/Template wizard (project page) — https://meta.wikimedia.org/wiki/Community_Tech/Template_wizard
15. Talk:Community Tech/Template wizard — https://meta.wikimedia.org/wiki/Talk:Community_Tech/Template_wizard
16. Phabricator T184145 (Investigation: Infobox wizard) — https://phabricator.wikimedia.org/T184145
17. Phabricator T186653 (Epic: Template wizard) — https://phabricator.wikimedia.org/T186653
18. Diff: "Wikidata-powered Infoboxes for Wikipedia: {{Databox}}" (2026-02-23) — https://diff.wikimedia.org/2026/02/23/wikidata-powered-infoboxes-for-wikipedia-databox/
19. Diff: "From Overwhelming Lists to Bite-Sized Edits: Meet the Microtask Generator" (2026-03-23) — https://diff.wikimedia.org/2026/03/23/from-overwhelming-lists-to-bite-sized-edits-meet-the-microtask-generator/
20. Microtask Generator (tool) — https://microtask-generator.toolforge.org/
21. Infoboxer (Univ. Zaragoza) — http://sid.cps.unizar.es/Infoboxer/ · code: https://github.com/ismaro3/infoboxer
22. Wikipedia:Wikidata/2018 Infobox RfC — https://en.wikipedia.org/wiki/Wikipedia:Wikidata/2018_Infobox_RfC
23. Wikipedia:Use of Wikidata in Wikipedia (essay) — https://en.wikipedia.org/wiki/Wikipedia:Use_of_Wikidata_in_Wikipedia
24. Wikipedia:Requests for comment/Wikidata Phase 2 — https://en.wikipedia.org/wiki/Wikipedia:Requests_for_comment/Wikidata_Phase_2
25. Category:Infobox templates using Wikidata — https://en.wikipedia.org/wiki/Category:Infobox_templates_using_Wikidata
26. Infoboxes on VisualEditor feedback (Flow topic) — https://www.mediawiki.org/wiki/Topic:Rb72vutze4wiklc8
27. Wikipedia Help desk archive (2012-08-17, "Multiple Infoboxes") — https://en.wikipedia.org/wiki/Wikipedia:Help_desk/Archives/2012_August_17
28. Reddit r/wikipedia: Stanley Kubrick page has no infobox — https://www.reddit.com/r/wikipedia/comments/mpbc4d/curiously_stanley_kubricks_wikipedia_page_has_no/
29. Gadgets/autocomplete (Meta) — https://meta.wikimedia.org/wiki/Gadgets/autocomplete
30. Wikipedia:AutoWikiBrowser/Tasks — https://en.wikipedia.org/wiki/Wikipedia:AutoWikiBrowser/Tasks
31. Help:CirrusSearch — https://www.mediawiki.org/wiki/Help:CirrusSearch/en
32. Phabricator T194448 (negatives for hastemplate) — https://phabricator.wikimedia.org/T194448

Raw research cache: `cache/research/` (gitignored).
