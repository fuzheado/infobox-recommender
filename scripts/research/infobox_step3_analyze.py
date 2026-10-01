#!/usr/bin/env python3
"""Step 3 (final): naming stats per wiki -> infobox_naming.json + .md

Metrics per wiki:
  * templates_sampled          - ns-10 category members (cat + direct subcats, depth<=2)
  * starts_with_infobox_*      - the naive English rule  ^Infobox (case-insensitive)
  * local_marker_*             - the best *localized* single-token rule for that wiki
  * lexeme_anywhere_share_pct  - share of titles containing any local infobox lexeme
  * top_other_leading_words    - most common non-Infobox leading tokens
  * example_titles             - 3 verbatim titles illustrating local naming
"""
import json, os, re, time
from collections import Counter

BASE = os.environ.get("INFOBOX_WORKDIR", ".")
raw = json.load(open(os.path.join(BASE, "infobox_raw.json")))
slinfo = json.load(open(os.path.join(BASE, "infobox_qid_sitelinks.json")))

ORDER = ["en", "de", "fr", "es", "it", "pt", "ru", "pl", "nl", "sv",
         "uk", "ja", "zh", "ca", "id", "tr", "he", "ar", "ko", "vi"]

# Localized words that Wikipedia communities use to mean "infobox".
LEXEMES = {
    "en": ["infobox"], "de": ["infobox"], "fr": ["infobox"],
    "es": ["ficha", "infobox"], "it": ["infobox", "sinottico", "tmp"],
    "pt": ["info/", "infobox", "caixa de informação"],
    "ru": ["карточка", "инфобокс", "infobox"],
    "pl": ["infoboks", "infobox"], "nl": ["infobox"],
    "sv": ["faktamall", "faktaruta", "infobox"],
    "uk": ["картка", "інфобокс", "infobox"], "ja": ["基礎情報", "infobox"],
    "zh": ["信息框", "infobox"], "ca": ["infotaula", "infobox"],
    "id": ["kotak info", "infobox"], "tr": ["bilgi kutusu", "infobox"],
    "he": ["מידע", "אינפובוקס", "infobox"],
    "ar": ["صندوق", "معلومات", "infobox"],
    "ko": ["정보상자", "정보", "infobox"], "vi": ["hộp thông tin", "infobox"],
}
GENERIC = {
    "en": ["infobox"], "de": ["infobox"], "fr": ["infobox"],
    "es": ["ficha", "ficha de", "infobox"], "it": ["infobox"],
    "pt": ["infobox", "caixa de informação"], "ru": ["карточка"],
    "pl": ["infobox"], "nl": ["infobox"], "sv": ["infobox"],
    "uk": ["картка"], "ja": ["基礎情報"], "zh": ["信息框", "infobox"],
    "ca": ["infotaula"], "id": ["infobox"], "tr": ["bilgi kutusu", "infobox"],
    "he": ["מידע"], "ar": ["معلومات", "صندوق معلومات"],
    "ko": ["정보", "정보상자"], "vi": ["hộp thông tin", "infobox"],
}


def strip_ns(title, ns_name, aliases):
    for p in [ns_name] + list(aliases) + ["Template"]:
        if p and title.lower().startswith(p.lower() + ":"):
            return title[len(p) + 1:]
    return title.split(":", 1)[1] if ":" in title else title


def lead_token(name):
    return re.split(r"[\s_]+", name.strip(), maxsplit=1)[0]


def contains_lexeme(name, lexemes):
    n = name.casefold()
    return any(lx.casefold() in n for lx in lexemes)


