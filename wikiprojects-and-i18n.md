# WikiProjects across Wikipedia editions — and what it means for porting the infobox recommender

Measured **2026-10-01** (UTC) with live MediaWiki/Wikidata APIs. The infobox-naming measurement is
reproducible from this repo: `infobox-naming.md` (tables), `infobox-naming.json` (raw per-edition
data) and `scripts/research/` (the three Python scripts that fetch and analyse it).
The remaining raw JSON artifacts behind other sections (`wiki_sizes.json`, `wd_discovery.json`,
`wikiproject_measure_v2.json`, `banner_measure_v3.json`, `cat_census.json`,
`infobox_intitle_probe.json`, `pageassessments_paraminfo.json`, `prior-research.md`,
`live/`) are available on request.
All counts below are things I actually queried; anything external is cited with a URL.

---

## Executive summary

**WikiProjects:** about **110 of the 325** Wikipedia language editions (≈34%) have any WikiProject
infrastructure, up from 92 in Feb 2021 — measured the same way the 2021 WWW paper measured it
(Wikidata item Q4234303). A census of the 106 editions with a linked WikiProjects category found
**92 holding actual project pages**. Use is far more concentrated than presence, and raw article
count is a misleading guide: the *second-largest* Wikipedia (Cebuano, 6.1M articles) has 8 project
pages and 261 active editors. Where projects are used, they are used at scale — **8.21M tagged talk
pages on enwiki**, 2.14M on fr, 1.08M on vi, 0.59M on tr, 0.42M on es — and importance/quality
ranking is live in most of them: six million enwiki articles carry an `importance=` value, with
localised equivalents (`önem`, `важливість`, `أهمية`) in other editions. German is the notable
exception (no en-style class × importance grid). The `PageAssessments` extension returns this
project/class/importance data as structured JSON on **en, fr, zh, ar, tr, hu**.

**Porting the infobox recommender:** the *code* is easy, the *evidence* is expensive.
Threading a wiki parameter through the pipeline (API client, SPARQL wiki-URL, UI links, CLI, `?wiki=`)
is **1–2 days** and the URL-keyed cache already makes per-wiki caching free. The hard dependency is
one function — `lib/census.js` identifies infoboxes by the literal prefix `Infobox` plus seven
hardcoded families — and measured across 20 editions only **~60% of a wiki's own infobox templates**
match that rule: 98.5% on en, 94.5% de, 99.1% fr — but **2.0% on es** (`Ficha`), 0.0% ru
(`Карточка`), 0.9% it, and **0% on tr and he**. Crucially the failure mode is silent: a missed family
lowers measured coverage, which flips the verdict to a confident **"no infobox customary"** — a wrong
answer, not an abstention, which breaks the tool's core honesty guarantee. Two refactors fix this
generically: detect infoboxes by membership in the wiki's Wikidata-linked *infobox-template category*
(Q6154820, 233 sitelinks) instead of by name, and read project banners via `PageAssessments` where
deployed (otherwise detect "a talk-page template that takes a quality/importance parameter").
Budget: plumbing 1–2d, language-agnostic detection 3–5d, UI/i18n 1–2d, per-wiki config 2–4d, and
**2–4d per wiki for threshold recalibration plus a 30–60 case labelled corpus with native review** —
that last item is where the project actually spends its time, and it is why a new edition's "accuracy"
cannot inherit the enwiki 90% figure. A credible **fr** pilot (2.14M tagged pages, unified
`Modèle:Wikiprojet`, PageAssessments live) is ~2–3 weeks part-time; "works on any wiki" is a
per-edition pilot programme, not a language toggle.

---

## 1. Headline answers

**How many editions use WikiProjects?**

| measure | value | source |
|---|---|---|
| language editions with article counts (live) | **325** | my `wiki_sizes.json` (meta sitematrix + per-wiki `siteinfo`) |
| editions with a WikiProject landing page | **110** | sitelinks of Wikidata **Q4234303** ("Wikipedia:WikiProject"), fetched today |
| same number in Feb 2021 | **92** | Johnson, Gerlach & Sáez-Trumper, *Language-agnostic Topic Classification for Wikipedia*, WWW '21, footnote 7 → **the same Wikidata item** |
| editions with a WikiProject *category* page | **118** | sitelinks of Wikidata **Q5492333** |
| editions with a generic `Template:WikiProject` | **31** | sitelinks of Wikidata **Q7926539** |
| editions with a `Category:Active WikiProjects` | **20** | sitelinks of Wikidata **Q8220402** |

So: **about one edition in three (~34%) has any WikiProject infrastructure at all**, and the number
has grown slowly (92 → 110 over five years, +18). That 110 figure is a Wikidata-sitelink count —
i.e. an editor-maintained proxy for "someone created the WikiProject landing page there", which is
exactly the same proxy the 2021 paper used, so the two numbers are comparable.

