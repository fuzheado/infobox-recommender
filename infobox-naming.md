# Localized infobox template naming across Wikipedia language editions

- Wikidata item for en `Category:Infobox templates`: **Q6154820** (found via `action=query&prop=pageprops`, then `wbgetentities&props=sitelinks`)
- Rule tested: title after the local Template-namespace prefix **starts with `Infobox`**, case-insensitive
- Editions measured: **20**  •  templates sampled (ns 10 only): **13082**  •  naive-rule hits: **7630** (58.3%)
- Titles containing *any* localized infobox lexeme (Ficha / Карточка / 基礎情報 / bilgi kutusu / 정보 …): **10150** (77.6%)
- Sampling: the Wikipedia-linked category for `Category:Infobox templates`, `list=categorymembers` restricted to **ns 10 (Template)** — the category itself plus its direct subcategories (depth ≤ 2), max 30 subcategories and 1500 members per wiki. Lua/Module (ns 828), Help (ns 12) and article (ns 0) members that some wikis file in the same category are excluded and reported separately.

## Table 1 — how many infobox templates the naive English `^Infobox` rule catches

| wiki | template ns | local category | templates sampled | naive `^Infobox` hits | naive share | best local prefix rule | its share | where the local word sits | top other leading words |
|---|---|---|---:|---:|---:|---|---:|---|---|
| **en** | `Template` | Category:Infobox templates | 1496 | 1479 | 98.9% | `Infobox` (1474) | 98.5% | `infobox` in 99.0% of titles — prefix 1479 / suffix 1 | `Collapsed`×2, `Infraspeciesbox`×2, `KONS`×2, `Adjacent`×1 |
| **de** | `Vorlage` | Kategorie:Vorlage:Infobox | 489 | 462 | 94.5% | `Infobox` (461) | 94.3% | `infobox` in 95.7% of titles — prefix 462 / suffix 5 | `Cycling`×3, `Grand-Tour-Platzierungen`×2, `Medienbox`×2, `Animated`×1 |
| **fr** | `Modèle` | Catégorie:Modèle infobox | 1049 | 1040 | 99.1% | `Infobox` (944) | 90.0% | `infobox` in 99.7% of titles — prefix 1040 / suffix 4 | `Bandeau`×2, `Méta`×2, `Classes`×1, `Clip`×1 |
| **es** | `Plantilla` | Categoría:Wikipedia:Fichas | 198 | 4 | 2.0% | `Ficha` (149) | 75.3% | `ficha` in 77.8% of titles — prefix 151 / suffix 1 | `Ficha`×149, `Caja`×8, `Sección`×4, `Cajabonita`×1 |
| **it** | `Template` | Categoria:Template sinottici | 337 | 3 | 0.9% | `Infobox` (3) | 0.9% | `infobox` in 0.9% of titles — prefix 3 / suffix 0 | `Codifica`×14, `Razza`×4, `Squadra`×4, `Stazione`×4 |
| **pt** | `Predefinição` | Categoria:!Predefinições de caixas de informação | 406 | 42 | 10.3% | `Info/Clube` (10) | 2.5% | `info/` in 85.5% of titles — prefix 347 / suffix 0 | `Info/Clube`×10, `Info/Caso`×5, `Info/Jogador`×5, `Info/Desporto`×4 |
| **ru** | `Шаблон` | Категория:Шаблоны-карточки | 584 | 0 | 0.0% | `Карточка` (37) | 6.3% | `карточка` in 7.0% of titles — prefix 39 / suffix 3 | `Карточка`×37, `Cycling`×7, `Административная`×7, `Железнодорожная`×5 |
| **pl** | `Szablon` | Kategoria:Infoboksy | 301 | 39 | 13.0% | `Infobox` (39) | 13.0% | `infobox` in 98.7% of titles — prefix 39 / suffix 246 | `Turniej`×9, `Sezon`×5, `Mistrzostwa`×4, `Organizacja`×4 |
| **nl** | `Sjabloon` | Categorie:Wikipedia:Sjablonen infobox | 1556 | 1527 | 98.1% | `Infobox` (1520) | 97.7% | `infobox` in 98.1% of titles — prefix 1527 / suffix 1 | `Taxobox`×21, `Breedtedivbox`×1, `Lijnvoering`×1, `Lijnvoering/sub`×1 |
| **sv** | `Mall` | Kategori:Faktamallar | 681 | 200 | 29.4% | `Infobox` (192) | 28.2% | `infobox` in 30.1% of titles — prefix 200 / suffix 3 | `Faktamall`×128, `Faktaruta`×18, `Svensk`×8, `Fiktiv`×6 |
| **uk** | `Шаблон` | Категорія:Шаблони:Картки | 659 | 40 | 6.1% | `Картка` (78) | 11.8% | `картка` in 23.8% of titles — prefix 156 / suffix 2 | `Картка`×78, `Населений`×21, `Зірка`×12, `Футбольний`×10 |
| **ja** | `Template` | Category:基礎情報テンプレート | 350 | 264 | 75.4% | `Infobox` (260) | 74.3% | `infobox` in 75.4% of titles — prefix 264 / suffix 1 | `基礎情報`×16, `AV女優`×1, `ActorActress`×1, `Awards`×1 |
| **zh** | `Template` | Category:信息框模板 | 1246 | 1148 | 92.1% | `Infobox` (1146) | 92.0% | `infobox` in 92.5% of titles — prefix 1148 / suffix 2 | `Collapsed`×4, `TW`×2, `1829至2014年牛津剑桥赛艇对抗赛信息框`×1, `AV女優`×1 |
| **ca** | `Plantilla` | Categoria:Infotaules | 130 | 32 | 24.6% | `Infotaula` (71) | 54.6% | `infotaula` in 56.2% of titles — prefix 71 / suffix 1 | `Infotaula`×71, `Proves`×9, `Global`×7, `Cycling`×2 |
| **id** | `Templat` | Kategori:Templat kotak info | 1015 | 919 | 90.5% | `Infobox` (914) | 90.0% | `infobox` in 91.2% of titles — prefix 919 / suffix 4 | `Kotak`×25, `Planetbox`×8, `Karakter`×4, `Data`×3 |
| **tr** | `Şablon` | Kategori:Bilgi kutusu şablonları | 142 | 0 | 0.0% | — (no local prefix rule) | 0.0% | `bilgi kutusu` in 93.0% of titles — prefix 1 / suffix 127 | `Arkeolojik`×3, `Astronomik`×2, `Bilgi`×2, `Dağ`×2 |
| **he** | `תבנית` | קטגוריה:תבניות מידע | 390 | 0 | 0.0% | `מידע` (4) | 1.0% | `מידע` in 1.8% of titles — prefix 4 / suffix 2 | `אישיות`×12, `קבוצת`×12, `אלפבית`×8, `אתר`×6 |
| **ar** | `قالب` | تصنيف:قوالب صناديق معلومات | 814 | 40 | 4.9% | `صندوق` (625) | 76.8% | `معلومات` in 79.7% of titles — prefix 35 / suffix 0 | `صندوق`×625, `بطاقة`×60, `معلومات`×35, `ص.م`×7 |
| **ko** | `틀` | 분류:정보 틀 | 701 | 2 | 0.3% | `정보상자` (7) | 1.0% | `정보` in 55.6% of titles — prefix 8 / suffix 354 | `프로게임팀`×9, `정보상자`×7, `음악`×4, `추가`×4 |
| **vi** | `Bản mẫu` | Thể loại:Bản mẫu hộp thông tin | 538 | 389 | 72.3% | `Infobox` (388) | 72.1% | `infobox` in 72.5% of titles — prefix 389 / suffix 1 | `Thông`×90, `Hộp`×24, `Bảng`×4, `Tóm`×3 |

