#!/usr/bin/env python3
"""Sync the ranked shortlist into the Notion database Personal > Tracking Jobs.

The database is a WORKING SHORTLIST governed by the user's rule (2026-10-29):
  - A row the user marked 'Vista' is REVIEWED and DISPOSABLE: the next sync
    removes it (or replaces it if the same URL is re-ranked differently).
  - An UNMARKED row is live work: it is CONSERVED even when it ages out of the
    current pool — it stays on the board until the user marks it 'Vista'.
The sync is differential: it archives only the marked rows, updates scores for
unmarked rows still in the pool, adds new pool rows, and leaves unmarked rows
aged out of the pool untouched.

Usage:
  NOTION_DB_ID=... python3 scripts/notion_sync.py <scored.json> [--dry-run] [--keep]

Properties written (real Notion property names — see the skill's Notion notes):
  Name (title), Score (number), Role, Company, Location, Salary, Source (rich_text),
  Date (date), URL (url), Vetos (rich_text)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date

API = "https://api.notion.com/v1"
VERSION = "2022-06-28"
DB_ID = os.environ["NOTION_DB_ID"]  # set this to your database id — see docs/notion-sync-guide.md


def call(method: str, path: str, body: dict | None = None, key: str | None = None) -> dict:
    key = key or os.environ.get("NOTION_API_KEY")
    if not key:
        raise SystemExit("NOTION_API_KEY not set")
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"notion {method} {path} -> {e.code}: {e.read().decode()[:400]}", file=sys.stderr)
        raise


def read_rows(db_id: str) -> list[dict]:
    """Capture every existing row (page id + properties + Vista mark).

    The sync is differential, governed by the user's rule:
      - 'Vista' marked = reviewed = disposable → the row is archived on the next run.
      - Unmarked = live work → the row is CONSERVED even when it ages out of the
        current pool; it stays on the board until the user marks it 'Vista'.
    Rows are keyed by lowercased URL.
    """
    rows: list[dict] = []
    cursor = None
    while True:
        body: dict = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        res = call("POST", f"/databases/{db_id}/query", body)
        for p in res.get("results", []):
            props = p.get("properties", {})

            def rt(name: str) -> str:
                v = (props.get(name) or {}).get("rich_text") or []
                return "".join(x.get("plain_text", "") for x in v)

            date = (props.get("Date") or {}).get("date") or {}
            url = ((props.get("URL") or {}).get("url") or "").lower()
            rows.append({
                "id": p.get("id"),
                "name": "".join(x.get("plain_text", "") for x in (props.get("Name") or {}).get("title") or []),
                "score": (props.get("Score") or {}).get("number") or 0,
                "Role": rt("Role"),
                "Company": rt("Company"),
                "Location": rt("Location"),
                "Salary": rt("Salary"),
                "Source": rt("Source"),
                "Vetos": rt("Vetos"),
                "Date": date.get("start") or "",
                "URL": url,
                "vista": bool((props.get("Vista") or {}).get("checkbox")),
            })
        if not res.get("has_more"):
            break
        cursor = res.get("next_cursor")
    return rows


def add(db_id: str, row: dict, dry: bool) -> str:
    props = {
        "Name": {"title": [{"text": {"content": row["name"][:2000]}}]},
        "Score": {"number": row["score"]},
    }
    for k in ("Role", "Company", "Location", "Salary", "Source", "Vetos"):
        if row.get(k):
            props[k] = {"rich_text": [{"text": {"content": str(row[k])[:2000]}}]}
    if row.get("Date"):
        props["Date"] = {"date": {"start": str(row["Date"])}}
    if row.get("URL"):
        props["URL"] = {"url": row["URL"]}

    if dry:
        return "(dry-run)"
    res = call("POST", "/pages", {"parent": {"database_id": db_id}, "properties": props})
    return res.get("id") or "?"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scored", help="JSON from scripts/score_pool.py")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--keep", action="store_true", help="do not archive any existing rows (new pool rows already present are skipped)")
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()

    data = json.load(open(args.scored, encoding="utf-8"))
    kept = data["kept"][: args.top]

    # source label from the URL's host
    def source(url: str) -> str:
        # Case-insensitive: RemoteOK's own URLs are `remoteOK.com`, and a
        # case-sensitive match silently labelled every one of them "other".
        u = (url or "").lower()
        for name, dom in (("LinkedIn", "linkedin.com"), ("GetOnBoard", "getonbrd.com"),
                          ("RemoteOK", "remoteok.com"), ("WWR", "weworkremotely.com")):
            if dom in u:
                return name
        return "other"

    rows = []
    for i, j in enumerate(kept, 1):
        # LinkedIn's card location is a city even for remote-first roles (the remote
        # status lives in the posting body, not the card). Normalise it so the DB
        # never shows a city for a job that was confirmed remote.
        loc = (j.get("location") or "").strip()
        if j.get("_remote") is True and "remote" not in loc.lower():
            loc = f"Remote ({loc})" if loc else "Remote"
        rows.append({
            "name": f"{j.get('title','').strip()} — {j.get('company','').strip()}" or f"#{i}",
            "score": j.get("_score", 0),
            "Role": j.get("title", "").strip(),
            "Company": j.get("company", "").strip(),
            "Location": loc,
            "Salary": j.get("salary") or "",
            "Source": source(j.get("url", "")),
            "Date": (j.get("date") or "")[:10],
            "URL": j.get("url", ""),
            "Vetos": "",
        })

    old_rows = []
    # Read is side-effect free: even a dry-run previews the differential actions.
    old_rows = read_rows(DB_ID)

    # The user's rule: 'Vista' marked = reviewed = disposable (removed/replaced);
    # unmarked = live work = conserved even when aged out of the pool.
    vista_urls = {r["URL"] for r in old_rows if r["vista"] and r["URL"]}
    keep_urls = {r["URL"]: r for r in old_rows if not r["vista"] and r["URL"]}

    # 1. Archive every marked row — it is reviewed and leaves the board.
    archived = 0
    if not args.dry_run and not args.keep:
        for r in old_rows:
            if r["vista"]:
                call("PATCH", f"/pages/{r['id']}", {"archived": True})
                archived += 1
    elif not args.dry_run:
        print("--keep: no rows archived")

    # 2. Write the new pool differentially.
    added = updated = skipped_seen = 0
    for r in rows:
        u = (r.get("URL") or "").lower()
        if u and u in vista_urls:
            skipped_seen += 1          # already reviewed: it stays reviewed
            continue
        if u and u in keep_urls:
            # conserved row still in the pool: refresh its score, stay unmarked
            if not args.dry_run:
                call("PATCH", f"/pages/{keep_urls[u]['id']}",
                     {"properties": {"Score": {"number": r["score"]}}})
            updated += 1
            continue
        add(DB_ID, r, args.dry_run)
        added += 1

    conserved = len([r for r in old_rows if not r["vista"]])
    print(f"{'(dry-run) ' if args.dry_run else ''}"
          f"archived {archived} 'Vista' rows | added {added} | score-updated {updated} | "
          f"conserved {conserved} unmarked | skipped {skipped_seen} already-seen")
    print(f"https://www.notion.com/{DB_ID.replace('-', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