**Census over every edition with a Wikidata-linked WikiProject category page** (106 editions I could
resolve to a wiki URL; 1 call each): **92 hold actual WikiProject pages**, 12 are container categories
with subcategories but no direct pages, 2 are empty (af, io). Zero query failures.

**Actual *use* is far more concentrated than presence.** Among the 20 largest editions by article
count, 16 have some project infrastructure; the four that don't are the bot-built giants:

* **ceb** 6,115,856 articles / **261** active editors — 8 project-space pages, 6 category members
* **arz** 1,633,716 / **299** — no project pages found
* **war** 1,266,986 / **77** — no project pages found
* **ce** 867,984 / **74** — no project pages found (a category with 8 subcats, no pages)

Raw article-count ranking is therefore a *bad* proxy for WikiProject prevalence (Cebuano is the
second-largest Wikipedia and has no WikiProject culture). Active-editor count is the better proxy.

**Magnitudes where a single unified banner exists** (CirrusSearch `hastemplate:` in talk namespace,
fetched today):

| edition | banner | talk pages tagged |
|---|---|---|
| en | `Template:WikiProject banner shell` | **8,206,111** |
| fr | `Modèle:Wikiprojet` | **2,143,647** |
| vi | `Bản mẫu:Dự án Wiki` | **1,080,416** |
| tr | `Şablon:Vikiproje` | **589,712** |
| es | `Plantilla:PR` | **418,297** |

For comparison, the enwiki `Wikipedia:Statistics` table (community-maintained, accessed today) shows
8,636,963 total / 8,317,914 assessed — note that table **multi-counts** (an article in three projects
counts three times), whereas the 8.2M above is unique *talk pages*.

**Importance / quality ranking is real and widely deployed.** Measured on enwiki: **5,974,701** talk
pages transclude the banner shell *and* contain an `importance=` value — i.e. ~6M articles carry a
Top/High/Mid/Low rating somewhere. Localised equivalents, with the parameter name found verbatim in
the local banner source: `önem` (tr), `важливість` (uk), `أهمية` (ar), `importance` (fa, sl, bn, tl).
Documented schemes: fr `Projet:Évaluation` (avancement + importance), it `Progetto:Qualità/Importanza`
(only two importance values: massima/alta), ru (уровень + важность), es (per-project 0–100 rubrics,
importance máxima/alta/media/baja). **German is the exception**: `Wikipedia:Bewertungen` is
award-style (ausgezeichnet/lesenswert/informativ), not an en-style class × importance grid.

**Two structural architectures** (this matters for any tool that reads banners):

* **unified banner** — one template per wiki carrying all projects: en (shell), fr, vi, tr, es, hu
* **per-project banners** — one template per project, so a single-template count is meaningless:
  de (`Vorlage:WikiProjekt` is used on only 18 talk pages; assessment lives in per-project
  `/Bewertung` subpages), ru, it, pl, sv, zh, ko, ca, he, bg

**Ready-made structured feed:** the `PageAssessments` extension exposes
`prop=pageassessments` → `{project: {class, importance}}` per article. Verified present on
**en, fr, zh, ar, tr, hu** (via `action=paraminfo&modules=query+pageassessments`); verified *absent*
on de, es, it, ru, pt, fa, uk, simple, nl, sv, pl, ja, ko, he, ca, da, fi, cs and ~45 more.

---

### Prior work this corroborates or extends

* **Johnson, Gerlach & Sáez-Trumper (2021)**, *Language-agnostic Topic Classification for Wikipedia*,
  WWW '21 — the only cross-language WikiProject prevalence number I found: *"only 92 Wikipedia
  languages have a page describing WikiProjects"* (p. 2, footnote cites the same Wikidata item
  Q4234303). Also: WikiProject tags covered 5,970,598 enwiki articles (96% of all articles) in
  Dec 2020 → after language-mapping, labels for 30.5M articles across ~300 editions. Their stated
  motive for abandoning editor annotations is exactly the coverage variation measured here:
  *"not all language communities have the editor base or need to maintain these annotations."*
  <https://arxiv.org/pdf/2103.00068>