## Table 2 — 3 example localized infobox template titles per wiki (verbatim)

| wiki | example 1 | example 2 | example 3 |
|---|---|---|---|
| **en** | `Template:Infobox` | `Template:Infobox OS` | `Template:Infobox Art` |
| **de** | `Vorlage:Infobox` | `Vorlage:Infobox AFV` | `Vorlage:Infobox Alm` |
| **fr** | `Modèle:Infobox` | `Modèle:Infobox API` | `Modèle:Infobox Art` |
| **es** | `Plantilla:Ficha` | `Plantilla:Ficha Wikidata` | `Plantilla:Ficha animanga` |
| **it** | `Template:Codifica colore` | `Template:Codifica colore/Cmax` | `Template:Codifica colore/Cmin` |
| **pt** | `Predefinição:Info/Clube` | `Predefinição:Info/Clube de Futebol Americano` | `Predefinição:Info/Clube de basquetebol` |
| **ru** | `Шаблон:Карточка` | `Шаблон:Карточка КДС` | `Шаблон:Карточка КИС` |
| **pl** | `Szablon:Turniej SGP infobox` | `Szablon:Turniej darterski infobox` | `Szablon:Turniej darterski ogólny infobox` |
| **nl** | `Sjabloon:Infobox` | `Sjabloon:Infobox IPA` | `Sjabloon:Infobox bot` |
| **sv** | `Mall:Faktamall` | `Mall:Faktamall American Hockey League` | `Mall:Faktamall CPU socket` |
| **uk** | `Шаблон:Картка` | `Шаблон:Картка APU` | `Шаблон:Картка CPU` |
| **ja** | `Template:Infobox` | `Template:Infobox2` | `Template:Infobox 姓` |
| **zh** | `Template:Infobox` | `Template:Infobox OS` | `Template:Infobox 假名` |
| **ca** | `Plantilla:Infotaula Azerbaidjan als Jocs Olímpics` | `Plantilla:Infotaula Borgen` | `Plantilla:Infotaula IPA/core1` |
| **id** | `Templat:Infobox` | `Templat:Infobox OS` | `Templat:Infobox AoE` |
| **tr** | `Şablon:Arkeolojik höyük` | `Şablon:Arkeolojik kültür bilgi kutusu` | `Şablon:Arkeolojik sit bilgi kutusu` |
| **he** | `תבנית:אישיות` | `תבנית:אישיות בודהיסטית` | `תבנית:אישיות בייסבול` |
| **ar** | `قالب:صندوق بطولة تنس` | `قالب:صندوق بطولة تنس/شرح` | `قالب:صندوق تنظيم حدث رياضي` |
| **ko** | `틀:프로게임팀 정보` | `틀:프로게임팀 정보/FPS` | `틀:프로게임팀 정보/기타` |
| **vi** | `Bản mẫu:Infobox CPU` | `Bản mẫu:Infobox GPU` | `Bản mẫu:Infobox IPA` |

