#!/usr/bin/env python3
"""Step 3: per-edition naming statistics for infobox templates.

Run from the repository root (after steps 1-2):
    INFOBOX_WORKDIR=. python3 scripts/research/infobox_step3_analyze.py

Reads infobox_raw.json + infobox_qid_sitelinks.json -> writes infobox-naming.json
and infobox-naming.md.

Candidate detection rules scored over the SAME sample:
  R1 naive English   : title (after the local Template-ns prefix) starts with
                       "Infobox", case-insensitive  <- what lib/census.js does
  R2 localized prefix: title starts with the wiki's own infobox word
  R3 union(R1, R2)
  R4 position-agnostic: title CONTAINS any localized infobox word anywhere
                       (so a suffix-only naming convention still counts) - a
                       ceiling for language-aware name matching
Also records where the local word sits (prefix vs suffix), the most common other
leading words, the local template-namespace name, example titles, and whether the
wiki has a single catch-all infobox template or a family of many.
"""
import json, os, re, time
from collections import Counter

BASE = os.environ.get("INFOBOX_WORKDIR", ".")
RAW = os.path.join(BASE, "infobox_raw.json")
SLF = os.path.join(BASE, "infobox_qid_sitelinks.json")

ORDER = ["en", "de", "fr", "es", "it", "pt", "ru", "pl", "nl", "sv",
         "uk", "ja", "zh", "ca", "id", "tr", "he", "ar", "ko", "vi"]