* **Kittur, Pendleton & Kraut (2009)**, *Herding the cats* (WikiSym '09): *"almost 2,000 subgroups
  known as WikiProjects"* — enwiki, 17 years ago; still ~true today (>2,000), i.e. the enwiki project
  count has been flat for nearly two decades.
* **Tinati & Luczak-Roesch (2017)**, *Wikipedia: a complex social machine*: *"618 active WikiProjects
  which are associated with 1.5 million articles"* — and they name the multilingual question as open:
  *"explore the role of WikiProjects in connecting articles and Wikipedians across linguistic
  borders."*
* **Solomon & Wash (2013)**, *Critical Mass of What?* (ICWSM) — project health is not a function of
  member count; relevant because "1,000 monitored by 30–2,000 editors" hides a long dormant tail.
* **Luyt (2018)**, *Wikipedia's gaps in coverage: are Wikiprojects a solution?* (*Online Information
  Review* 42(2)) — the one non-enwiki case study found: WikiProject Cambodia *"has failed to
  appreciably improve the coverage of Cambodian topics."*
* **WikiProject X** (enwiki, 2014–15, Harej + Isarra, WMF-funded) — the last serious attempt to
  re-engineer WikiProjects; now marked defunct. Worth knowing before proposing infrastructure work.
* **enwiki `Wikipedia:WikiProject`** (fetched today): *"The English Wikipedia currently has over 2,000
  WikiProjects, about 1,000 of which are monitored by 30–2,000 editors."* The
  `Council/Directory`: *"Due to the high volume of WikiProjects (> 2,000)…"*
* **enwiki `Version 1.0 Editorial Team/Assessment`** (content assessment): *"As of August 2024, over
  eight million articles have been assessed. Several other languages are also using this assessment
  system or a derivative thereof."* — i.e. the importance/quality vocabulary travels, which is what
  the `önem`/`важливість`/`أهمية` findings above show.
* **Meta `WikiProject`** is the cross-wiki hub; it links ~55 editions' landing pages.

---

## 2. Method and caveats

* Edition sizes and active-editor counts: `action=sitematrix` on meta + `meta=siteinfo&siprop=statistics`
  on every wiki (325 editions with counts).
* Localised naming (namespace + page + category + banner) was resolved **through Wikidata sitelinks**,
  not guessed: enwiki anchor pages → `wbgetentities` → per-wiki titles. This yields the real local
  names (`Wikipedia:WikiProjekt`, `Projet:Accueil` (ns **102**), `Şablon:Vikiproje`, …).
* Per-edition numbers in Table 1 are **bounded** (prefix scan capped at 2,000 pages; category BFS
  ≤ 20 categories, depth ≤ 2, ≤ 2,500 pages). They are lower bounds / order-of-magnitude indicators,
  not exact project counts. Exact-for-enwiki numbers are the ones quoted in §1.
* CirrusSearch `totalhits` is an estimate but is the only way to count transclusions at million scale;
  `intitle:` counts include `/doc` and `/styles.css` subpages, so Table 2 comparisons are
  order-of-magnitude, not precise.
* A handful of wikis returned HTTP 429 during harvesting (pt, fa, id in one pass); where a value could
  not be fetched it is shown as `—`, never as zero.
* External numbers are quoted from the citing paper/page; the 92-language figure was read verbatim in
  arXiv:2103.00068 (p. 2).

### Table 1 — per-edition measurements (top 20 by article count, then a stratified sample)