## Table 3 — single generic infobox vs. a family of many

| wiki | templates sampled | distinct non-`Infobox` leading words | lexeme-anywhere share | catch-all infobox template | verdict |
|---|---:|---:|---:|---|---|
| **en** | 1496 | 14 | 99.0% | Template:Infobox | many (family of infoboxes) |
| **de** | 489 | 23 | 95.7% | Vorlage:Infobox | many (family of infoboxes) |
| **fr** | 1049 | 7 | 99.7% | Modèle:Infobox | many (family of infoboxes) |
| **es** | 198 | 36 | 79.8% | Plantilla:Ficha | many (family of infoboxes) |
| **it** | 337 | 268 | 0.9% | — | many (family of infoboxes) |
| **pt** | 406 | 308 | 96.3% | — | many (family of infoboxes) |
| **ru** | 584 | 443 | 7.5% | Шаблон:Карточка | many (family of infoboxes) |
| **pl** | 301 | 208 | 98.7% | — | many (family of infoboxes) |
| **nl** | 1556 | 9 | 98.1% | Sjabloon:Infobox | many (family of infoboxes) |
| **sv** | 681 | 291 | 51.8% | — | many (family of infoboxes) |
| **uk** | 659 | 395 | 30.2% | Шаблон:Картка | many (family of infoboxes) |
| **ja** | 350 | 71 | 80.3% | — | many (family of infoboxes) |
| **zh** | 1246 | 94 | 95.2% | Template:Infobox | many (family of infoboxes) |
| **ca** | 130 | 13 | 87.7% | — | many (family of infoboxes) |
| **id** | 1015 | 55 | 93.8% | Templat:Infobox | many (family of infoboxes) |
| **tr** | 142 | 128 | 93.0% | Şablon:Bilgi kutusu | many (family of infoboxes) |
| **he** | 390 | 278 | 1.8% | — | many (family of infoboxes) |
| **ar** | 814 | 45 | 86.4% | — | many (family of infoboxes) |
| **ko** | 701 | 611 | 56.2% | 틀:정보상자 | many (family of infoboxes) |
| **vi** | 538 | 30 | 77.0% | Bản mẫu:Hộp thông tin | many (family of infoboxes) |

