#!/usr/bin/env python3
"""Classify residence restrictions for WeWorkRemotely postings.

WWR tags each posting with a REGION in the RSS feed, e.g.:

  "Anywhere in the World"   -> no restriction
  "Americas Only"           -> zone that includes Venezuela (flag)
  "North America Only"      -> Venezuela NOT included (veto)
  "USA Only" / "Europe Only" / "EMEA Only" -> veto

Unlike GetOnBoard, WWR publishes the region in the feed itself, so no page
fetch is needed — classification is instant and needs no cache.

Results are written to the pool as `_residence` = {"status", "note"}; the
scorer (score_pool.py) turns a veto into `residence_not_allowed` and a flag
into a surfaced yellow flag.

Usage:
  python3 scripts/enrich_wwr_residence.py <pool.json>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Zones that include Venezuela: pass on paper, flagged for the user.
ZONES = re.compile(r"americas|latin america|latam|south america", re.I)
VETOED = re.compile(
    r"north america only|usa only|us only|united states|europe only|"
    r"emea|apac|oceania|asia|africa|canada only|uk only|"
    r"canada\b|united kingdom|germany|spain only|france",
    re.I,
)


def classify(region: str) -> str:
    t = (region or "").lower()
    if "anywhere in the world" in t or "anywhere" in t:
        return "pass"
    if "venezuela" in t:
        return "pass"
    if ZONES.search(t):
        return "flag"
    if VETOED.search(t):
        return "veto"
    # Unknown region: never silently pass — surface it.
    return "flag"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pool")
    args = ap.parse_args()

    pool = json.loads(Path(args.pool).read_text(encoding="utf-8"))
    targets = [j for j in pool if "weworkremotely.com" in (j.get("url") or "")]
    counts = {"pass": 0, "flag": 0, "veto": 0, "none": 0}

    for j in targets:
        region = (j.get("region") or j.get("location") or "").strip()
        if not region:
            counts["none"] += 1
            continue
        status = classify(region)
        j["_residence"] = {"status": status, "note": region}
        counts[status] += 1

    Path(args.pool).write_text(json.dumps(pool, ensure_ascii=False), encoding="utf-8")
    print(f"wwr residence: {len(targets)} postings | "
          f"pass {counts['pass']} · flag(zone) {counts['flag']} · "
          f"veto {counts['veto']} · no-region {counts['none']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