| edition | articles | active editors | project-space pages (prefix scan) | WikiProject category tree (pages + subcats, depth≤2) | busiest project banner on talk pages | importance/quality params found |
|---|---|---|---|---|---|---|
| en | 7,246,196 | 266,550 | 2000+ (`WikiProject`) | 1705 + 324 | `Template:WikiProject banner shell` → 8,206,111 | — |
| ceb | 6,115,856 | 261 | 8 (`WikiProyekto`) | 6 + 0 | — (no candidate found) | — |
| de | 3,155,077 | 33,354 | 2000+ (`WikiProjekt`) | 412 + 96 | `Vorlage:WikiProjekt` → 18 | — |
| fr | 2,782,441 | 34,710 | 49 (`Accueil`) | 2675 + 1146 | `Modèle:Wikiprojet` → 2,143,647 | — |
| sv | 2,628,245 | 4,806 | 2000+ (`Projekt`) | 773 + 121 | `Mall:Projekt` → 0 | — |
| nl | 2,228,100 | 7,798 | 2000+ (`Wikiproject`) | 643 + 37 | `Sjabloon:Wikiproject Skepticisme` → 78 | — |
| es | 2,140,384 | 38,642 | 252 (`Wikiproyecto`) | 487 + 409 | `Plantilla:PR` → 418,297 | — |
| ru | 2,119,978 | 16,158 | 9 (`Проект`) | 1233 + 1188 | `Шаблон:Проект` → 20 | — |
| it | 1,989,006 | 26,417 | 175 (`Progett`) | 258 + 188 | `Template:Progetto` → 1 | — |
| pl | 1,709,698 | 8,839 | 14 (`Wikiprojekt`) | 272 + 172 | `Szablon:Wikiprojekt` → 0 | — |
| arz | 1,633,716 | 299 | 1 (`ويكى مشروع`) | — + — | — (no candidate found) | — |
| zh | 1,558,672 | 13,567 | 2000+ | 155 + 165 | `Template:专题` → 0 | — |
| ja | 1,520,833 | 24,995 | 642 (`ウィキプロジェクト`) | 382 + 233 | `Template:ウィキプロジェクト イスラーム` → 375 | — |
| uk | 1,436,142 | 4,869 | 11 (`Вікіпроєкт`) | 384 + 292 | `Шаблон:Вікіпроєкт:Ємен` → 574 | важливість |
| ar | 1,334,027 | 5,660 | 150 (`مشاريع ويكي`) | 276 + 220 | `قالب:مشروع ويكي` → 5 | أهمية, الأهمية, خطاف_الأهمية |
| vi | 1,304,739 | 4,986 | 713 (`Dự án`) | 231 + 100 | `Bản mẫu:Dự án` → 1,080,416 | — |
| war | 1,266,986 | 77 | 1 (`WikiProyekto`) | — + — | — (no candidate found) | — |
| pt | 1,183,419 | 7,559 | 2000+ (`Projetos`) | 269 + 124 | `Predefinição:ProjetoAUTO` → 21 | — |
| fa | 1,093,766 | 7,241 | 2000+ (`ویکی‌پروژه`) | 570 + 493 | `الگو:ویکی‌پروژه آرژانتین` → 376 | importance |
| ce | 867,984 | 74 | — | 856 + 32 | `Кеп:Проект` → 0 | — |
| ca | 804,928 | 1,788 | 43 (`Viquiprojecte`) | 319 + 98 | `Plantilla:Viquiprojecte` → 0 | — |
| id | 798,320 | 4,986 | 800 (`ProyekWiki`) | 168 + 88 | `Templat:ProyekWiki Animanga` → 777 | — |
| ko | 766,612 | 5,033 | 389 (`위키프로젝트`) | 84 + 280 | `틀:위키프로젝트` → 0 | — |
| tr | 701,560 | 4,213 | 134 (`Vikiproje`) | 82 + 134 | `Şablon:Vikiproje` → 589,712 | önem |
| no | 691,626 | 2,261 | 700 (`Underprosjekter`) | 261 + 57 | — (no candidate found) | — |
| fi | 626,183 | 3,543 | 951 (`Wikiprojekti`) | 276 + 84 | `Malline:Wikiprojekti` → 199 | — |
| cs | 599,156 | 4,095 | 2000+ (`WikiProjekt`) | 244 + 70 | `Šablona:WikiProjekt Chemie` → 1,948 | — |
| hu | 574,726 | 2,665 | 10 (`Műhely`) | 284 + 156 | `Sablon:Műhelylista` → 0 | — |
| he | 405,867 | 6,611 | 1500+ (`מיזמי ויקיפדיה`) | 846 + 119 | `תבנית:מיזם` → 0 | — |
| da | 316,154 | 1,607 | 18 (`Projekt`) | 442 + 125 | — (no candidate found) | — |
| et | 262,217 | 975 | 479 (`Vikiprojekt`) | 890 + 21 | `Mall:Vikiprojekti teade-2` → 8 | — |
| sl | 199,154 | 603 | 261 (`WikiProjekt`) | 89 + 48 | `Predloga:WikiProjekt Medicina` → 1,797 | importance |
| mk | 165,034 | 329 | 194 (`ВикиПроект`) | 2548 + 69 | `Предлошка:ВикиПроект - ФИНКИ 2011-12` → 53 | — |
| te | 129,305 | 405 | 1177 (`వికీప్రాజెక్టు`) | — + — | `మూస:వికీప్రాజెక్టు ఎన్నికలు 2024 లో భాగం` → 4,158 | — |
| af | 131,189 | 269 | — | 0 + 0 | — (no candidate found) | — |
| cy | 284,718 | 170 | 87 (`WiciBrosiect`) | 2969 + 20 | — (no candidate found) | — |
| kk | 245,391 | 369 | 1 (`Жобалар`) | 199 + 28 | — (no candidate found) | — |
| tl | 49,627 | 277 | 76 (`WikiProyekto`) | 47 + 2 | `Padron:WikiProyekto Anime at manga` → 273 | importance |
| sw | 129,074 | 205 | — | 2810 + 8 | — (no candidate found) | — |
| myv | 7,874 | 24 | 1 (`Проектт`) | 0 + 7 | — (no candidate found) | — |
| diq | 43,073 | 56 | 1 (`Wikiproce`) | — + — | — (no candidate found) | — |
| is | 60,523 | 254 | — | — + — | — (no candidate found) | — |
| bn | 191,696 | 1,724 | 483 (`উইকিপ্রকল্প`) | 285 + 260 | `টেমপ্লেট:উইকিপ্রকল্প ইসলাম` → 221 | importance |
| hi | 171,805 | 1,125 | 227 (`विकिपरियोजना`) | 950 + 71 | `साँचा:विकिपरियोजना क्रिकेट` → 911 | — |
| ta | 190,803 | 510 | 144 (`விக்கித்திட்டம்`) | 142 + 85 | — (no candidate found) | — |
| be | 267,061 | 397 | 267 (`Праект`) | 410 + 70 | `Шаблон:Праект FreeBSD` → 0 | — |
| az | 217,768 | 839 | — | 192 + 166 | — (no candidate found) | — |
| ka | 199,570 | 329 | 68 (`პროექტი`) | 6 + 2 | `თარგი:პროექტ ავსტრიის სტატია` → 136 | — |
| el | 273,351 | 2,250 | 764 (`Επιχείρηση`) | 2631 + 59 | `Πρότυπο:Επιχείρηση Αττική` → 253 | — |
| hr | 235,687 | 942 | 5 (`WikiProjekt`) | 201 + 57 | — (no candidate found) | — |
| bg | 312,262 | 1,664 | 56 (`Проект`) | 392 + 103 | `Шаблон:Проект` → 0 | — |

