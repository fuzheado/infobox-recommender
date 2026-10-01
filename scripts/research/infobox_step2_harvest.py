#!/usr/bin/env python3
"""Step 2 (v3 - final): per-wiki harvest of infobox template names.

Fixes vs v2: keeps the namespace of every category member (so Template ns 10 is
measured cleanly and Module/Help leakage is reported separately), continues
past the 500-per-call cap, 15 subcategories max, 1.0s pacing.
"""
import json, os, time, urllib.error, urllib.parse, urllib.request

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0"
BASE = os.environ.get("INFOBOX_WORKDIR", ".")
OUT = os.path.join(BASE, "infobox_raw.json")
SL = os.path.join(BASE, "infobox_qid_sitelinks.json")

TARGETS = ["en", "de", "fr", "es", "it", "pt", "ru", "pl", "nl", "sv",
           "uk", "ja", "zh", "ca", "id", "tr", "he", "ar", "ko", "vi"]
MAX_SUBCATS = 30
CAP_TOP = 1500
PAUSE = 1.0
STATS = {"calls": 0, "throttles": 0, "hard_fail": []}


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
                print(f"    HTTP {e.code} on {api} -> backoff {delay}s", flush=True)
                time.sleep(delay); delay = min(delay * 2, 120); continue
            raise
        except Exception as e:
            print(f"    {type(e).__name__}: {e} -> retry in {delay}s", flush=True)
            time.sleep(delay); delay = min(delay * 2, 120)
    raise RuntimeError("giving up: " + url)


def members(api, cat, cap):
    """Return (list of (title, ns), complete)."""
    out, cont, complete = [], {}, False
    while True:
        p = {"action": "query", "list": "categorymembers", "cmtitle": cat,
             "cmtype": "page|subcat", "cmlimit": "500"}
        p.update(cont)
        d = get(api, p)
        for m in d.get("query", {}).get("categorymembers", []):
            out.append((m["title"], m["ns"]))
        if "continue" in d:
            cont = d["continue"]
        else:
            complete = True
            break
        if len(out) >= cap:
            break
    return out, complete


def harvest_wiki(lang, sl):
    api = f"https://{lang}.wikipedia.org/w/api.php"
    cat_title = sl.get(lang + "wiki", {}).get("title")
    rec = {"lang": lang, "notes": [], "category": cat_title}
    if not cat_title:
        rec["notes"].append("no Wikidata sitelink for local category -> NOT MEASURED")
        return rec

    si = get(api, {"action": "query", "meta": "siteinfo",
                   "siprop": "namespaces|namespacealiases"})
    n10 = si["query"]["namespaces"].get("10", {})
    rec["template_ns_name"] = n10.get("name") or n10.get("*")
    rec["template_ns_aliases"] = [a["alias"] for a in
                                 si["query"].get("namespacealiases", [])
                                 if a.get("id") == 10]
    rec["content_language"] = si["query"].get("general", {}).get("lang")

    info = get(api, {"action": "query", "prop": "categoryinfo", "titles": cat_title})
    pg = info["query"]["pages"][0]
    rec["category_exists"] = not pg.get("missing", False)
    rec["categoryinfo"] = pg.get("categoryinfo", {})

    top, top_complete = members(api, cat_title, CAP_TOP)
    rec["top_complete"] = top_complete
    rec["top_members_total"] = len(top)

    by_ns = {}
    for t, ns in top:
        by_ns.setdefault(ns, []).append(t)
    rec["top_ns_histogram"] = {str(k): len(v) for k, v in sorted(by_ns.items())}
    subs = [t for t, ns in top if ns == 14]
    rec["subcat_count"] = len(subs)
    rec["subcats"] = subs[:MAX_SUBCATS]
    rec["subcats_truncated"] = len(subs) > MAX_SUBCATS

    templates = set(by_ns.get(10, []))
    other_ns = {}
    for ns, ts in by_ns.items():
        if ns not in (10, 14):
            other_ns[str(ns)] = sorted(ts)[:8]
    rec["subcat_member_counts"] = {}
    failed = []
    for sc in rec["subcats"]:
        try:
            mem, _ = members(api, sc, 500)
            t10 = [t for t, ns in mem if ns == 10]
            rec["subcat_member_counts"][sc] = len(t10)
            templates |= set(t10)
            for t, ns in mem:
                if ns not in (10, 14):
                    other_ns.setdefault(str(ns), [])
                    if len(other_ns[str(ns)]) < 8 and t not in other_ns[str(ns)]:
                        other_ns[str(ns)].append(t)
        except Exception as e:
            failed.append({"subcat": sc, "error": repr(e)[:160]})
            print(f"    subcat FAILED: {sc}", flush=True)
    if failed:
        rec["failed_subcats"] = failed
        rec["notes"].append(f"{len(failed)} subcategories failed after retries (rate limit)")
    rec["non_template_ns_members"] = other_ns
    rec["templates"] = sorted(templates)
    rec["sampled_count"] = len(templates)
    rec["ok"] = len(templates) > 0
    return rec


def main():
    sl = json.load(open(SL))["sitelinks"]
    raw = json.load(open(OUT)) if os.path.exists(OUT) else {}
    for lang in TARGETS:
        print(f"\n=== {lang} ===", flush=True)
        try:
            rec = harvest_wiki(lang, sl)
            print(f"  templates(ns10)={rec.get('sampled_count')} "
                  f"top_total={rec.get('top_members_total')} "
                  f"byNs={rec.get('top_ns_histogram')} "
                  f"subcats={rec.get('subcat_count')} "
                  f"failed={len(rec.get('failed_subcats', []))}", flush=True)
        except Exception as e:
            rec = raw.get(lang, {"lang": lang, "templates": [], "notes": []})
            rec.setdefault("notes", []).append(f"harvest failed: {e!r}")
            rec["ok"] = False
            STATS["hard_fail"].append(lang)
            print(f"  FAILED {lang}: {e!r}", flush=True)
        raw[lang] = rec
        json.dump(raw, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"\ncalls={STATS['calls']} throttles={STATS['throttles']} "
          f"hard_fail={STATS['hard_fail']}")


if __name__ == "__main__":
    main()