# Words communities use to mean "infobox". Used for the position-agnostic
# ceiling (R4) and to derive each wiki's own prefix rule (R2). Extend freely.
LEXEMES = {
    "en": ["infobox"], "de": ["infobox"], "fr": ["infobox"],
    "es": ["ficha", "infobox"], "it": ["infobox", "sinottico", "tmp"],
    "pt": ["info/", "infocaixa", "caixa de informação", "infobox"],
    "ru": ["карточка", "инфобокс", "infobox"],
    "pl": ["infoboks", "infobox"], "nl": ["infobox"],
    "sv": ["faktamall", "faktaruta", "infobox"],
    "uk": ["картка", "інфобокс", "infobox"], "ja": ["基礎情報", "infobox"],
    "zh": ["信息框", "infobox"], "ca": ["infotaula", "infobox"],
    "id": ["kotak info", "infobox"], "tr": ["bilgi kutusu", "infobox"],
    "he": ["מידע", "אינפובוקס", "infobox"],
    "ar": ["صندوق معلومات", "معلومات", "infobox"],
    "ko": ["정보상자", "정보", "infobox"], "vi": ["hộp thông tin", "infobox"],
}
# Names that would be a single catch-all infobox template rather than a family.
GENERIC = {
    "en": ["infobox"], "de": ["infobox"], "fr": ["infobox"],
    "es": ["ficha", "ficha de", "infobox"], "it": ["infobox"],
    "pt": ["infobox", "caixa de informação", "infocaixa"],
    "ru": ["карточка"], "pl": ["infobox"], "nl": ["infobox"], "sv": ["infobox"],
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


def pct(n, d):
    return round(100.0 * n / d, 1) if d else None


def main():
    raw = json.load(open(RAW))
    try:
        qid = json.load(open(SLF))["qid"]
    except Exception:
        qid = "Q6154820"

    results, not_measured = [], []
    for lang in ORDER:
        rec = raw.get(lang)
        if not rec or not rec.get("ok"):
            not_measured.append({"lang": lang,
                                 "category": (rec or {}).get("category"),
                                 "notes": (rec or {}).get("notes")})
            continue
        ns_name = rec.get("template_ns_name") or "Template"
        aliases = rec.get("template_ns_aliases", [])
        pairs = [(t, strip_ns(t, ns_name, aliases)) for t in rec["templates"]]
        total = len(pairs)

        r1 = [(t, s) for t, s in pairs if s.casefold().startswith("infobox")]
        lex = LEXEMES.get(lang, ["infobox"])
        r4 = [(t, s) for t, s in pairs
              if any(lx.casefold() in s.casefold() for lx in lex)]

        # dominant local word (may be the English one) and its position
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
        dom_share = (round(100.0 * lx_freq[dom] / total, 1)
                     if (dom and total) else None)

        # R2: most common leading token that is itself an infobox word
        pref_counter, pref_disp = Counter(), {}
        for _t, s in pairs:
            tok = lead_token(s)
            if any(lx.casefold() in tok.casefold() for lx in lex):
                pref_counter[tok.casefold()] += 1
                pref_disp.setdefault(tok.casefold(), tok)
        if pref_counter:
            k = pref_counter.most_common(1)[0][0]
            best_pref_word, best_pref_count = pref_disp[k], pref_counter[k]
        else:
            best_pref_word, best_pref_count = None, 0
        best_pref_share = round(100.0 * best_pref_count / total, 1) if total else None
        r3 = {t for t, _s in r1} | {t for t, s in pairs
                                    if best_pref_word and
                                    s.casefold().startswith(best_pref_word.casefold())}

        # most common other leading words (excluding the English pattern)
        cnt, disp = Counter(), {}
        for _t, s in pairs:
            tok = lead_token(s)
            if tok.casefold().startswith("infobox"):
                continue
            cnt[tok.casefold()] += 1
            disp.setdefault(tok.casefold(), tok)
        top_other = [{"word": disp[k], "count": c} for k, c in cnt.most_common(6)]

        # 3 verbatim example titles illustrating local naming
        if (pct(len(r1), total) or 0) >= 50:
            ex = [t for t, _s in sorted(r1, key=lambda x: (len(x[1]), x[1]))][:3]
        else:
            ex = []
            if top_other:
                word = top_other[0]["word"]
                ex += sorted([t for t, s in pairs if lead_token(s) == word])[:2]
            ex += sorted([t for t, s in pairs if s.casefold().startswith(
                best_pref_word.casefold()) and t not in ex])[:3 - len(ex)] \
                if best_pref_word else []
            if len(ex) < 3:
                ex += [t for t, _s in sorted(pairs, key=lambda x: (len(x[1]), x[1]))
                       if t not in ex][:3 - len(ex)]
        ex = ex[:3]

        gen = next((t for t, s in pairs
                    if s.casefold() in GENERIC.get(lang, ["infobox"])), None)

        results.append({
            "lang": lang,
            "site": lang + "wiki",
            "local_category": rec.get("category"),
            "local_category_exists": rec.get("category_exists"),
            "local_template_namespace": ns_name,
            "local_template_namespace_aliases": aliases,
            "templates_sampled": total,
            "R1_naive_infobox_prefix_count": len(r1),
            "R1_naive_infobox_prefix_pct": pct(len(r1), total),
            "R2_local_prefix_word": best_pref_word,
            "R2_local_prefix_count": best_pref_count,
            "R2_local_prefix_pct": best_pref_share,
            "R3_union_prefix_count": len(r3),
            "R3_union_prefix_pct": pct(len(r3), total),
            "R4_any_lexeme_count": len(r4),
            "R4_any_lexeme_pct": pct(len(r4), total),
            "local_infobox_words_tested": lex,
            "dominant_local_word": dom,
            "dominant_local_word_share_pct": dom_share,
            "dominant_local_word_prefix_count": dom_pre,
            "dominant_local_word_suffix_count": dom_suf,
            "distinct_leading_words": len(cnt),
            "top_other_leading_words": top_other,
            "generic_catchall_infobox_template": gen,
            "structure": ("single generic" if total <= 3 else "few"
                          if total <= 10 else "many (family of infoboxes)"),
            "example_titles": ex,
            "direct_subcat_count": rec.get("direct_subcat_count"),
            "subcats_sampled": len(rec.get("subcats", [])),
            "subcats_truncated": rec.get("subcats_truncated"),
            "top_pages_total": rec.get("top_pages_total"),
            "top_pages_truncated": rec.get("top_pages_truncated"),
            "failed_subcats": len(rec.get("failed_subcats", [])),
            "non_template_ns_members": rec.get("non_template_ns_members", {}),
            "notes": rec.get("notes", []),
        })

    tot = sum(r["templates_sampled"] for r in results)
    r1t = sum(r["R1_naive_infobox_prefix_count"] for r in results)
    r3t = sum(r["R3_union_prefix_count"] for r in results)
    r4t = sum(r["R4_any_lexeme_count"] for r in results)
    weak = [r["lang"] for r in results if (r["R1_naive_infobox_prefix_pct"] or 0) < 50]
    suffixy = [r["lang"] for r in results
               if r["dominant_local_word_prefix_count"] is not None
               and r["dominant_local_word_suffix_count"] > r["dominant_local_word_prefix_count"]]

    summary = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "user_agent": "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0",
        "wikidata_item": qid,
        "en_source_category": "Category:Infobox templates",
        "resolution": ("en.wikipedia action=query&prop=pageprops -> wikibase_item "
                       "-> wikidata wbgetentities&props=sitelinks -> localized "
                       "category title per edition"),
        "sampling": ("list=categorymembers of the localized category, ns 10 "
                     "(Template) only, for the category itself plus up to 30 of "
                     "its direct subcategories (depth<=2). Pages and subcategories "
                     "listed with separate cmtype calls so a large ns-10 listing "
                     "cannot hide subcategories."),
        "pattern_tested": "title after the local Template-namespace prefix starts with 'Infobox', case-insensitive",
        "editions_measured": len(results),
        "editions_targeted": len(ORDER),
        "editions_not_measured": not_measured,
        "templates_sampled_total": tot,
        "R1_naive_hits_total": r1t,
        "R1_naive_hit_share_pct": pct(r1t, tot),
        "R3_union_hits_total": r3t,
        "R3_union_hit_share_pct": pct(r3t, tot),
        "R4_any_lexeme_hits_total": r4t,
        "R4_any_lexeme_share_pct": pct(r4t, tot),
        "editions_where_naive_rule_catches_under_50pct": weak,
        "editions_whose_local_word_is_mostly_a_suffix": suffixy,
        "per_wiki": results,
    }
    json.dump(summary, open(os.path.join(BASE, "infobox-naming.json"), "w"),
              ensure_ascii=False, indent=1)

    # ------------------------------- markdown -------------------------------
    L = []
    L.append("# Localized infobox template naming across Wikipedia language editions\n")
    L.append(f"**Question:** can infobox templates be found by name pattern on each wiki, "
             f"or is a name-independent method needed?\n")
    L.append(f"- Wikidata item for en `Category:Infobox templates`: **{qid}** "
             f"(`prop=pageprops` → `wbgetentities&props=sitelinks`)")
    L.append(f"- Editions measured: **{len(results)}** of {len(ORDER)} targeted  •  "
             f"templates sampled (ns 10 only): **{tot}**")
    L.append(f"- **Naive English rule `^Infobox` (ci): {r1t} hits = "
             f"{summary['R1_naive_hit_share_pct']}%** of all sampled infobox templates")
    L.append(f"- Best per-wiki prefix rule (local ∪ English): {r3t} = "
             f"{summary['R3_union_hit_share_pct']}%")
    L.append(f"- Position-agnostic ceiling (name contains any local infobox word, "
             f"prefix or suffix): {r4t} = {summary['R4_any_lexeme_share_pct']}%")
    L.append(f"- Editions where the naive rule catches <50%: **{len(weak)}/20** "
             f"({', '.join(weak)})")
    L.append(f"- Editions whose own infobox word sits mostly at the *end* of the "
             f"title: **{', '.join(suffixy) or 'none'}**\n")
    L.append("Sampling: `list=categorymembers` on the Wikipedia-linked category, namespace 10 "
             "(Template) only, for the category plus up to 30 of its direct subcategories "
             "(depth ≤ 2). Pages and subcategories are listed with separate `cmtype` calls, so a "
             "large ns-10 listing (enwiki has >1500 direct templates) cannot hide subcategories. "
             "Module (828) / Help (12) / project (4) / article (0) members that some wikis file in "
             "the same category are excluded from the counts and reported in Table 4.\n")

    L.append("## Table 1 — how many infobox templates the naive English `^Infobox` rule catches\n")
    L.append("| wiki | template ns | local category | templates sampled | naive `^Infobox` hits | naive share | best local prefix rule | its share | where the local word sits | top other leading words |")
    L.append("|---|---|---|---:|---:|---:|---|---:|---|---|")
    for r in results:
        ow = ", ".join(f"`{d['word']}`×{d['count']}"
                       for d in r["top_other_leading_words"][:4]) or "—"
        cat = (r["local_category"] or "—").replace("|", "\\|")
        p1 = "n/a" if r["R1_naive_infobox_prefix_pct"] is None else f"{r['R1_naive_infobox_prefix_pct']}%"
        bp = (f"`{r['R2_local_prefix_word']}` ({r['R2_local_prefix_count']})"
              if r["R2_local_prefix_word"] else "— (no local prefix rule)")
        bps = "n/a" if r["R2_local_prefix_pct"] is None else f"{r['R2_local_prefix_pct']}%"
        pos = (f"`{r['dominant_local_word']}` in {r['dominant_local_word_share_pct']}% of "
               f"titles — prefix {r['dominant_local_word_prefix_count']} / "
               f"suffix {r['dominant_local_word_suffix_count']}")
        L.append(f"| **{r['lang']}** | `{r['local_template_namespace']}` | {cat} | "
                 f"{r['templates_sampled']} | {r['R1_naive_infobox_prefix_count']} | "
                 f"**{p1}** | {bp} | {bps} | {pos} | {ow} |")

    L.append("\n## Table 2 — 3 example localized infobox template titles per wiki (verbatim)\n")
    L.append("| wiki | template ns | example 1 | example 2 | example 3 |")
    L.append("|---|---|---|---|---|")
    for r in results:
        e = (r["example_titles"] + ["—", "—", "—"])[:3]
        L.append(f"| **{r['lang']}** | `{r['local_template_namespace']}` | " +
                 " | ".join(f"`{x}`" for x in e) + " |")

    L.append("\n## Table 3 — most common other leading words, and single-generic vs. many\n")
    L.append("| wiki | distinct non-`Infobox` leading words | top other leading words (count) | catch-all infobox template | structure |")
    L.append("|---|---:|---|---|---|")
    for r in results:
        ow = ", ".join(f"`{d['word']}` ×{d['count']}"
                       for d in r["top_other_leading_words"]) or "—"
        L.append(f"| **{r['lang']}** | {r['distinct_leading_words']} | {ow} | "
                 f"{r['generic_catchall_infobox_template'] or '—'} | {r['structure']} |")

    L.append("\n## Table 4 — coverage, truncation and rate-limit report\n")
    L.append("| wiki | direct subcats | subcats sampled | subcats truncated | top listing truncated (cap 3000) | failed subcats (after backoff) | non-ns10 members seen | notes |")
    L.append("|---|---:|---:|---|---:|---|---|---|")
    for r in results:
        ntm = "; ".join(f"ns{k}: `{v[0]}`"
                        for k, v in list(r["non_template_ns_members"].items())[:2]) or "—"
        L.append(f"| **{r['lang']}** | {r['direct_subcat_count']} | {r['subcats_sampled']} | "
                 f"{r['subcats_truncated']} | {r['top_pages_truncated']} | "
                 f"{r['failed_subcats']} | {ntm} | {'; '.join(r['notes']) or '—'} |")

    if not_measured:
        L.append("\n### Editions not measured\n")
        for r in not_measured:
            L.append(f"- **{r['lang']}** — {r['category']}: {r['notes']}")

    L.append("\n---\n")
    L.append("Source: MediaWiki Action API per edition + Wikidata API. User-Agent "
             "`HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0`; "
             "~1 s between requests; HTTP 429/503 retried with exponential backoff and counted, "
             "never treated as zero.\n")

    md = "\n".join(L) + "\n"
    open(os.path.join(BASE, "infobox-naming.md"), "w").write(md)
    print(md)
    print("wrote infobox-naming.json / infobox-naming.md")
    return summary


if __name__ == "__main__":
    main()
