# Localized infobox template naming across Wikipedia language editions

**Question:** can infobox templates be found by name pattern on each wiki, or is a name-independent method needed?

- Wikidata item for en `Category:Infobox templates`: **Q6154820** (`prop=pageprops` → `wbgetentities&props=sitelinks`)
- Editions measured: **20** of 20 targeted  •  templates sampled (ns 10 only): **13724**
- **Naive English rule `^Infobox` (ci): 8257 hits = 60.2%** of all sampled infobox templates
- Best per-wiki prefix rule (local ∪ English): 9468 = 69.0%
- Position-agnostic ceiling (name contains any local infobox word, prefix or suffix): 10785 = 78.6%
- Editions where the naive rule catches <50%: **12/20** (es, it, pt, ru, pl, sv, uk, ca, tr, he, ar, ko)
- Editions whose own infobox word sits mostly at the *end* of the title: **pl, tr, ko**

Sampling: `list=categorymembers` on the Wikipedia-linked category, namespace 10 (Template) only, for the category plus up to 30 of its direct subcategories (depth ≤ 2). Pages and subcategories are listed with separate `cmtype` calls, so a large ns-10 listing (enwiki has >1500 direct templates) cannot hide subcategories. Module (828) / Help (12) / project (4) / article (0) members that some wikis file in the same category are excluded from the counts and reported in Table 4.

## Table 1 — how many infobox templates the naive English `^Infobox` rule catches

