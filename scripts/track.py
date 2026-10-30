#!/usr/bin/env python3
"""Application tracker — implements the Tracker status vocabulary from
references/apply-workflow.md Step 6b and references/outcome-workflow.md Step 1.

Usage:
  track.py add --company X --role Y [--sector S] [--role-type T] [--channel C]
               [--fit N] [--cv-file P] [--cover-file P] [--source URL]
               [--deadline YYYY-MM-DD] [--contact NAME]
  track.py set-status --company X --role Y --status interviewing [--note TEXT]
  track.py list [--status interviewing]
  track.py show

Rules this enforces (do not reimplement them elsewhere):
  * header is date,company,sector,role,role_type,channel,status,contact_person,
    fit_rating,notes,cv_file,cover_letter_file,source,deadline
  * match existing rows case-insensitively on company+role; an OPEN row is
    updated, a FINAL row is never overwritten (a new row is appended alongside)
  * status is one of the vocabulary below
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import date
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TRACKER = SKILL_DIR / "state" / "job_search_tracker.csv"

HEADER = [
    "date", "company", "sector", "role", "role_type", "channel", "status",
    "contact_person", "fit_rating", "notes", "cv_file", "cover_letter_file",
    "source", "deadline",
]

# Legacy spellings still count as final.
FINAL = {"rejected", "no response", "offer declined", "withdrawn", "hired", "ghosted", "closed"}
OPEN = {"drafted", "applied", "interviewing", "offer"}
VOCAB = sorted(OPEN | FINAL)


def read_rows() -> list[dict]:
    if not TRACKER.exists():
        return []
    with TRACKER.open(newline="", encoding="utf-8") as fh:
        return [r for r in csv.DictReader(fh) if any((v or "").strip() for v in r.values())]


def write_rows(rows: list[dict]) -> None:
    TRACKER.parent.mkdir(parents=True, exist_ok=True)
    with TRACKER.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: (r.get(k) or "") for k in HEADER})


def find(rows: list[dict], company: str, role: str) -> list[dict]:
    c, r = company.strip().lower(), role.strip().lower()
    return [x for x in rows if (x.get("company") or "").strip().lower() == c
            and (x.get("role") or "").strip().lower() == r]


def cmd_add(a: argparse.Namespace) -> int:
    rows = read_rows()
    matches = find(rows, a.company, a.role)
    open_matches = [m for m in matches if (m.get("status") or "") in OPEN]

    fields = {
        "date": date.today().isoformat(),
        "company": a.company,
        "sector": a.sector or "",
        "role": a.role,
        "role_type": a.role_type or "",
        "channel": a.channel or "",
        "status": "drafted",
        "contact_person": a.contact or "",
        "fit_rating": str(a.fit if a.fit is not None else ""),
        "notes": "",
        "cv_file": a.cv_file or "",
        "cover_letter_file": a.cover_file or "",
        "source": a.source or "",
        "deadline": a.deadline or "",
    }

    if open_matches:
        # Update the open row; never move it backwards.
        m = open_matches[0]
        for k in ("cv_file", "cover_letter_file", "fit_rating", "source"):
            if fields[k]:
                m[k] = fields[k]
        # Absence is not a correction: keep an existing deadline when none is given.
        if fields["deadline"]:
            m["deadline"] = fields["deadline"]
        if a.sector:
            m["sector"] = a.sector
        m["notes"] = (m.get("notes") or "") + ("; " if m.get("notes") else "") + "redrafted"
        write_rows(rows)
        print(f"updated open row: {a.company} / {a.role} (status {m.get('status')})")
        if len(matches) > len(open_matches):
            print("note: a final row for this company+role already exists; it was left alone")
        return 0

    rows.append(fields)
    write_rows(rows)
    if matches:
        print(f"appended new row alongside {len(matches)} final row(s): {a.company} / {a.role}")
    else:
        print(f"appended: {a.company} / {a.role}")
    return 0


def cmd_set_status(a: argparse.Namespace) -> int:
    status = a.status.lower()
    if status not in VOCAB:
        print(f"error: '{a.status}' is not in the status vocabulary: {', '.join(VOCAB)}", file=sys.stderr)
        return 2
    rows = read_rows()
    matches = find(rows, a.company, a.role)
    if not matches:
        print(f"error: no tracker row for {a.company} / {a.role}", file=sys.stderr)
        return 1
    m = matches[0]
    m["status"] = status
    if a.note:
        stamp = date.today().isoformat()
        m["notes"] = (m.get("notes") or "") + ("; " if m.get("notes") else "") + f"{stamp}: {a.note}"
    write_rows(rows)
    print(f"{a.company} / {a.role}: status -> {status}")
    return 0


def cmd_clear(a: argparse.Namespace) -> int:
    if not a.yes:
        n = len(read_rows())
        print(f"this deletes all {n} row(s) from {TRACKER}", file=sys.stderr)
        print("re-run with --yes to confirm", file=sys.stderr)
        return 2
    write_rows([])
    print(f"tracker cleared: {TRACKER}")
    return 0


def cmd_list(a: argparse.Namespace) -> int:
    rows = read_rows()
    if a.status:
        rows = [r for r in rows if (r.get("status") or "") == a.status]
    if not rows:
        print("no rows")
        return 0
    for r in rows:
        print(f"{r.get('date')} | {r.get('company')} | {r.get('role')} | {r.get('status')} | fit {r.get('fit_rating') or '-'}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("add")
    p.add_argument("--company", required=True)
    p.add_argument("--role", required=True)
    p.add_argument("--sector"); p.add_argument("--role-type"); p.add_argument("--channel")
    p.add_argument("--fit", type=int); p.add_argument("--cv-file"); p.add_argument("--cover-file")
    p.add_argument("--source"); p.add_argument("--deadline"); p.add_argument("--contact")
    p.set_defaults(fn=cmd_add)

    p = sub.add_parser("set-status")
    p.add_argument("--company", required=True); p.add_argument("--role", required=True)
    p.add_argument("--status", required=True); p.add_argument("--note")
    p.set_defaults(fn=cmd_set_status)

    p = sub.add_parser("clear")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(fn=cmd_clear)

    p = sub.add_parser("list")
    p.add_argument("--status")
    p.set_defaults(fn=cmd_list)

    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
