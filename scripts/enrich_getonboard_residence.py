#!/usr/bin/env python3
"""Extract the residence restriction GetOnBoard hides behind the Apply button.

A GetOnBoard posting can be marked "Remote" while still restricting WHERE the
candidate must live. The restriction is not in the search API payload (the
`location_tenants` ids have no public mapping) and only shows up on the job page
itself — as a `tooltipster` title on the Apply button, e.g.:

  "Position is 100% remote, but candidates must reside in Chile, Argentina,
   Peru or Colombia."          -> the user (Venezuela) CANNOT apply
  "Position is 100% remote, but candidates must reside in South America,
   Central America or Mexico." -> Venezuela IS included, but it is a zone
  "Candidates can reside anywhere in the world." -> no restriction

Classification (agreed with the user):
  pass  — "anywhere in the world", or the list/zone explicitly includes Venezuela
  flag  — a ZONE that includes Venezuela ("South America", "Latin America",
          "Central America and Mexico"): it passes on paper but may still fail in
          practice, so it is surfaced as a yellow flag, never a silent pass
  veto  — an explicit country list that excludes Venezuela

Results are written to the pool as `_residence` = {"status", "note"} and cached on
disk keyed by URL (a posting's restriction rarely changes).

Usage:
  python3 scripts/enrich_getonboard_residence.py <pool.json> [--limit N]

Options:
  --limit N    max postings to check per run (default 40)
  --refresh    ignore the disk cache and re-fetch
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
CACHE = SKILL / "state" / "getonboard-residence-cache.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# The Apply button carries the restriction as a tooltipster title.
TOOLTIP_RE = re.compile(r'title="([^"]*(?:reside|residency|must live)[^"]*)"', re.I)

ZONES = re.compile(r"south america|latin america|latam|américa latina|"
                   r"central america|america(?:s)?\b", re.I)
VENEZUELA = re.compile(r"venezuela", re.I)


def load_cache() -> dict:
    if CACHE.exists():
        try:
            return json.loads(CACHE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_cache(c: dict) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_page(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        final = r.geturl()
        html = r.read().decode("utf-8", errors="replace")
    # GetOnBoard 301-redirects to a category path; the body we read already
    # follows the redirect via geturl(), so the HTML above is the final page.
    if final != url and not html:
        raise RuntimeError("empty body after redirect")
    return html


def extract_note(html: str) -> str | None:
    hits = [m.strip() for m in TOOLTIP_RE.findall(html)]
    return hits[0] if hits else None


def classify(note: str) -> str:
    t = note.lower()
    if "anywhere in the world" in t:
        return "pass"
    if VENEZUELA.search(t):
        return "pass"
    if ZONES.search(t):
        # A zone that includes Venezuela ("South America", "LatAm") — passes on
        # paper; surfaced as a flag so the user decides.
        return "flag"
    # An explicit country list that does not name Venezuela, and is not a zone
    # that includes it: the Apply button would reject the user's country.
    return "veto"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pool")
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    pool = json.loads(Path(args.pool).read_text(encoding="utf-8"))
    cache = load_cache()

    targets = [j for j in pool if "getonbrd.com" in (j.get("url") or "")]
    checked = kept = 0
    counts = {"pass": 0, "flag": 0, "veto": 0, "none": 0}

    for j in targets[: args.limit]:
        url = j["url"]
        entry = cache.get(url) if not args.refresh else None
        if entry is None:
            try:
                html = fetch_page(url)
                note = extract_note(html)
                status = classify(note) if note else "none"
                entry = {"status": status, "note": note or ""}
                cache[url] = entry
                checked += 1
                time.sleep(0.4)
            except Exception as e:
                # Fetch failure: leave _residence unset so the scorer is unaffected.
                print(f"  ! {url}: {e}", file=sys.stderr)
                continue
        j["_residence"] = {"status": entry["status"], "note": entry["note"]}
        counts[entry["status"]] += 1
        if entry["status"] != "veto":
            kept += 1

    Path(args.pool).write_text(json.dumps(pool, ensure_ascii=False), encoding="utf-8")
    save_cache(cache)
    print(f"getonboard residence: checked {checked} cached {len(targets) - checked} | "
          f"pass {counts['pass']} · flag(zone) {counts['flag']} · "
          f"veto {counts['veto']} · no-restriction {counts['none']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
