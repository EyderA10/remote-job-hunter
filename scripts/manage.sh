#!/usr/bin/env bash
# manage.sh — guided menu for the job-search tracker.
#
# Lets you run the day-to-day workflow without touching an agent:
#   - list every application with its status
#   - change an application's status (drafted/applied/interviewing/offer/rejected/closed)
#   - edit any CSV field (notes, contact, deadline...) of one application
#   - open an application's folder, CV, cover letter or PDF (on WSL, in Windows)
#   - recompile a CV/letter after editing the .typ source (needs typst)
#   - run the daily search cycle (normal / easy-apply / dry-run)
#   - sync the latest scored pool to Notion (optional integration)
#
# Usage:  bash scripts/manage.sh        (menu loop; q to quit)
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV="$REPO_DIR/state/job_search_tracker.csv"
PY="${JOB_SEARCH_PYTHON:-$HOME/.venvs/job-search/bin/python}"
[ -x "$PY" ] || PY="$(command -v python3)"
TYPST="${JOB_SEARCH_TYPST:-$HOME/.local/bin/typst}"
[ -x "$TYPST" ] || TYPST="$(command -v typst)"

STATUSES=(drafted applied interviewing offer rejected closed)

# ---------- helpers ----------------------------------------------------------
win_open() { # open a file/dir in Windows (WSL convenience; degrades gracefully elsewhere)
  local win
  win="$(wslpath -w "$1" 2>/dev/null)" || return 1
  [ -n "$win" ] || { echo "  (not a Windows path — open it manually: $1)"; return 1; }
  cmd.exe /c start "" "$win" >/dev/null 2>&1 && echo "  -> opened in Windows: $win" || echo "  (could not open — open manually: $win)"
}

list_apps() {
  "$PY" - "$CSV" << 'PYEOF'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
if not rows:
    print("  (tracker is empty)"); sys.exit(0)
print()
print("=== Your applications ===")
for i, r in enumerate(rows, 1):
    print(f"{i}) {r['company']:<12} - {r['role'][:48]:<48} [{r['status']}]  {r['date']}")
print()
print("Type a # or company name (q = back):")
PYEOF
}

pick_app() {
  while true; do
    read -r -p "> " sel
    case "$sel" in q|"") return 1;; esac
    local choice
    choice="$("$PY" - "$CSV" "$sel" << 'PYEOF'
import csv, sys
sel = sys.argv[2].strip().lower()
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
hits = [i for i, r in enumerate(rows, 1)
        if r["company"].lower() == sel or str(i) == sel or sel in r["company"].lower()]
if len(hits) == 1:
    print(hits[0])
PYEOF
)"
    if [ -n "$choice" ]; then echo "$choice"; return 0; fi
    echo "  (no match — # or company name, q to go back)"
  done
}

read_row() { # read_row <idx-1based>  -> prints CSV row as key=value lines
  "$PY" - "$CSV" "$1" << 'PYEOF'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
r = rows[int(sys.argv[2]) - 1]
for k, v in r.items():
    print(f"{k}={v}")
PYEOF
}

