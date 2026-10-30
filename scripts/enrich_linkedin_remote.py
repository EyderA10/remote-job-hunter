#!/usr/bin/env python3
"""Confirm whether LinkedIn postings are actually remote, and optionally filter for Easy Apply.

LinkedIn's public `jobs-guest` endpoint cannot filter by workplace type: it ignores
both `location` and `f_WT`, and the card's `location` field is a city — a posting
located "Boise, ID" can still be remote-first, as the description reveals. So the
only reliable way to apply the user's remote-only requirement to LinkedIn results is
to fetch each posting's detail and read its own description.

Usage:
  python3 scripts/enrich_linkedin_remote.py <pool.json> [--out pool.json] [--limit N]

Options:
  --apply-filter    Keep only postings that have "Easy Apply" button
  --include-apply   Add _easy_apply flag to ALL postings (default: keep all, just mark)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
CLI = SKILL / "portals" / "linkedin-search" / "cli" / "src" / "cli.ts"
CACHE = SKILL / "state" / "linkedin-remote-cache.json"

# Phrases that mean the role can actually be done remotely. Ordered strongest first.
REMOTE_SIGNALS = [
    "remote-first", "remote first", "fully remote", "100% remote", "fully-remote",
    "work from anywhere", "anywhere in the world", "anywhere in the", "worldwide remote",
    "remote ok", "remote-friendly", "remote friendly", "remote-only", "remote only",
    "work remotely", "remote position", "remote role", "remote work", "telecommute",
    "virtual role", "distributed team",
]
# Phrases that mean it is NOT remote. Checked first so they win.
NON_REMOTE_SIGNALS = [
    "on-site", "onsite", "on site", "in-office", "in office", "office-based",
    "hybrid (", "hybrid role", "must be on", "required to work from",
]

# Phrases that indicate Easy Apply (English + patterns in other languages)
EASY_APPLY_SIGNALS = [
    "easy apply", "aplicar fácil", "apply easily", "facile à postuler",
    "apply with one click", "one-click apply", "apply directly",
    "apply without interruption", "no separate application",
]


def is_remote(text: str) -> tuple[bool, str]:
    t = (text or "").lower()
    if not t.strip():
        return False, "no description"
    for s in NON_REMOTE_SIGNALS:
        if s in t:
            return False, f"explicit non-remote: {s!r}"
    for s in REMOTE_SIGNALS:
        if s in t:
            return True, f"signal: {s!r}"
    return False, "no remote signal in description"


def is_easy_apply(text: str) -> bool:
    """Detect if a posting has 'Easy Apply' button/CTA."""
    t = (text or "").lower()
    if not t:
        return False
    for s in EASY_APPLY_SIGNALS:
        if s in t:
            return True
    # LinkedIn also includes specific phrases:
    if "easy apply button" in t:
        return True
    if "one click apply" in t:
        return True
    return False


def load_cache() -> dict:
    if CACHE.exists():
        try:
            return json.loads(CACHE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_cache(c: dict) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(c, indent=2, ensure_ascii=False), encoding="utf-8")


def fetch(job_id: str) -> dict | None:
    """Run the LinkedIn CLI detail command and return the description and HTML.

    We need both description (for remote signal) and raw HTML (for Easy Apply detection).
    """
    try:
        r = subprocess.run(
            ["bun", "run", str(CLI), "detail", job_id, "--format", "json"],
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode != 0:
            return None
        d = json.loads(r.stdout)
        # The detail page includes hasEasyApply for Easy Apply detection
        return {
            "description": (d.get("description") or "").strip(),
            "hasEasyApply": d.get("hasEasyApply", False),
        }
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pool")
    ap.add_argument("--out", default=None)
    ap.add_argument("--limit", type=int, default=60, help="max LinkedIn jobs to check")
    ap.add_argument("--apply-filter", action="store_true",
                    help="keep only postings with Easy Apply")
    ap.add_argument("--include-apply", action="store_true", default=True,
                    help="add _easy_apply flag (default: on)")
    args = ap.parse_args()

    pool = json.load(open(args.pool, encoding="utf-8"))
    cache = load_cache()

    linkedin = [j for j in pool if "linkedin.com" in (j.get("url") or "")]
    checked = 0
    remote_n = 0
    apply_n = 0
    to_remove = []  # URLs to remove if --apply-filter is set

    for j in linkedin[: args.limit]:
        # LinkedIn job URLs end with the numeric ID inside the slug:
        #   .../view/senior-software-engineer-at-rapsys-4482940290
        m = re.search(r"(\d{6,})", (j.get("url") or "").rstrip("/"))
        job_id = m.group(1) if m else ""
        if not job_id:
            continue
        if job_id in cache and "hasEasyApply" in cache[job_id]:
            data = cache[job_id]
        else:
            # fresh fetch (or cached entry predating hasEasyApply - refetch it)
            data = fetch(job_id)
            if data is None:
                continue
            cache[job_id] = data
            checked += 1
            time.sleep(0.6)  # LinkedIn rate-limits aggressively; keep volume low

        desc = data.get("description", "")
        has_easy_apply = data.get("hasEasyApply", False)

        # Remote check
        ok, note = is_remote(desc)
        j["_remote"] = ok
        j["_remote_note"] = note
        if ok:
            remote_n += 1

        # Easy Apply flag
        if args.include_apply:
            j["_easy_apply"] = has_easy_apply
            if has_easy_apply:
                apply_n += 1

        # Keep description for scorer
        if desc.strip():
            j["_description"] = desc

    save_cache(cache)

    # Export summary
    out = args.out or args.pool
    json.dump(pool, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"linkedin checked: {checked} new / {len(linkedin)} total | remote: {remote_n} | easy-apply: {apply_n}")
    if args.apply_filter:
        print(f"WARNING: --apply-filter requires post-enrichment filtering in score_pool.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())