| wiki | template ns | local category | templates sampled | naive `^Infobox` hits | naive share | best local prefix rule | its share | where the local word sits | top other leading words |
|---|---|---|---:|---:|---:|---|---:|---|---|
| **en** | `Template` | Category:Infobox templates | 2138 | 2106 | **98.5%** | `Infobox` (2099) | 98.2% | `infobox` in 98.7% of titles — prefix 2106 / suffix 2 | `Collapsed`×2, `Infraspeciesbox`×2, `KONS`×2, `Adjacent`×1 |
| **de** | `Vorlage` | Kategorie:Vorlage:Infobox | 489 | 462 | **94.5%** | `Infobox` (461) | 94.3% | `infobox` in 95.7% of titles — prefix 462 / suffix 5 | `Cycling`×3, `Grand-Tour-Platzierungen`×2, `Medienbox`×2, `Animated`×1 |
| **fr** | `Modèle` | Catégorie:Modèle infobox | 1049 | 1040 | **99.1%** | `Infobox` (944) | 90.0% | `infobox` in 99.7% of titles — prefix 1040 / suffix 4 | `Bandeau`×2, `Méta`×2, `Classes`×1, `Clip`×1 |
| **es** | `Plantilla` | Categoría:Wikipedia:Fichas | 198 | 4 | **2.0%** | `Ficha` (149) | 75.3% | `ficha` in 77.8% of titles — prefix 151 / suffix 1 | `Ficha`×149, `Caja`×8, `Sección`×4, `Cajabonita`×1 |
| **it** | `Template` | Categoria:Template sinottici | 337 | 3 | **0.9%** | `Infobox` (3) | 0.9% | `infobox` in 0.9% of titles — prefix 3 / suffix 0 | `Codifica`×14, `Razza`×4, `Squadra`×4, `Stazione`×4 |
| **pt** | `Predefinição` | Categoria:!Predefinições de caixas de informação | 406 | 42 | **10.3%** | `Info/Clube` (10) | 2.5% | `info/` in 85.5% of titles — prefix 347 / suffix 0 | `Info/Clube`×10, `Info/Caso`×5, `Info/Jogador`×5, `Info/Desporto`×4 |
| **ru** | `Шаблон` | Категория:Шаблоны-карточки | 584 | 0 | **0.0%** | `Карточка` (37) | 6.3% | `карточка` in 7.0% of titles — prefix 39 / suffix 3 | `Карточка`×37, `Cycling`×7, `Административная`×7, `Железнодорожная`×5 |
| **pl** | `Szablon` | Kategoria:Infoboksy | 301 | 39 | **13.0%** | `Infobox` (39) | 13.0% | `infobox` in 98.7% of titles — prefix 39 / suffix 246 | `Turniej`×9, `Sezon`×5, `Mistrzostwa`×4, `Organizacja`×4 |
| **nl** | `Sjabloon` | Categorie:Wikipedia:Sjablonen infobox | 1556 | 1527 | **98.1%** | `Infobox` (1520) | 97.7% | `infobox` in 98.1% of titles — prefix 1527 / suffix 1 | `Taxobox`×21, `Breedtedivbox`×1, `Lijnvoering`×1, `Lijnvoering/sub`×1 |
| **sv** | `Mall` | Kategori:Faktamallar | 681 | 200 | **29.4%** | `Faktamall` (128) | 18.8% | `infobox` in 30.1% of titles — prefix 200 / suffix 3 | `Faktamall`×128, `Faktaruta`×18, `Svensk`×8, `Fiktiv`×6 |
| **uk** | `Шаблон` | Категорія:Шаблони:Картки | 659 | 40 | **6.1%** | `Картка` (78) | 11.8% | `картка` in 23.8% of titles — prefix 156 / suffix 2 | `Картка`×78, `Населений`×21, `Зірка`×12, `Футбольний`×10 |
| **ja** | `Template` | Category:基礎情報テンプレート | 350 | 264 | **75.4%** | `基礎情報` (16) | 4.6% | `infobox` in 75.4% of titles — prefix 264 / suffix 1 | `基礎情報`×16, `AV女優`×1, `ActorActress`×1, `Awards`×1 |
| **zh** | `Template` | Category:信息框模板 | 1246 | 1148 | **92.1%** | `Infobox` (1146) | 92.0% | `infobox` in 92.5% of titles — prefix 1148 / suffix 2 | `Collapsed`×4, `TW`×2, `1829至2014年牛津剑桥赛艇对抗赛信息框`×1, `AV女優`×1 |
| **ca** | `Plantilla` | Categoria:Infotaules | 130 | 32 | **24.6%** | `Infotaula` (71) | 54.6% | `infotaula` in 56.2% of titles — prefix 71 / suffix 1 | `Infotaula`×71, `Proves`×9, `Global`×7, `Cycling`×2 |
| **id** | `Templat` | Kategori:Templat kotak info | 1015 | 919 | **90.5%** | `Infobox` (914) | 90.0% | `infobox` in 91.2% of titles — prefix 919 / suffix 4 | `Kotak`×25, `Planetbox`×8, `Karakter`×4, `Data`×3 |
| **tr** | `Şablon` | Kategori:Bilgi kutusu şablonları | 142 | 0 | **0.0%** | — (no local prefix rule) | 0.0% | `bilgi kutusu` in 93.0% of titles — prefix 1 / suffix 127 | `Arkeolojik`×3, `Astronomik`×2, `Bilgi`×2, `Dağ`×2 |
| **he** | `תבנית` | קטגוריה:תבניות מידע | 390 | 0 | **0.0%** | `מידע` (4) | 1.0% | `מידע` in 1.8% of titles — prefix 4 / suffix 2 | `אישיות`×12, `קבוצת`×12, `אלפבית`×8, `אתר`×6 |
| **ar** | `قالب` | تصنيف:قوالب صناديق معلومات | 814 | 40 | **4.9%** | `صندوق` (625) | 76.8% | `معلومات` in 79.7% of titles — prefix 35 / suffix 0 | `صندوق`×625, `بطاقة`×60, `معلومات`×35, `ص.م`×7 |
| **ko** | `틀` | 분류:정보 틀 | 701 | 2 | **0.3%** | `정보상자` (7) | 1.0% | `정보` in 55.6% of titles — prefix 8 / suffix 354 | `프로게임팀`×9, `정보상자`×7, `음악`×4, `추가`×4 |
| **vi** | `Bản mẫu` | Thể loại:Bản mẫu hộp thông tin | 538 | 389 | **72.3%** | `Infobox` (388) | 72.1% | `infobox` in 72.5% of titles — prefix 389 / suffix 1 | `Thông`×90, `Hộp`×24, `Bảng`×4, `Tóm`×3 |

## Table 2 — 3 example localized infobox template titles per wiki (verbatim)