## Table 4 — coverage and rate-limit report

| wiki | subcats (direct) | subcats sampled | truncated | subcats failed (HTTP 429) | non-ns10 members seen (ns: title…) | notes |
|---|---:|---:|---|---:|---|---|
| **en** | 0 | 0 | False | 0 | ns828: `Module:Infobox3cols`; ns12: `Help:Designing infoboxes` | — |
| **de** | 22 | 22 | False | 0 | ns12: `Hilfe:Infoboxen`; ns4: `Wikipedia:WikiProjekt Vorlagen/Anleitung: Erstellen einer Infobox` | — |
| **fr** | 10 | 10 | False | 0 | ns102: `Projet:Infobox/Didacticiel infobox avec des briques ex` | — |
| **es** | 13 | 13 | False | 0 | ns2: `Usuario:Poco a poco/Ficha de bic`; ns102: `Wikiproyecto:Anime y Manga/Infobox animanga` | — |
| **it** | 47 | 30 | True | 0 | — | — |
| **pt** | 18 | 18 | False | 0 | ns828: `Módulo:Infobox3cols`; ns4: `Wikipédia:Lista de infocaixas` | — |
| **ru** | 11 | 11 | False | 0 | ns4: `Википедия:Шаблоны-карточки`; ns0: `Женщины Самоа` | — |
| **pl** | 20 | 20 | False | 0 | ns12: `Pomoc:Infoboks`; ns102: `Wikiprojekt:Infoboksy` | — |
| **nl** | 6 | 6 | False | 0 | ns2: `Gebruiker:Chescargot/Infobox cursus` | — |
| **sv** | 32 | 30 | True | 0 | ns4: `Wikipedia:Faktamallar`; ns828: `Modul:Databox` | — |
| **uk** | 58 | 30 | True | 0 | ns12: `Довідка:Картка`; ns0: `Вищий орган Дель Бо` | — |
| **ja** | 10 | 10 | False | 0 | ns12: `Help:Infobox`; ns828: `モジュール:Infobox` | — |
| **zh** | 17 | 17 | False | 0 | ns4: `Wikipedia:格式手册/信息框`; ns2: `User:JuneAugust/軍隊資料` | — |
| **ca** | 7 | 7 | False | 0 | ns4: `Viquipèdia:Infotaules`; ns12: `Ajuda:Infotaules` | — |
| **id** | 33 | 30 | True | 0 | ns0: `Estafet obor Olimpiade Musim Panas 2020`; ns2: `Pengguna:Ariyanto~idwiki/papanka` | — |
| **tr** | 14 | 14 | False | 0 | — | — |
| **he** | 35 | 30 | True | 0 | ns4: `ויקיפדיה:יצירה על פי תבנית/בסיס לתבנית פרמטרית` | — |
| **ar** | 28 | 28 | False | 0 | ns2: `مستخدم:مواطن تونسي/ملعب5`; ns4: `ويكيبيديا:مشروع ويكي أعلام/صناديق معلومات` | — |
| **ko** | 18 | 18 | False | 0 | ns4: `위키백과:편집 지침/정보상자` | — |
| **vi** | 15 | 15 | False | 0 | ns4: `Wikipedia:Danh sách hộp thông tin`; ns0: `2001 Mars Odyssey` | — |

---

Source: MediaWiki Action API per edition + Wikidata API. User-Agent: `HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0`.

