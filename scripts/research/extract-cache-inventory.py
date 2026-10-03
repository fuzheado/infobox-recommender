#!/usr/bin/env python3
"""Extract the pre-existing analysis inventory from the server cache.

The cache stores every Wikimedia API response as SHA1(url).json. REST-summary
entries correspond to analysed articles, so grouping them by title gives the
analysis inventory with timestamps (file mtimes).
"""
import glob
import json
import os
import sys

CACHE = "/data/project/infobox-recommender/www/js/cache"
out = {}
files = glob.glob(os.path.join(CACHE, "*.json"))
for f in files:
    try:
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
    except Exception:
        continue
    if isinstance(d, dict) and d.get("type") in ("standard", "disambiguation") and d.get("title"):
        t = d["title"]
        mt = os.path.getmtime(f)
        rec = out.setdefault(t, {"title": t, "runs": [], "qid": None})
        rec["runs"].append(mt)

# group cache mtimes into "analysis runs" (an analysis writes many entries within
# a short window; the REST summary lands at analysis start). Collapse mtimes that
# are within 60s of each other.
rows = []
for t, rec in out.items():
    ts = sorted(rec["runs"])
    grouped = []
    for x in ts:
        if grouped and x - grouped[-1][-1] <= 60:
            grouped[-1].append(x)
        else:
            grouped.append([x])
    rows.append({"title": t, "first": ts[0], "last": ts[-1], "summary_entries": len(ts)})

rows.sort(key=lambda r: r["first"])
print(json.dumps({"cache_files": len(files), "articles": len(rows), "rows": rows}))