| wiki | template ns | example 1 | example 2 | example 3 |
|---|---|---|---|---|
| **en** | `Template` | `Template:Infobox` | `Template:Infobox OS` | `Template:Infobox Art` |
| **de** | `Vorlage` | `Vorlage:Infobox` | `Vorlage:Infobox AFV` | `Vorlage:Infobox Alm` |
| **fr** | `Modèle` | `Modèle:Infobox` | `Modèle:Infobox API` | `Modèle:Infobox Art` |
| **es** | `Plantilla` | `Plantilla:Ficha` | `Plantilla:Ficha Wikidata` | `Plantilla:Ficha animanga` |
| **it** | `Template` | `Template:Codifica colore` | `Template:Codifica colore/Cmax` | `Template:Codifica colore/Cmin` |
| **pt** | `Predefinição` | `Predefinição:Info/Clube` | `Predefinição:Info/Clube de Futebol Americano` | `Predefinição:Info/Clube de basquetebol` |
| **ru** | `Шаблон` | `Шаблон:Карточка` | `Шаблон:Карточка КДС` | `Шаблон:Карточка КИС` |
| **pl** | `Szablon` | `Szablon:Turniej SGP infobox` | `Szablon:Turniej darterski infobox` | `Szablon:Turniej darterski ogólny infobox` |
| **nl** | `Sjabloon` | `Sjabloon:Infobox` | `Sjabloon:Infobox IPA` | `Sjabloon:Infobox bot` |
| **sv** | `Mall` | `Mall:Faktamall` | `Mall:Faktamall American Hockey League` | `Mall:Faktamall CPU socket` |
| **uk** | `Шаблон` | `Шаблон:Картка` | `Шаблон:Картка APU` | `Шаблон:Картка CPU` |
| **ja** | `Template` | `Template:Infobox` | `Template:Infobox2` | `Template:Infobox 姓` |
| **zh** | `Template` | `Template:Infobox` | `Template:Infobox OS` | `Template:Infobox 假名` |
| **ca** | `Plantilla` | `Plantilla:Infotaula Azerbaidjan als Jocs Olímpics` | `Plantilla:Infotaula Borgen` | `Plantilla:Infotaula IPA/core1` |
| **id** | `Templat` | `Templat:Infobox` | `Templat:Infobox OS` | `Templat:Infobox AoE` |
| **tr** | `Şablon` | `Şablon:Arkeolojik höyük` | `Şablon:Arkeolojik kültür bilgi kutusu` | `Şablon:Arkeolojik sit bilgi kutusu` |
| **he** | `תבנית` | `תבנית:אישיות` | `תבנית:אישיות בודהיסטית` | `תבנית:אישיות בייסבול` |
| **ar** | `قالب` | `قالب:صندوق بطولة تنس` | `قالب:صندوق بطولة تنس/شرح` | `قالب:صندوق تنظيم حدث رياضي` |
| **ko** | `틀` | `틀:프로게임팀 정보` | `틀:프로게임팀 정보/FPS` | `틀:프로게임팀 정보/기타` |
| **vi** | `Bản mẫu` | `Bản mẫu:Infobox CPU` | `Bản mẫu:Infobox GPU` | `Bản mẫu:Infobox IPA` |

## Table 3 — most common other leading words, and single-generic vs. many

