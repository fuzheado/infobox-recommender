#!/usr/bin/env python3
"""Step 1: get the Wikidata QID for en Category:Infobox templates,
then the localized category title per wiki via sitelinks.

Run from the repository root:
    python3 scripts/research/infobox_step1_sitelinks.py
Writes infobox_qid_sitelinks.json into INFOBOX_WORKDIR (default: cwd).
"""
import json, os, time, urllib.parse, urllib.request, sys

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) InfoboxNaming/1.0"
BASE = os.environ.get("INFOBOX_WORKDIR", ".")

def get(api, params, tries=5):
    params = dict(params, format="json", formatversion="2")
    url = api + "?" + urllib.parse.urlencode(params)
    delay = 2.0
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                body = resp.read()
            return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  429 rate-limited on {api}, backing off {delay}s", flush=True)
                time.sleep(delay); delay *= 2; continue
            raise
        except Exception as e:
            print(f"  err {e!r}, retry in {delay}s", flush=True)
            time.sleep(delay); delay *= 2
    raise RuntimeError("failed after retries: " + url)

EN = "https://en.wikipedia.org/w/api.php"
WD = "https://www.wikidata.org/w/api.php"

d = get(EN, {"action": "query", "prop": "pageprops",
             "titles": "Category:Infobox templates"})
page = d["query"]["pages"][0]
qid = page.get("pageprops", {}).get("wikibase_item")
print("en Category:Infobox templates -> wikibase_item:", qid)
print("pageid:", page.get("pageid"), "missing:", page.get("missing"), "ns:", page.get("ns"))
time.sleep(0.3)

if not qid:
    print("no wikibase item; aborting")
    sys.exit(1)

d2 = get(WD, {"action": "wbgetentities", "ids": qid, "props": "sitelinks|labels|descriptions"})
ent = d2["entities"][qid]
print("labels:", json.dumps(ent.get("labels", {}), ensure_ascii=False)[:600])
print("descriptions:", json.dumps(ent.get("descriptions", {}), ensure_ascii=False)[:400])
sitelinks = ent.get("sitelinks", {})
print("sitelinks count:", len(sitelinks))

cats = {}
for site, info in sitelinks.items():
    if site.endswith("wiki") or site.endswith("wiktionary"):
        cats[site] = info["title"]
print(json.dumps(cats, ensure_ascii=False, indent=1, sort_keys=True))

out = {"qid": qid, "sitelinks": sitelinks}
with open(os.path.join(BASE, "infobox_qid_sitelinks.json"), "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\nwrote infobox_qid_sitelinks.json")
