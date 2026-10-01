#!/usr/bin/env python3
"""Step 4: independent cross-check of the naming patterns via CirrusSearch.

Run from the repository root (any time after step 1):
    INFOBOX_WORKDIR=. python3 scripts/research/infobox_step4_crosscheck.py

Writes infobox-crosscheck.json.

Steps 2-3 measure the *declared* infobox set - the members of each wiki's
Wikidata-linked "Infobox templates" category. This step asks a different
question against a different data source: across the wiki's **entire** Template
namespace (namespace 10), how many page titles contain the English word
"Infobox" versus the local word? `list=search` reads the CirrusSearch index, not
category membership, so agreement between the two methods is evidence the naming
pattern is a property of the wiki rather than of the category's membership.

The two denominators do differ and can disagree in direction (svwiki has more
`Infobox*` titles namespace-wide, but `Faktamall` leads inside its declared
infobox set); both numbers are reported and neither is treated as authoritative.
"""
import json, os, time, urllib.error, urllib.parse, urllib.request

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0"
BASE = os.environ.get("INFOBOX_WORKDIR", ".")
OUT = os.path.join(BASE, "infobox-crosscheck.json")
PAUSE = 0.6

# The local word each edition uses for "infobox" (the word searched, not a claim
# about position - the same word is a prefix on some wikis and a suffix on others).
MARKERS = {
    "en": "Infobox", "de": "Infobox", "fr": "Infobox", "es": "Ficha",
    "it": "sinottico", "pt": "Info/", "ru": "Карточка", "pl": "infobox",
    "nl": "Infobox", "sv": "Faktamall", "uk": "Картка", "ja": "基礎情報",
    "zh": "信息框", "ca": "Infotaula", "id": "Kotak info", "tr": "bilgi kutusu",
    "he": "מידע", "ar": "صندوق", "ko": "정보", "vi": "hộp thông tin",
}


def get(api, params, tries=6):
    params = dict(params, format="json", formatversion="2")
    url = api + "?" + urllib.parse.urlencode(params)
    delay = 2.0
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
            time.sleep(PAUSE)
            return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                print(f"    HTTP {e.code} -> backoff {delay}s", flush=True)
                time.sleep(delay); delay = min(delay * 2, 90); continue
            raise
        except Exception as e:
            print(f"    {type(e).__name__} -> backoff {delay}s", flush=True)
            time.sleep(delay); delay = min(delay * 2, 90)
    raise RuntimeError("giving up: " + url)


def title_hits(api, term):
    """Total ns-10 pages whose title contains `term` (CirrusSearch intitle:)."""
    d = get(api, {"action": "query", "list": "search",
                  "srsearch": f'intitle:"{term}"',
                  "srnamespace": "10", "srlimit": "1"})
    return d.get("query", {}).get("searchinfo", {}).get("totalhits")


def main():
    out = {}
    if os.path.exists(OUT):
        out = json.load(open(OUT))
    for lang, marker in MARKERS.items():
        if out.get(lang, {}).get("templates_with_local_marker_in_title") is not None:
            print(f"{lang:3} cached, skip", flush=True)
            continue
        api = f"https://{lang}.wikipedia.org/w/api.php"
        rec = {"lang": lang, "local_marker": marker}
        try:
            rec["templates_with_Infobox_in_title"] = title_hits(api, "Infobox")
            rec["templates_with_local_marker_in_title"] = title_hits(api, marker)
            print(f"{lang:3} Infobox-in-title={rec['templates_with_Infobox_in_title']:>7}  "
                  f"{marker!r}={rec['templates_with_local_marker_in_title']:>7}", flush=True)
        except Exception as e:
            rec["error"] = repr(e)[:200]
            print(f"{lang:3} FAILED: {e!r}", flush=True)
        out[lang] = rec
        json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    n_ok = sum(1 for v in out.values()
               if v.get("templates_with_local_marker_in_title") is not None)
    print(f"\nwikis_ok={n_ok}/{len(MARKERS)}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