| wiki | distinct non-`Infobox` leading words | top other leading words (count) | catch-all infobox template | structure |
|---|---:|---|---|---|
| **en** | 29 | `Collapsed` ×2, `Infraspeciesbox` ×2, `KONS` ×2, `Adjacent` ×1, `Automatic` ×1, `BC` ×1 | Template:Infobox | many (family of infoboxes) |
| **de** | 23 | `Cycling` ×3, `Grand-Tour-Platzierungen` ×2, `Medienbox` ×2, `Animated` ×1, `Basketball` ×1, `DnD` ×1 | Vorlage:Infobox | many (family of infoboxes) |
| **fr** | 7 | `Bandeau` ×2, `Méta` ×2, `Classes` ×1, `Clip` ×1, `Extrait` ×1, `Licence` ×1 | Modèle:Infobox | many (family of infoboxes) |
| **es** | 36 | `Ficha` ×149, `Caja` ×8, `Sección` ×4, `Cajabonita` ×1, `Columna` ×1, `Cronología` ×1 | Plantilla:Ficha | many (family of infoboxes) |
| **it** | 268 | `Codifica` ×14, `Razza` ×4, `Squadra` ×4, `Stazione` ×4, `Centrale` ×3, `Elemento` ×3 | — | many (family of infoboxes) |
| **pt** | 308 | `Info/Clube` ×10, `Info/Caso` ×5, `Info/Jogador` ×5, `Info/Desporto` ×4, `Info/Evento` ×4, `Info/Piloto` ×4 | — | many (family of infoboxes) |
| **ru** | 443 | `Карточка` ×37, `Cycling` ×7, `Административная` ×7, `Железнодорожная` ×5, `Игрок` ×5, `Азербайджан` ×4 | Шаблон:Карточка | many (family of infoboxes) |
| **pl** | 208 | `Turniej` ×9, `Sezon` ×5, `Mistrzostwa` ×4, `Organizacja` ×4, `Artysta` ×3, `Cycling` ×3 | — | many (family of infoboxes) |
| **nl** | 9 | `Taxobox` ×21, `Breedtedivbox` ×1, `Lijnvoering` ×1, `Lijnvoering/sub` ×1, `Navigatie` ×1, `Successie` ×1 | Sjabloon:Infobox | many (family of infoboxes) |
| **sv** | 291 | `Faktamall` ×128, `Faktaruta` ×18, `Svensk` ×8, `Fiktiv` ×6, `Nationellt` ×6, `Sidoruta` ×5 | — | many (family of infoboxes) |
| **uk** | 395 | `Картка` ×78, `Населений` ×21, `Зірка` ×12, `Футбольний` ×10, `Адміністративна` ×8, `НП` ×8 | Шаблон:Картка | many (family of infoboxes) |
| **ja** | 71 | `基礎情報` ×16, `AV女優` ×1, `ActorActress` ×1, `Awards` ×1, `Country` ×1, `Databox` ×1 | — | many (family of infoboxes) |
| **zh** | 94 | `Collapsed` ×4, `TW` ×2, `1829至2014年牛津剑桥赛艇对抗赛信息框` ×1, `AV女優` ×1, `Automatic` ×1, `Crosstalk` ×1 | Template:Infobox | many (family of infoboxes) |
| **ca** | 13 | `Infotaula` ×71, `Proves` ×9, `Global` ×7, `Cycling` ×2, `Companyia` ×1, `Databox` ×1 | — | many (family of infoboxes) |
| **id** | 55 | `Kotak` ×25, `Planetbox` ×8, `Karakter` ×4, `Data` ×3, `Pharaoh` ×3, `Dubai` ×2 | Templat:Infobox | many (family of infoboxes) |
| **tr** | 128 | `Arkeolojik` ×3, `Astronomik` ×2, `Bilgi` ×2, `Dağ` ×2, `Elektronik` ×2, `Etnik` ×2 | Şablon:Bilgi kutusu | many (family of infoboxes) |
| **he** | 278 | `אישיות` ×12, `קבוצת` ×12, `אלפבית` ×8, `אתר` ×6, `כלי` ×5, `נבחרת` ×5 | — | many (family of infoboxes) |
| **ar** | 45 | `صندوق` ×625, `بطاقة` ×60, `معلومات` ×35, `ص.م` ×7, `صحابة` ×4, `تعاقب` ×2 | — | many (family of infoboxes) |
| **ko** | 611 | `프로게임팀` ×9, `정보상자` ×7, `음악` ×4, `추가` ×4, `CPU` ×3, `가공의` ×3 | 틀:정보상자 | many (family of infoboxes) |
| **vi** | 30 | `Thông` ×90, `Hộp` ×24, `Bảng` ×4, `Tóm` ×3, `Tên` ×2, `Đội` ×2 | Bản mẫu:Hộp thông tin | many (family of infoboxes) |

## Table 4 — coverage, truncation and rate-limit report

