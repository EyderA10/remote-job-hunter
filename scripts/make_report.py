#!/usr/bin/env python3
"""Generate the application-tracker dashboard (references/html-report-workflow.md).

Reads state/job_search_tracker.csv (and state/applications/*/outcome.md when present)
and writes a single self-contained HTML file - no external assets, no CDN, opens
offline in a browser. Inline SVG charts, so nothing is fetched at view time.

Usage:
  ~/.venvs/job-search/bin/python scripts/make_report.py [--out PATH] [--open]
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TRACKER = SKILL_DIR / "state" / "job_search_tracker.csv"
APPLICATIONS = SKILL_DIR / "state" / "applications"

# Final vs open statuses - mirrors the Tracker status vocabulary in /outcome.
FINAL_STATUSES = {
    "rejected", "no response", "offer declined", "withdrawn", "hired",
    "ghosted", "closed",
}
OPEN_STATUSES = {"drafted", "applied", "interviewing", "offer"}


def read_tracker() -> list[dict]:
    if not TRACKER.exists():
        return []
    with TRACKER.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def read_outcomes() -> dict[str, dict]:
    """Interview stages reached per application, from outcome.md files."""
    out: dict[str, dict] = {}
    if not APPLICATIONS.exists():
        return out
    for d in sorted(APPLICATIONS.iterdir()):
        f = d / "outcome.md"
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        stages = []
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("- [x]") or s.startswith("* [x]"):
                stages.append(html.unescape(s[5:].strip()))
        out[d.name] = {"stages": stages}
    return out


def esc(v) -> str:
    return html.escape(str(v if v not in (None, "") else ""))


def bar(count: int, total: int, color: str) -> str:
    pct = (count / total * 100) if total else 0
    return (
        f'<div class="bar"><div class="bar-fill" style="width:{pct:.1f}%;background:{color}"></div>'
        f'<span class="bar-label">{count}</span></div>'
    )


def render(rows: list[dict], outcomes: dict[str, dict], generated: str) -> str:
    n = len(rows)
    status = Counter((r.get("status") or "").strip() or "unknown" for r in rows)
    channel = Counter((r.get("channel") or "").strip() or "unknown" for r in rows)
    sector = Counter((r.get("sector") or "").strip() or "unknown" for r in rows)
    role_type = Counter((r.get("role_type") or "").strip() or "unknown" for r in rows)

    open_n = sum(c for s, c in status.items() if s in OPEN_STATUSES)
    final_n = sum(c for s, c in status.items() if s in FINAL_STATUSES)

    fits = []
    for r in rows:
        try:
            v = float(r.get("fit_rating") or "")
            fits.append(v)
        except ValueError:
            pass
    avg_fit = f"{sum(fits) / len(fits):.0f}" if fits else "—"

    palette = ["#0f766e", "#6366f1", "#f59e0b", "#ef4444", "#14b8a6", "#8b5cf6"]

    def chart(title: str, counter: Counter, color_offset: int = 0) -> str:
        items = counter.most_common()
        if not items:
            return f'<div class="card"><h3>{esc(title)}</h3><p class="muted">No data yet.</p></div>'
        body = "".join(
            f'<div class="row"><span class="k">{esc(k)}</span>{bar(v, sum(counter.values()), palette[(i + color_offset) % len(palette)])}</div>'
            for i, (k, v) in enumerate(items)
        )
        return f'<div class="card"><h3>{esc(title)}</h3>{body}</div>'

    table_rows = []
    for i, r in enumerate(sorted(rows, key=lambda x: x.get("date", ""), reverse=True), 1):
        st = (r.get("status") or "").strip()
        st_class = "final" if st in FINAL_STATUSES else ("open" if st in OPEN_STATUSES else "")
        table_rows.append(
            "<tr>"
            f"<td>{i}</td><td>{esc(r.get('date'))}</td>"
            f"<td><b>{esc(r.get('company'))}</b></td><td>{esc(r.get('role'))}</td>"
            f"<td>{esc(r.get('sector') or '—')}</td><td>{esc(r.get('channel') or '—')}</td>"
            f'<td class="status {st_class}">{esc(st or '—')}</td>'
            f"<td>{esc(r.get('fit_rating') or '—')}</td>"
            f"<td>{esc(r.get('deadline') or '—')}</td>"
            f"<td>{esc((r.get('notes') or '')[:90])}</td>"
            "</tr>"
        )

    funnel = [
        ("Drafted", status.get("drafted", 0)),
        ("Applied", status.get("applied", 0)),
        ("Interviewing", status.get("interviewing", 0)),
        ("Offer", status.get("offer", 0)),
        ("Hired", status.get("hired", 0)),
    ]

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job search pipeline</title>
<style>
:root {{ color-scheme: light dark; }}
body {{ font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 28px;
       background: #0f1115; color: #e5e7eb; }}
h1 {{ font-size: 22px; margin: 0 0 4px; }}
h2 {{ font-size: 15px; margin: 32px 0 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: .08em; }}
h3 {{ font-size: 13px; margin: 0 0 12px; color: #d1d5db; }}
.muted {{ color: #6b7280; font-size: 12px; }}
.stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }}
.card {{ background: #161a21; border: 1px solid #232833; border-radius: 10px; padding: 16px; }}
.stat {{ background: #161a21; border: 1px solid #232833; border-radius: 10px; padding: 16px; }}
.stat .n {{ font-size: 26px; font-weight: 700; color: #5eead4; }}
.stat .l {{ font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .08em; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }}
.row {{ display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }}
.row .k {{ width: 110px; flex: none; font-size: 12px; color: #cbd5e1;
           overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.bar {{ position: relative; flex: 1; height: 18px; background: #1f242e; border-radius: 4px; overflow: hidden; }}
.bar-fill {{ height: 100%; border-radius: 4px; }}
.bar-label {{ position: absolute; right: 6px; top: 0; font-size: 11px; line-height: 18px; color: #e5e7eb; }}
table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
th {{ text-align: left; padding: 8px 10px; color: #9ca3af; font-size: 11px;
      text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #232833; }}
td {{ padding: 8px 10px; border-bottom: 1px solid #1c212b; vertical-align: top; }}
tr:hover td {{ background: #171c24; }}
.status.open {{ color: #5eead4; }}
.status.final {{ color: #f87171; }}
</style></head><body>
<h1>Job search pipeline</h1>
<p class="muted">Generated {esc(generated)} · tracker: state/job_search_tracker.csv</p>

<h2>Overview</h2>
<div class="stats">
  <div class="stat"><div class="n">{n}</div><div class="l">Tracked</div></div>
  <div class="stat"><div class="n">{open_n}</div><div class="l">Open</div></div>
  <div class="stat"><div class="n">{final_n}</div><div class="l">Resolved</div></div>
  <div class="stat"><div class="n">{avg_fit}</div><div class="l">Avg fit</div></div>
  <div class="stat"><div class="n">{status.get('interviewing', 0)}</div><div class="l">Interviewing</div></div>
  <div class="stat"><div class="n">{status.get('hired', 0)}</div><div class="l">Hired</div></div>
</div>

<h2>Funnel</h2>
<div class="card">{''.join(f'<div class="row"><span class="k">{esc(k)}</span>{bar(v, n, "#0f766e")}</div>' for k, v in funnel)}</div>

<h2>Breakdowns</h2>
<div class="grid">
  {chart("Status", status)}
  {chart("Channel", channel, 1)}
  {chart("Sector", sector, 2)}
  {chart("Role type", role_type, 3)}
</div>

<h2>Applications</h2>
<div class="card">
<table><thead><tr>
<th>#</th><th>Date</th><th>Company</th><th>Role</th><th>Sector</th><th>Channel</th>
<th>Status</th><th>Fit</th><th>Deadline</th><th>Notes</th>
</tr></thead><tbody>
{''.join(table_rows) or '<tr><td colspan="10" class="muted">No applications tracked yet.</td></tr>'}
</tbody></table>
</div>

<h2>Interview stages reached</h2>
<div class="card">
{''.join(f'<p><b>{esc(k)}</b>: {esc(", ".join(v["stages"]) or "—")}</p>' for k, v in outcomes.items()) or '<p class="muted">No outcome files recorded yet.</p>'}
</div>
</body></html>"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(SKILL_DIR / "output" / "dashboard.html"))
    ap.add_argument("--open", action="store_true", help="open the report in a browser")
    args = ap.parse_args()

    rows = read_tracker()
    outcomes = read_outcomes()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(rows, outcomes, datetime.now().strftime("%Y-%m-%d %H:%M")), encoding="utf-8")

    print(f"wrote {out} ({len(rows)} applications, {len(outcomes)} outcomes)")
    if args.open:
        import webbrowser
        webbrowser.open(out.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