def main():
    results = []
    for lang in ORDER:
        rec = raw.get(lang)
        if not rec:
            continue
        ns_name = rec.get("template_ns_name") or "Template"
        aliases = rec.get("template_ns_aliases", [])
        raw_titles = rec.get("templates", [])
        pairs = [(t, strip_ns(t, ns_name, aliases)) for t in raw_titles]
        total = len(pairs)

        matched = [(t, s) for t, s in pairs if s.casefold().startswith("infobox")]
        share = round(100.0 * len(matched) / total, 1) if total else None

        # top leading words excluding the English Infobox pattern
        cnt, disp = Counter(), {}
        for _t, s in pairs:
            tok = lead_token(s)
            if tok.casefold().startswith("infobox"):
                continue
            cnt[tok.casefold()] += 1
            disp.setdefault(tok.casefold(), tok)
        top_other = [{"word": disp[k], "count": c} for k, c in cnt.most_common(8)]

        # localized lexeme metrics
        lex = LEXEMES.get(lang, ["infobox"])
        lex_hits = [(t, s) for t, s in pairs if contains_lexeme(s, lex)]
        lex_share = round(100.0 * len(lex_hits) / total, 1) if total else None

        # dominant local infobox word (may be the English "Infobox") and its position
        lx_freq = Counter()
        for _t, s in pairs:
            low = s.casefold()
            for lx in lex:
                if lx.casefold() in low:
                    lx_freq[lx] += 1
        dom = lx_freq.most_common(1)[0][0] if lx_freq else None
        dom_pre = dom_suf = 0
        if dom:
            d = dom.casefold()
            for _t, s in pairs:
                low = s.casefold()
                if d in low:
                    dom_pre += int(low.startswith(d))
                    dom_suf += int(low.endswith(d))
        marker = dom if (dom and dom.casefold() != "infobox") else None
        prefix_hits = [t for t, _s in pairs if dom and _s.casefold().startswith(dom.casefold())]
        suffix_hits = [t for t, _s in pairs if dom and _s.casefold().endswith(dom.casefold())]
        dom_share = (round(100.0 * lx_freq[dom] / total, 1)
                     if (dom and total) else None)

        # localized analogue of the naive rule: most common leading token that is
        # itself an infobox lexeme (e.g. Ficha, Faktamall, صندوق, Картка, 정보상자)
        pref_counter, pref_disp = Counter(), {}
        for _t, s in pairs:
            tok = lead_token(s)
            if any(lx.casefold() in tok.casefold() for lx in lex):
                pref_counter[tok.casefold()] += 1
                pref_disp.setdefault(tok.casefold(), tok)
        if pref_counter:
            best_pref_key = pref_counter.most_common(1)[0][0]
            best_pref_word = pref_disp[best_pref_key]
            best_pref_count = pref_counter[best_pref_key]
        else:
            best_pref_word, best_pref_count = None, 0
        best_pref_share = (round(100.0 * best_pref_count / total, 1)
                           if total else None)

        # examples
        if share is not None and share >= 50:
            ex = [t for t, _s in sorted(matched, key=lambda x: (len(x[1]), x[1]))][:3]
        else:
            ex = []
            if top_other:
                w = top_other[0]["word"]
                ex = sorted([t for t, s in pairs if lead_token(s) == w])[:3]
            if len(ex) < 3 and lex_hits:
                ex += sorted([t for t, _s in lex_hits if t not in ex])[:3 - len(ex)]
            if len(ex) < 3:
                ex += [t for t, _s in sorted(pairs, key=lambda x: (len(x[1]), x[1]))
                       if t not in ex][:3 - len(ex)]
        ex = ex[:3]

        gen = next((t for t, s in pairs if s.casefold() in GENERIC.get(lang, ["infobox"])), None)

        results.append({
            "lang": lang,
            "site": lang + "wiki",
            "local_category": rec.get("category"),
            "category_exists": rec.get("category_exists"),
            "categoryinfo": rec.get("categoryinfo"),
            "template_ns_name": ns_name,
            "template_ns_aliases": aliases,
            "templates_sampled": total,
            "starts_with_infobox_count": len(matched),
            "starts_with_infobox_share_pct": share,
            "local_infobox_lexemes": lex,
            "lexeme_anywhere_count": len(lex_hits),
            "lexeme_anywhere_share_pct": lex_share,
            "dominant_local_word": dom,
            "dominant_local_word_share_pct": dom_share,
            "dominant_local_word_prefix_count": dom_pre,
            "dominant_local_word_suffix_count": dom_suf,
            "best_local_prefix_word": best_pref_word,
            "best_local_prefix_count": best_pref_count,
            "best_local_prefix_share_pct": best_pref_share,
            "best_local_marker_non_english": marker,
            "distinct_leading_words": len(cnt),
            "top_other_leading_words": top_other,
            "generic_infobox_template": gen,
            "example_titles": ex,
            "subcat_count": rec.get("subcat_count"),
            "subcats_sampled": len(rec.get("subcats", [])),
            "subcats_truncated": rec.get("subcats_truncated"),
            "failed_subcats": len(rec.get("failed_subcats", [])),
            "non_template_ns_members": rec.get("non_template_ns_members", {}),
            "top_ns_histogram": rec.get("top_ns_histogram", {}),
            "notes": rec.get("notes", []),
        })

    tot = sum(r["templates_sampled"] for r in results)
    totm = sum(r["starts_with_infobox_count"] for r in results)
    totlx = sum(r["lexeme_anywhere_count"] for r in results)
    failed = [r["lang"] for r in results if r["failed_subcats"] or not r["templates_sampled"]]
    summary = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "wikidata_item": slinfo["qid"],
        "en_source_category": "Category:Infobox templates",
        "method": ("Wikidata sitelink of en Category:Infobox templates -> local category "
                   "title -> Action API list=categorymembers (ns 10 templates only) for the "
                   "category plus its direct subcategories (depth<=2)"),
        "pattern_tested": "title after local Template-namespace prefix starts with 'Infobox' (case-insensitive)",
        "editions_measured": len(results),
        "templates_sampled_total": tot,
        "pattern_hits_total": totm,
        "overall_pattern_hit_share_pct": round(100.0 * totm / tot, 1) if tot else None,
        "lexeme_anywhere_total": totlx,
        "lexeme_anywhere_share_pct": round(100.0 * totlx / tot, 1) if tot else None,
        "editions_with_complete_sample_failures": failed,
        "user_agent": "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0",
        "per_wiki": results,
    }
    json.dump(summary, open(os.path.join(BASE, "infobox-naming.json"), "w"),
              ensure_ascii=False, indent=1)

    L = []
    L.append("# Localized infobox template naming across Wikipedia language editions\n")
    L.append(f"- Wikidata item for en `Category:Infobox templates`: **{slinfo['qid']}** "
             f"(found via `action=query&prop=pageprops`, then `wbgetentities&props=sitelinks`)")
    L.append("- Rule tested: title after the local Template-namespace prefix "
             "**starts with `Infobox`**, case-insensitive")
    L.append(f"- Editions measured: **{len(results)}**  •  "
             f"templates sampled (ns 10 only): **{tot}**  •  "
             f"naive-rule hits: **{totm}** ({summary['overall_pattern_hit_share_pct']}%)")
    L.append(f"- Titles containing *any* localized infobox lexeme "
             f"(Ficha / Карточка / 基礎情報 / bilgi kutusu / 정보 …): **{totlx}** "
             f"({summary['lexeme_anywhere_share_pct']}%)")
    L.append("- Sampling: the Wikipedia-linked category for `Category:Infobox templates`, "
             "`list=categorymembers` restricted to **ns 10 (Template)** — the category itself "
             "plus its direct subcategories (depth ≤ 2), max 30 subcategories and 1500 members "
             "per wiki. Lua/Module (ns 828), Help (ns 12) and article (ns 0) members that some "
             "wikis file in the same category are excluded and reported separately.\n")

    L.append("## Table 1 — how many infobox templates the naive English `^Infobox` rule catches\n")
    L.append("| wiki | template ns | local category | templates sampled | naive `^Infobox` hits | naive share | best local prefix rule | its share | where the local word sits | top other leading words |")
    L.append("|---|---|---|---:|---:|---:|---|---:|---|---|")
    for r in results:
        ow = ", ".join(f"`{d['word']}`×{d['count']}" for d in r["top_other_leading_words"][:4]) or "—"
        cat = (r["local_category"] or "—").replace("|", "\\|")
        share = "n/a" if r["starts_with_infobox_share_pct"] is None else f"{r['starts_with_infobox_share_pct']}%"
        bp = (f"`{r['best_local_prefix_word']}` ({r['best_local_prefix_count']})"
              if r["best_local_prefix_word"] else "— (no local prefix rule)")
        bps = "n/a" if r["best_local_prefix_share_pct"] is None else f"{r['best_local_prefix_share_pct']}%"
        dw = r["dominant_local_word"] or "—"
        pos = (f"`{dw}` in {r['dominant_local_word_share_pct']}% of titles — "
               f"prefix {r['dominant_local_word_prefix_count']} / suffix {r['dominant_local_word_suffix_count']}")
        L.append(f"| **{r['lang']}** | `{r['template_ns_name']}` | {cat} | {r['templates_sampled']} | "
                 f"{r['starts_with_infobox_count']} | {share} | {bp} | {bps} | {pos} | {ow} |")

    L.append("\n## Table 2 — 3 example localized infobox template titles per wiki (verbatim)\n")
    L.append("| wiki | example 1 | example 2 | example 3 |")
    L.append("|---|---|---|---|")
    for r in results:
        e = (r["example_titles"] + ["—", "—", "—"])[:3]
        L.append(f"| **{r['lang']}** | " + " | ".join(f"`{x}`" for x in e) + " |")

    L.append("\n## Table 3 — single generic infobox vs. a family of many\n")
    L.append("| wiki | templates sampled | distinct non-`Infobox` leading words | lexeme-anywhere share | catch-all infobox template | verdict |")
    L.append("|---|---:|---:|---:|---|---|")
    for r in results:
        n = r["templates_sampled"]
        verdict = ("single generic" if n <= 3 else "few" if n <= 10 else "many (family of infoboxes)")
        lx = "n/a" if r["lexeme_anywhere_share_pct"] is None else f"{r['lexeme_anywhere_share_pct']}%"
        L.append(f"| **{r['lang']}** | {n} | {r['distinct_leading_words']} | {lx} | "
                 f"{r['generic_infobox_template'] or '—'} | {verdict} |")

    L.append("\n## Table 4 — coverage and rate-limit report\n")
    L.append("| wiki | subcats (direct) | subcats sampled | truncated | subcats failed (HTTP 429) | non-ns10 members seen (ns: title…) | notes |")
    L.append("|---|---:|---:|---|---:|---|---|")
    for r in results:
        ntm = "; ".join(f"ns{k}: `{v[0]}`" for k, v in list(r["non_template_ns_members"].items())[:2]) or "—"
        L.append(f"| **{r['lang']}** | {r['subcat_count'] if r['subcat_count'] is not None else '—'} | "
                 f"{r['subcats_sampled']} | {r['subcats_truncated']} | {r['failed_subcats']} | "
                 f"{ntm} | {'; '.join(r['notes']) or '—'} |")

    L.append("\n---\n")
    L.append("Source: MediaWiki Action API per edition + Wikidata API. "
             "User-Agent: `HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0`.\n")

    open(os.path.join(BASE, "infobox-naming.md"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
    return summary


if __name__ == "__main__":
    main()