---

## 3. What this means for the recommender's "third signal"

The tool uses three peer-discovery signals: Wikidata **P31 siblings**, **categories**, and
**WikiProject banners**. The WikiProject signal is:

* **strong on ~35–40 editions** — those with both project infrastructure *and* enough articles to
  form a peer set (en, de, fr, es, ru, it, pt, ja, zh, pl, nl, sv, uk, vi, ar, he, tr, ca, id, ko,
  cs, hu, fi, no, da, …);
* **structurally readable on 6** (en, fr, zh, ar, tr, hu) where PageAssessments returns
  project/class/importance as structured data instead of parsed banners;
* **absent on the article-count leaders** ceb/arz/war/ce, and on most editions under ~150k articles
  where there are no projects and often too few peers anyway.

Practical consequence: on a non-English edition, the banner is usually the *only* signal that names
the topic's editorial owner, so porting means either a per-wiki banner vocabulary or the
PageAssessments route where available.

---

## 4. Porting the infobox recommender: how hard is it?

### 4.1 What the thing actually is

`github.com/fuzheado/infobox-recommender` (cloned today): **Node 22, zero runtime dependencies**,
~1,400 lines of real code.

* `lib/api.js` — MediaWiki Action API + Wikidata SPARQL client, 1 s pacing, retry/backoff,
  **URL-keyed SHA1 disk cache**
* `lib/peers.js` — Stage A peer discovery (P31 SPARQL, category ranking, banners)
* `lib/census.js` — Stage B infobox census over peers (`prop=templates`, continuation-safe)
* `lib/decide.js` — Stage C thresholds + tiered "start small and adapt" evaluation
* `lib/analyze.js` — orchestration, digests
* `server.mjs` — `/`, `/?title=`, `/analyze?title=&output=json` (CORS `*`), `/analyze/stream` (SSE)
* `cli.js` — `node cli.js "Title" [--json] [--validate]`
* `public/` — SPA (`index.html`, `app.js`), `test/` — 88-case evaluation corpus

Live API surface today (probed): one required param `title`; `validate=1` switches to
"article already has an infobox" mode; `output=json` is documented but is a **no-op** (JSON is the
only output); an unknown param such as `lang=de` is **silently ignored** (probe: `analyze?title=Cat&lang=de`
returns the enwiki Cat). Guards: max 2 concurrent analyses, 150 analyses / 15 min + 40/min burst per client
(as of 2026-10-03; was 30 analyses / 5 min).

### 4.2 English-only inventory (file:line)

