#!/usr/bin/env python3
"""Step 2: harvest infobox template names for each target Wikipedia edition.

Run from the repository root (after step 1):
    INFOBOX_WORKDIR=. python3 scripts/research/infobox_step2_harvest.py

Reads  infobox_qid_sitelinks.json  ->  writes infobox_raw.json
(resumable: wikis already marked ok are skipped, the file is rewritten after
every wiki, and a wiki that still fails after retries is marked explicitly
rather than reported as zero).

Design notes:
  * pages and subcategories are listed with SEPARATE cmtype calls, so a large
    ns-10 listing (enwiki's category has >1500 direct templates) can never hide
    the subcategory list the way a single combined listing would;
  * only namespace 10 (Template) members count as templates; Module (828),
    Help (12), project (4) and article (0) pages that some wikis file in the
    same category are recorded separately;
  * stdlib only, descriptive User-Agent, ~1s pacing, HTTP 429/503 retried with
    exponential backoff.
"""
import json, os, time, urllib.error, urllib.parse, urllib.request

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0"
BASE = os.environ.get("INFOBOX_WORKDIR", ".")
OUT = os.path.join(BASE, "infobox_raw.json")
SL = os.path.join(BASE, "infobox_qid_sitelinks.json")

TARGETS = ["en", "de", "fr", "es", "it", "pt", "ru", "pl", "nl", "sv",
           "uk", "ja", "zh", "ca", "id", "tr", "he", "ar", "ko", "vi"]
MAX_SUBCATS = 30
CAP_TOP = 3000
PAUSE = 1.0
STATS = {"calls": 0, "throttles": 0, "failed_requests": []}


def get(api, params, tries=8):
    params = dict(params, format="json", formatversion="2")
    url = api + "?" + urllib.parse.urlencode(params)
    delay = 2.0
    for _ in range(tries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
            STATS["calls"] += 1
            time.sleep(PAUSE)
            return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                STATS["throttles"] += 1
                print(f"    HTTP {e.code} -> backoff {delay}s", flush=True)
                time.sleep(delay); delay = min(delay * 2, 120); continue
            raise
        except Exception as e:
            STATS["failed_requests"].append(f"{type(e).__name__}:{e}")
            print(f"    {type(e).__name__}: {e} -> retry {delay}s", flush=True)
            time.sleep(delay); delay = min(delay * 2, 120)
    raise RuntimeError("giving up: " + url)


def listing(api, cat, cmtype, cap):
    """Paginate list=categorymembers for one category. Returns (members, complete)."""
    out, cont, complete = [], {}, False
    while True:
        p = {"action": "query", "list": "categorymembers", "cmtitle": cat,
             "cmtype": cmtype, "cmlimit": "500"}
        p.update(cont)
        d = get(api, p)
        out += d.get("query", {}).get("categorymembers", [])
        if "continue" in d:
            cont = d["continue"]
        else:
            complete = True
            break
        if len(out) >= cap:
            break
    return out, complete


def harvest(lang, sitelinks):
    api = f"https://{lang}.wikipedia.org/w/api.php"
    cat = sitelinks.get(lang + "wiki", {}).get("title")
    rec = {"lang": lang, "api": api, "category": cat, "notes": [], "ok": False,
           "templates": []}
    if not cat:
        rec["notes"].append("NO Wikidata sitelink for the local category -> NOT MEASURED")
        return rec

    si = get(api, {"action": "query", "meta": "siteinfo",
                   "siprop": "namespaces|namespacealiases"})
    n10 = si["query"]["namespaces"].get("10", {})
    rec["template_ns_name"] = n10.get("name") or n10.get("*")
    rec["template_ns_aliases"] = [a["alias"] for a in
                                 si["query"].get("namespacealiases", [])
                                 if a.get("id") == 10]
    rec["content_language"] = si["query"].get("general", {}).get("lang")

    info = get(api, {"action": "query", "prop": "categoryinfo", "titles": cat})
    pg = info["query"]["pages"][0]
    rec["category_exists"] = not pg.get("missing", False)
    rec["categoryinfo"] = pg.get("categoryinfo", {})

    top, top_complete = listing(api, cat, "page", CAP_TOP)
    rec["top_pages_complete"] = top_complete
    rec["top_pages_total"] = len(top)
    rec["top_pages_truncated"] = not top_complete

    subs, subs_complete = listing(api, cat, "subcat", 500)
    names = [s["title"] for s in subs]
    rec["direct_subcat_count"] = len(names)
    rec["direct_subcat_listing_complete"] = subs_complete
    rec["subcats"] = names[:MAX_SUBCATS]
    rec["subcats_truncated"] = len(names) > MAX_SUBCATS

    ns_hist, other_ns = {}, {}
    for m in top:
        ns_hist[str(m["ns"])] = ns_hist.get(str(m["ns"]), 0) + 1
        if m["ns"] not in (10, 14):
            other_ns.setdefault(str(m["ns"]), [])
            if len(other_ns[str(m["ns"])]) < 6:
                other_ns[str(m["ns"])].append(m["title"])
    rec["top_ns_histogram"] = ns_hist

    templates = {m["title"] for m in top if m["ns"] == 10}
    counts, failed = {}, []
    for sc in rec["subcats"]:
        try:
            mem, _ = listing(api, sc, "page", 500)
            t10 = [m["title"] for m in mem if m["ns"] == 10]
            counts[sc] = len(t10)
            templates |= set(t10)
            for m in mem:
                if m["ns"] not in (10, 14):
                    other_ns.setdefault(str(m["ns"]), [])
                    if len(other_ns[str(m["ns"])]) < 6:
                        other_ns[str(m["ns"])].append(m["title"])
        except Exception as e:
            failed.append({"subcat": sc, "error": repr(e)[:160]})
            print(f"    subcat FAILED: {sc}", flush=True)
    if failed:
        rec["failed_subcats"] = failed
        rec["notes"].append(f"{len(failed)} subcategories FAILED after backoff "
                            f"(rate limit); excluded, not counted as zero")
    rec["subcat_member_counts"] = counts
    rec["non_template_ns_members"] = other_ns
    rec["templates"] = sorted(templates)
    rec["sampled_count"] = len(templates)
    rec["ok"] = len(templates) > 0
    return rec


def main():
    sitelinks = json.load(open(SL))["sitelinks"]
    raw = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for lang in TARGETS:
        if raw.get(lang, {}).get("ok"):
            print(f"=== {lang} === cached ok, skip", flush=True)
            continue
        print(f"=== {lang} ===", flush=True)
        try:
            rec = harvest(lang, sitelinks)
            print(f"  ns10={rec['sampled_count']} top_pages={rec.get('top_pages_total')} "
                  f"(trunc={rec.get('top_pages_truncated')}) "
                  f"direct_subcats={rec.get('direct_subcat_count')} "
                  f"sampled_subcats={len(rec.get('subcats', []))} "
                  f"failed_subcats={len(rec.get('failed_subcats', []))}", flush=True)
        except Exception as e:
            rec = {"lang": lang, "ok": False, "templates": [],
                   "notes": [f"HARVEST FAILED (not measured): {e!r}"]}
            print(f"  FAILED {lang}: {e!r}", flush=True)
        raw[lang] = rec
        json.dump(raw, open(OUT, "w"), ensure_ascii=False, indent=1)
    n_ok = sum(1 for r in raw.values() if r.get("ok"))
    print(f"\ncalls={STATS['calls']} throttles={STATS['throttles']} "
          f"wikis_ok={n_ok}/{len(TARGETS)}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