| wiki | direct subcats | subcats sampled | subcats truncated | top listing truncated (cap 3000) | failed subcats (after backoff) | non-ns10 members seen | notes |
|---|---:|---:|---|---:|---|---|---|
| **en** | 19 | 19 | False | False | 0 | ns828: `Module:Infobox3cols`; ns12: `Help:Designing infoboxes` | — |
| **de** | 22 | 22 | False | False | 0 | ns12: `Hilfe:Infoboxen`; ns4: `Wikipedia:WikiProjekt Vorlagen/Anleitung: Erstellen einer Infobox` | — |
| **fr** | 10 | 10 | False | False | 0 | ns102: `Projet:Infobox/Didacticiel infobox avec des briques ex` | — |
| **es** | 13 | 13 | False | False | 0 | ns2: `Usuario:Poco a poco/Ficha de bic`; ns102: `Wikiproyecto:Anime y Manga/Infobox animanga` | — |
| **it** | 47 | 30 | True | False | 0 | — | — |
| **pt** | 18 | 18 | False | False | 0 | ns828: `Módulo:Infobox3cols`; ns4: `Wikipédia:Lista de predefinições/Modelos de caixas informativas` | — |
| **ru** | 11 | 11 | False | False | 0 | ns4: `Википедия:Шаблоны-карточки`; ns0: `Женщины в Алжире` | — |
| **pl** | 20 | 20 | False | False | 0 | ns12: `Pomoc:Infoboks`; ns102: `Wikiprojekt:Infoboksy` | — |
| **nl** | 6 | 6 | False | False | 0 | ns2: `Gebruiker:Chescargot/Infobox cursus` | — |
| **sv** | 32 | 30 | True | False | 0 | ns4: `Wikipedia:Faktamallar`; ns828: `Modul:Databox` | — |
| **uk** | 58 | 30 | True | False | 0 | ns12: `Довідка:Картка`; ns0: `Вищий орган Дель Бо` | — |
| **ja** | 10 | 10 | False | False | 0 | ns12: `Help:Infobox`; ns828: `モジュール:Infobox` | — |
| **zh** | 17 | 17 | False | False | 0 | ns4: `Wikipedia:格式手册/信息框`; ns2: `User:JuneAugust/軍隊資料` | — |
| **ca** | 7 | 7 | False | False | 0 | ns4: `Viquipèdia:Infotaules`; ns12: `Ajuda:Infotaules` | — |
| **id** | 33 | 30 | True | False | 0 | ns0: `Estafet obor Olimpiade Musim Panas 2020`; ns2: `Pengguna:Ariyanto~idwiki/papanka` | — |
| **tr** | 14 | 14 | False | False | 0 | — | — |
| **he** | 35 | 30 | True | False | 0 | ns4: `ויקיפדיה:יצירה על פי תבנית/בסיס לתבנית פרמטרית` | — |
| **ar** | 28 | 28 | False | False | 0 | ns2: `مستخدم:مواطن تونسي/ملعب5`; ns4: `ويكيبيديا:مشروع ويكي أعلام/صناديق معلومات` | — |
| **ko** | 18 | 18 | False | False | 0 | ns4: `위키백과:편집 지침/정보상자` | — |
| **vi** | 15 | 15 | False | False | 0 | ns4: `Wikipedia:Danh sách hộp thông tin`; ns0: `2001 Mars Odyssey` | — |

## Table 5 — independent cross-check (CirrusSearch `intitle:` counts, ns 10)

Second, independent method. Tables 1–4 count members of each wiki's Wikidata-linked infobox *category*; the counts below come from `list=search` over the wiki's **entire Template namespace** — a different data source and a different denominator. Direction agreement between the two is evidence the naming pattern belongs to the wiki, not to the category's membership.

| wiki | Template-ns titles containing `Infobox` | Template-ns titles containing the local word | local word searched | which dominates |
|---|---:|---:|---|---|
| **en** | 7776 | 7776 | `Infobox` | same word |
| **de** | 3483 | 3483 | `Infobox` | same word |
| **fr** | 4540 | 4540 | `Infobox` | same word |
| **es** | 116 | 1438 | `Ficha` | **local word** |
| **it** | 83 | 9 | `sinottico` | English word |
| **pt** | 885 | 3716 | `Info/` | **local word** |
| **ru** | 123 | 570 | `Карточка` | **local word** |
| **pl** | 1318 | 1318 | `infobox` | same word |
| **nl** | 2154 | 2154 | `Infobox` | same word |
| **sv** | 702 | 319 | `Faktamall` | English word |
| **uk** | 465 | 713 | `Картка` | **local word** |
| **ja** | 3289 | 354 | `基礎情報` | English word |
| **zh** | 3362 | 169 | `信息框` | English word |
| **ca** | 299 | 703 | `Infotaula` | **local word** |
| **id** | 3109 | 714 | `Kotak info` | English word |
| **tr** | 95 | 1999 | `bilgi kutusu` | **local word** |
| **he** | 2 | 50 | `מידע` | **local word** |
| **ar** | 928 | 3203 | `صندوق` | **local word** |
| **ko** | 870 | 3313 | `정보` | **local word** |
| **vi** | 1770 | 511 | `hộp thông tin` | English word |

The two denominators can disagree in direction. **sv** is the clearest case: namespace-wide the English word is ahead (702 vs 319 `Faktamall`), but inside svwiki's declared infobox set `Faktamall` is the leading word. The category method measures the wiki's own declared infobox family; the search method measures every template that carries the word anywhere in its title, including wrappers, subpages and documentation. Neither is authoritative on its own. Absolute size matters too: **it** (83 `Infobox` / 9 `sinottico`) and **he** (2 / 50) have no word that identifies their infoboxes on this wiki, out of thousands of templates — a name-pattern rule has nothing to bind to there.


---

Source: MediaWiki Action API per edition + Wikidata API. User-Agent `HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0`; ~1 s between requests; HTTP 429/503 retried with exponential backoff and counted, never treated as zero.