| # | where | what is hardcoded | port cost |
|---|---|---|---|
| 1 | `lib/api.js:110` | `enwiki()` → `https://en.wikipedia.org/w/api.php` | **small** — parameterise; the SHA1 cache is URL-keyed, so per-wiki caching is free |
| 2 | `lib/peers.js:47,60,69,175` | 4 SPARQL queries with `schema:isPartOf <https://en.wikipedia.org/>` | **small** — take the wiki URL as a binding |
| 3 | `lib/peers.js:185` | class labels fetched `languages: 'en'` | **small** — use the target wiki's language |
| 4 | `lib/peers.js:20-21` | `MAINTENANCE_CATEGORY_RE` — English maintenance categories (`Articles …`, `CS1 …`, `All stub`, `Use dmy dates`, …) | **medium, per wiki** — silently degrades: maintenance categories get treated as *genre* categories |
| 5 | `lib/peers.js:27-28` | `INTERSECTION_CATEGORY_RE` — English year phrasings (`1960 establishments in …`) | **medium, per wiki** |
| 6 | `lib/peers.js:148` | banners: `name.startsWith('WikiProject') \|\| name.startsWith('WP ')` | **medium** — needs a per-wiki banner vocabulary (see Table 1's banner column) |
| 7 | `lib/census.js:18-21` | **`INFOBOX()`** — `name.startsWith('Infobox')` + `['Taxobox','Geobox','Chembox','Drugbox','Infobox3cols','Speciesbox','Automatic taxobox']` | **the hard one** — see Table 2 |
| 8 | `lib/census.js:23` | sidebars: `name.startsWith('Sidebar')` | small–medium |
| 9 | `lib/census.js:29-30` | `SHORTDESC_EXCLUDE` — English "list of / set index / outline of…" | **medium**; and short descriptions don't exist in every edition, so the digest field goes empty |
| 10 | `lib/census.js:43-70` | `SUPPORTING_INFOBOXES`, `GENERIC_PLACE`, `SUBSIDIARY_SUFFIX_RE` (`rankings\|records\|statistics\|…`) | medium, per wiki |
| 11 | `lib/census.js:78-89` | `primaryInfobox()` ranks specificity by **name length** | medium — works language-agnostically but is a weak proxy once names localise |
| 12 | `lib/decide.js:18` | `LIST_RE = ^(List\|Lists\|Timeline\|Outline\|Index) of` | small, per wiki |
| 13 | `lib/decide.js:53-135` | thresholds (≥50% coverage & ≥50% dominance → recommend; ≤15/25% → none-warranted; <5 peers → weak) | **hard: research, not code** — calibrated on en norms; dewiki famously avoids biography infoboxes |
| 14 | `lib/decide.js` reason strings | English prose built inline; no i18n framework | medium |
| 15 | `lib/analyze.js:70,75` | REST `en.wikipedia.org/api/rest_v1/page/summary`; `{{Infobox requested}}` demand signal | small / en-only feature |
| 16 | `public/app.js:22,25,199,293,450` | 5 hardcoded `https://en.wikipedia.org/wiki/…` links (article, talk, template, category, infobox-request backlog) | **small** |
| 17 | `public/index.html` | title/tagline "English Wikipedia"; en examples; About modal quotes **MOS:INFOBOXUSE** and the en 77% Quarry census | small (code) / **judgement (per-wiki policy framing)** |
| 18 | `server.mjs:99-167` | no `wiki`/`lang` param; 2-concurrent semaphore; 1 s pacing to *one* wiki | small, but pacing must become per-wiki |
| 19 | `cli.js` | no wiki flag | trivial |
| 20 | `test/fixtures.json` (88 cases) | English ground truth; the "90% accuracy" claim is enwiki-only | **the real cost** — each new wiki needs its own labelled corpus and native review |
| 21 | `ROADMAP.md:170-173` | *"Explicitly not doing: Other wikis / i18n — dewiki avoids biography infoboxes; the census culture is per-wiki. P31 machinery generalizes, the norms don't."* | this is the honest prior position; §4.5 argues it is ~half right |

### 4.3 Table 2 — the empirical size of problem #7

`intitle:` counts in the template namespace (CirrusSearch, today). If the naive rule
`title starts with "Infobox"` were used on the target wiki, this is what it would catch vs. what the
local vocabulary actually is:

| edition | ns10 titles containing `Infobox` | local alternative (ns10 titles containing it) | PageAssessments extension |
|---|---|---|---|
| en | HTTP429 | — | YES |
| de | 3,493 | — | no |
| fr | 4,544 | — | YES |
| es | 116 | `Ficha` 1,443 | no |
| it | 83 | `Scheda` 88 | no |
| pt | 886 | `Info` 3,757 | no |
| ru | 123 | `Карточка` 581 | no |
| uk | 468 | `Картка` 736; `Карточка` 3 | no |
| pl | 1,318 | `Infoboks` 2 | no |
| nl | 2,156 | — | no |
| sv | 703 | `Faktaruta` 58 | no |
| cs | 1,033 | — | no |
| no | 215 | `Infoboks` 2,806 | no |
| fi | 20 | `Tietolaatikko` 97 | no |
| ca | 306 | `Infotaula` 703 | no |
| zh | 3,365 | `信息框` 169; `基础信息` 1 | YES |
| ja | 3,295 | — | no |
| ko | 873 | `정보상자` 83 | no |
| ar | 931 | `معلومات` 2,974 | YES |
| he | 2 | `מידע` 6,736 | no |
| vi | 1,770 | — | no |
| id | 3,110 | — | no |
| tr | 95 | — | YES |
| fa | HTTP429 | — | no |

Read: **"Infobox" happens to be the dominant form in roughly half the editions** (fr 4,544, de 3,493,
zh 3,365, ja 3,295, id 3,110, nl 2,156, vi 1,770, pl 1,318, cs 1,033, ar 931, pt 886, ko 873, sv 703,
uk 468, ca 306) — largely because the English word was imported along with the templates. But on
several majors the local word dominates: **he** `מידע` 6,736 vs `Infobox` **2**; **ar** `معلومات`
2,974 vs 931; **no** `Infoboks` 2,806 vs 215; **pt** `Info` 3,757 vs 886; **es** `Ficha` 1,443 vs 116;
**uk** `Картка` 736 vs 468; **ca** `Infotaula` 703 vs 306; **ru** `Карточка` 581 vs 123;
**it** `Scheda` 88 vs 83; **fi** `Tietolaatikko` 97 vs **20**.

**Reproducing Table 2, and filling its gaps.** These counts are `list=search` `intitle:` totals over
namespace 10; `scripts/research/infobox_step4_crosscheck.py` re-runs the probe and its output is
Table 5 of `infobox-naming.md`. Re-run today it returns near-identical counts — de 3,483 vs 3,493,
fr 4,540 vs 4,544, nl 2,154 vs 2,156, uk 465 vs 468, pl 1,318 vs 1,318 — i.e. a handful of templates'
worth of drift between the two runs, which is the expected scale over a few hours. It also fills the
two gaps above: **en 7,776** templates whose title contains `Infobox` (the 429 row here), and a
local-word column for **he** (2 vs 50 `מידע`), **ar** (928 vs 3,203 `صندوق`), **ko** (870 vs 3,313
`정보`), **tr** (95 vs 1,999 `bilgi kutusu`) and **vi** (1,770 vs 511 `hộp thông tin`).

The dangerous property is the **failure mode**: a missed infobox family doesn't error, it *lowers
coverage*, which pushes the verdict toward **"no infobox customary"** — a confident, wrong answer.
That is worse than abstaining, and it is exactly the kind of output a tool built on
peer-census honesty must not produce.

**Second, independent method** (category-denominated, so the denominator is the wiki's own declared
infobox set): take each wiki's Wikidata-linked "Infobox templates" category (Q6154820, 233 sitelinks),
list its ns-10 (Template) members plus those of its direct subcategories, and compute the share of
sampled template titles that start with `Infobox`. Across **20 editions / 13,724 templates: 8,257
(60.2%)** — full table, raw JSON and the scripts that produce them are in this repo
(`infobox-naming.md`, `infobox-naming.json`, `scripts/research/`). Per edition the split is
stark and matches the `intitle:` probe above:

* ≈90–99% "Infobox" — fr 99.1%, en 98.5%, nl 98.1%, de 94.5%, zh 92.1%, id 90.5%
* mixed — ja 75.4%, vi 72.3%, sv 29.4% (`Faktamall` 128), ca 24.6% (`Infotaula` 71),
  pl 13.0%, pt 10.3% (`Info/…`)
* local wins decisively — uk 6.1% (`Картка` 78), ar 4.9% (`صندوق` 625), **es 2.0%** (`Ficha` 149),
  it 0.9% (`Codifica`/`Razza`), ko 0.3%, **ru 0.0%**, **tr 0.0%**, **he 0.0%** (`אישיות`, `קבוצת`)

The naive rule catches under half the declared set on **12 of the 20 editions**.

**Position matters as much as vocabulary.** The rule is prefix-anchored, but several editions put the
infobox word at the *end* of the title: **pl** contains `infobox` in 98.7% of titles yet only 39 as a
prefix vs 246 as a suffix (`Aktor infobox`, `Akt prawny infobox`), so the naive rule catches 13.0%.
**tr** uses `bilgi kutusu` in 93.0% of titles — 1 prefix vs 127 suffix (`Arkeolojik sit bilgi
kutusu`) — so 0%. **ko** uses `정보` in 55.6% — 8 prefix vs 354 suffix (`프로게임팀 정보`) — so 0.3%.
A localized word list alone is therefore not sufficient for a detector; the match has to be
position-aware (or suffix-tolerant) too.

Caveat on that sampling: some wikis' "infobox" categories are container categories with mixed
contents (it sampled 268 distinct leading words across 337 templates), the five editions with more
than 30 direct subcategories (it, sv, uk, id, he) were read to a depth-2 cap of 30, and Lua/Module,
Help, project and article-space pages filed in the same categories are excluded (they are reported
separately in `infobox-naming.md`). Category membership is editor-maintained, so this measures what
each wiki *declares*, not every infobox template in existence.

### 4.4 Effort estimate

| workstream | effort | risk |
|---|---|---|
| `wiki` object threaded through `analyze/peers/census/decide`; `api.wiki(domain)`; SPARQL wiki-URL binding; `?wiki=` on `/analyze` + `/analyze/stream`; `--wiki` on the CLI; per-wiki pacing map | **1–2 days** | low |
| Per-wiki config file (`wikis.json`): domain, template namespace, infobox name patterns, supporting/legacy box names, maintenance-category regex, list-title regex, banner patterns, importance/quality param names, thresholds | **2–4 days** | low–medium (just data) |
| **Language-agnostic infobox detection** (§4.5) to shrink that config to a few lines per wiki | **3–5 days** | medium — needs validation |
| UI/i18n: per-wiki links, message table, per-wiki "why this is advisory" framing | **1–2 days** | low (but the policy text needs a human) |
| Threshold recalibration + a 30–60 case corpus **per wiki**, with native review | **2–4 days per wiki** | **high** — this is where the project actually spends time |
| Pilot: 2–3 editions end-to-end (suggest **fr** and **tr** — both have unified banners, `importance`-style params, and PageAssessments on fr) | **~2–3 weeks part-time total** | medium |

The code is genuinely easy; the *evidence* is expensive. The repo's own success metric is "90%
accuracy on decisive verdicts" against a hand-labelled corpus — that number cannot be claimed for a
new wiki without rebuilding the corpus there.

### 4.5 Two refactors that change the shape of the job

**(a) Stop detecting infoboxes by name — detect them by category.**
Wikidata **Q6154820** ("Category:Infobox templates") has **233 sitelinks**, i.e. most editions have a
local category for exactly this. Fetch the local "Infobox templates" category tree once per wiki,
cache it (the existing URL-keyed disk cache already does this), and treat *membership* as the infobox
test. Name patterns then become an optional fast path, not the definition. This removes problem #7,
#8 and most of #10 from the per-wiki work list.

**(b) Read project banners through PageAssessments where it exists, and through a param-shape test
elsewhere.** `prop=pageassessments` (deployed on en, fr, zh, ar, tr, hu) hands back
`{project: {class, importance}}` directly — no banner-name vocabulary, no parsing, and it already
localises the values (`fr`: `BA`/`maximum`/`élevée`; `ar`: `ب`/`عالية`; `zh`: `丙`/`极高`). Where the
extension is absent, detect a banner as "a talk-page template that accepts a quality/importance
parameter" — language-agnostic and discoverable from the template source — rather than by the
literal string "WikiProject".

### 4.6 Risks and honest limits

1. **Peer scarcity on small wikis.** The census needs ≥5 evaluable peers and the class tier needs ≥5
   same-P31 peers; on a 100k-article edition the equivalent of `Category:Imperial election` holds
   single-digit members, so the tool would return "weak signal" most of the time. It is useful on the
   ~25–30 editions with both depth and project infrastructure — not on "any wiki".
2. **Norms really are per-wiki** (the ROADMAP's point, and it is half right). The *machinery*
   (Wikidata P31, categories, banner/assessment data, template lists) is language-agnostic; the
   *thresholds and the policy framing* are not. dewiki's infobox practice differs from enwiki's
   enough that a ported enwiki threshold could produce a systematically wrong verdict.
3. **UI text is not the hard part** but the "advisory" framing is: MOS:INFOBOXUSE is enwiki policy.
   Some editions have no equivalent guidance; a port must not import enwiki's authority.
4. **One operational detail**: `server.mjs` paces at 1 s to a single wiki. Multi-wiki means one pace
   clock per wiki, and a shared concurrency budget, or the tool will 429 itself (I hit 429s today
   with three parallel harvests).

### 4.7 Recommendation

1. Do the **plumbing** now (1–2 days) — it is cheap, reversible, and makes `?wiki=` real.
2. Do the **category-based infobox detection** before touching per-wiki vocabularies; it is the
   single highest-leverage change and it also improves the enwiki instance's robustness.
3. Pick **one** pilot edition with a unified banner and a structured assessment route — **fr** is the
   best candidate (2.14M tagged talk pages, `Modèle:Wikiprojet`, PageAssessments present, mature
   `Projet:Évaluation`) — and be explicit that its accuracy claim is fr-local.
4. If the goal is "works anywhere", the honest framing is: **P31 + categories port for free; banners
   port where PageAssessments exists; infobox vocabulary ports via the Wikidata category; thresholds
   and the accuracy claim must be rebuilt per wiki.** That is a per-edition pilot programme, not a
   language toggle.