set_status() { # set_status <idx-1based> <new-status>
  "$PY" - "$CSV" "$1" "$2" << 'PYEOF'
import csv, sys, datetime
path, idx, new = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with open(path, newline="", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())
r = rows[idx - 1]
old = r["status"]
r["status"] = new
r["date"] = datetime.date.today().isoformat()
note = f"{r['notes'] or ''} | {datetime.date.today().isoformat()}: status {old} -> {new} (via manage.sh)".strip(" |")
r["notes"] = note[:200]
with open(path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader(); w.writerows(rows)
print(f"  status: {old} -> {new}")
PYEOF
}

edit_field() { # edit_field <idx-1based> <field>
  "$PY" - "$CSV" "$1" "$2" << 'PYEOF'
import csv, sys
path, idx, field = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with open(path, newline="", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())
r = rows[idx - 1]
print(f"  current '{field}': {r.get(field, '')}")
with open(path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader(); w.writerows(rows)
PYEOF
  read -r -p "  new value (enter to keep current): " val
  [ -z "$val" ] && { echo "  (unchanged)"; return 0; }
  "$PY" - "$CSV" "$1" "$2" "$val" << 'PYEOF'
import csv, sys
path, idx, field, val = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
with open(path, newline="", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())
rows[idx - 1][field] = val
with open(path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader(); w.writerows(rows)
print(f"  '{field}' updated")
PYEOF
}

compile_docs() { # compile_docs <idx-1based>
  local row cv cl
  row="$(read_row "$1")"
  cv="$(echo "$row" | grep -o 'cv_file=[^ ]*' | cut -d= -f2-)"
  cl="$(echo "$row" | grep -o 'cover_letter_file=[^ ]*' | cut -d= -f2-)"
  for f in "$cv" "$cl"; do
    [ -n "$f" ] && [ -f "$REPO_DIR/$f" ] || continue
    if [ -n "$TYPST" ] && [ -x "$TYPST" ]; then
      "$TYPST" compile --root / "$REPO_DIR/$f" && echo "  PDF: ${f%.typ}.pdf"
    else
      echo "  (typst not found — install it from https://typst.app or compile manually: typst compile $f)"
    fi
  done
}

app_menu() { # app_menu <idx-1based>
  local idx="$1"
  while true; do
    read_row "$idx" > /tmp/manage_row.txt
    "$PY" - << 'PYEOF'
d = dict(line.split("=", 1) for line in open("/tmp/manage_row.txt", encoding="utf-8").read().splitlines() if "=" in line)
print()
print(f"--- {d['company']} - {d['role']} [{d['status']}] ---")
for k in ("sector", "channel", "fit_rating", "contact_person", "deadline", "source"):
    if d.get(k): print(f"  {k:<15}: {d[k][:80]}")
if d.get("cv_file"):       print(f"  cv            : {d['cv_file']}")
if d.get("cover_letter_file"): print(f"  cover letter  : {d['cover_letter_file']}")
if d.get("notes"):         print(f"  notes         : {d['notes'][:120]}")
PYEOF
    cat << 'MENU'
  1) Change status
  2) Edit a field (notes, contact, deadline...)
  3) Open the application folder (Windows / WSL)
  4) Open the CV (.typ) (Windows / WSL)
  5) Open the cover letter (.typ) (Windows / WSL)
  6) Recompile CV and letter to PDF
  7) View the archived posting
  b) Back   q) Quit
MENU
    read -r -p "> " o
    case "$o" in
      1) echo "  Statuses: ${STATUSES[*]}"
         read -r -p "  new status: " s
         echo "$s" | grep -qxE "$(echo "${STATUSES[*]}" | tr ' ' '|')" \
           && set_status "$idx" "$s" || echo "  (invalid status)"
         ;;
      2) "$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
r = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]
print("  fields:", ", ".join(k for k in r.keys() if k != "status"))
PYEOF
         read -r -p "  field: " f
         [ -n "$f" ] && edit_field "$idx" "$f"
         ;;
      3) local comp; comp="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["company"])
PYEOF
)"
         local base="$REPO_DIR/state/applications"
         local folder; folder="$(ls -d "$base"/*/ 2>/dev/null | grep -i "$comp" | head -1)"
         [ -n "$folder" ] && win_open "$folder" || echo "  (no folder for '$comp' yet)"
         ;;
      4) local f; f="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["cv_file"])
PYEOF
)"; [ -f "$REPO_DIR/$f" ] && win_open "$REPO_DIR/$f" || echo "  (no cv_file recorded)"
         ;;
      5) local f; f="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["cover_letter_file"])
PYEOF
)"; [ -f "$REPO_DIR/$f" ] && win_open "$REPO_DIR/$f" || echo "  (no cover_letter_file recorded)"
         ;;
      6) compile_docs "$idx"
         ;;
      7) local comp; comp="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["company"])
PYEOF
)"
         local folder; folder="$(ls -d "$REPO_DIR/state/applications"/*/ 2>/dev/null | grep -i "$comp" | head -1)"
         [ -n "$folder" ] && [ -f "$folder/job_posting.md" ] && win_open "$folder/job_posting.md" || echo "  (no archived posting)"
         ;;
      b) return 0 ;;
      q) exit 0 ;;
      *) echo "  (invalid option)" ;;
    esac
  done
}

# ---------- main menu --------------------------------------------------------
while true; do
  cat << 'MAIN'
=== Job Search — manage.sh ===
  1) View applications
  2) Search today (normal)
  3) Search today (Easy Apply only)
  4) Search today (dry-run, no Notion sync)
  5) Sync the latest search to Notion
  q) Quit
MAIN
  read -r -p "> " o
  case "$o" in
    1) list_apps
       c="$(pick_app)" && app_menu "$c"
       ;;

    2) bash "$REPO_DIR/scripts/search.sh" ;;
    3) EASY_APPLY=1 bash "$REPO_DIR/scripts/search.sh" ;;
    4) bash "$REPO_DIR/scripts/search.sh" --dry-run ;;
    5) "$PY" "$REPO_DIR/scripts/notion_sync.py" "$REPO_DIR/state/scored-latest.json" ;;
    q) exit 0 ;;
    *) echo "  (invalid option)" ;;
  esac
done
