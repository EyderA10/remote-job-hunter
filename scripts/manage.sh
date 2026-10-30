#!/usr/bin/env bash
# manage.sh — guided menu for the job-search tracker.
#
# Lets you (without asking Hermes):
#   - list every application with its status
#   - change an application's status (drafted/applied/interviewing/offer/rejected/closed)
#   - open an application's folder, CV, cover letter or PDF in Windows Explorer
#   - edit any CSV field (notes, contact, deadline...) of one application
#   - recompile a CV/letter after editing the .typ source (needs typst in the VM)
#   - run the daily search cycle (normal / easy-apply / dry-run)
#
# Usage:  bash manage.sh        (menu loop; q to quit)
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV="$SKILL_DIR/state/job_search_tracker.csv"
PY="$HOME/.venvs/job-search/bin/python"
TYPST="$HOME/.local/bin/typst"

STATUSES=(drafted applied interviewing offer rejected closed)

# ---------- helpers ----------------------------------------------------------
wslpath_win() { # convert a WSL path to a Windows path, silent on failure
  wslpath -w "$1" 2>/dev/null
}

win_open() { # open a file/dir in Windows (Explorer or default app)
  local win
  win="$(wslpath_win "$1")" || return 1
  [ -n "$win" ] || { echo "  (no Windows path — are you inside the VM? use the listed paths instead)"; return 1; }
  cmd.exe /c start "" "$win" >/dev/null 2>&1 && echo "  -> abierto en Windows: $win" || echo "  (no se pudo abrir — abre manualmente: $win)"
}

list_apps() {
  "$PY" - "$CSV" << 'PYEOF'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
if not rows:
    print("  (tracker vacío)"); sys.exit(0)
print()
print("=== Tus aplicaciones ===")
for i, r in enumerate(rows, 1):
    print(f"{i}) {r['company']:<12} — {r['role'][:48]:<48} [{r['status']}]  {r['date']}")
print()
print("Escribe # o nombre de empresa (q = volver):")
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
    echo "  (no coincide — # o nombre de empresa, q para volver)"
  done
}

read_row() { # read_row <idx-1based>  → prints CSV row as NUL-safe fields
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
print(f"  valor actual de '{field}': {r.get(field, '')}")
with open(path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader(); w.writerows(rows)
PYEOF
  local current
  current="$("$PY" - "$CSV" "$1" "$2" << 'PYEOF'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
print(rows[int(sys.argv[2]) - 1][sys.argv[3]])
PYEOF
)"
  read -r -p "  nuevo valor (enter para dejar igual): " val
  [ -z "$val" ] && { echo "  (sin cambios)"; return 0; }
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
print(f"  '{field}' actualizado")
PYEOF
}

compile_docs() { # compile_docs <idx-1based>
  local row cv cl
  row="$(read_row "$1")"
  cv="$(echo "$row" | grep -o 'cv_file=[^ ]*' | cut -d= -f2-)"
  cl="$(echo "$row" | grep -o 'cover_letter_file=[^ ]*' | cut -d= -f2-)"
  for f in "$cv" "$cl"; do
    [ -n "$f" ] && [ -f "$SKILL_DIR/$f" ] || continue
    if [ -x "$TYPST" ]; then
      "$TYPST" compile --root / "$SKILL_DIR/$f" && echo "  PDF: ${f%.typ}.pdf"
    else
      echo "  (typst no está en el VM — pídeselo a Hermes: 'compila $f')"
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
print(f"--- {d['company']} — {d['role']} [{d['status']}] ---")
for k in ("sector", "channel", "fit_rating", "contact_person", "deadline", "source"):
    if d.get(k): print(f"  {k:<15}: {d[k][:80]}")
if d.get("cv_file"):       print(f"  cv            : {d['cv_file']}")
if d.get("cover_letter_file"): print(f"  carta         : {d['cover_letter_file']}")
if d.get("notes"):         print(f"  notas         : {d['notes'][:120]}")
PYEOF
    cat << 'MENU'
  1) Cambiar status
  2) Editar un campo (notas, contacto, deadline...)
  3) Abrir carpeta de la aplicación en Windows
  4) Abrir CV (.typ) en Windows
  5) Abrir carta (.typ) en Windows
  6) Recompilar CV y carta a PDF
  7) Ver posting archivado
  b) Volver   q) Salir
MENU
    read -r -p "> " o
    case "$o" in
      1) echo "  Estados: ${STATUSES[*]}"
         read -r -p "  nuevo status: " s
         echo "$s" | grep -qxE "$(echo "${STATUSES[*]}" | tr ' ' '|')" \
           && set_status "$idx" "$s" || echo "  (status inválido)"
         ;;
      2) "$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
r = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]
print("  campos:", ", ".join(k for k in r.keys() if k != "status"))
PYEOF
         read -r -p "  campo: " f
         [ -n "$f" ] && edit_field "$idx" "$f"
         ;;
      3) local comp; comp="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["company"])
PYEOF
)"
         local base="$SKILL_DIR/state/applications"
         local folder; folder="$(ls -d "$base"/*/ 2>/dev/null | grep -i "$comp" | head -1)"
         [ -n "$folder" ] && win_open "$folder" || echo "  (sin carpeta para '$comp' — la crea Hermes al redactar)"
         ;;
      4) local f; f="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["cv_file"])
PYEOF
)"; [ -f "$SKILL_DIR/$f" ] && win_open "$SKILL_DIR/$f" || echo "  (no hay cv_file registrado)"
         ;;
      5) local f; f="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["cover_letter_file"])
PYEOF
)"; [ -f "$SKILL_DIR/$f" ] && win_open "$SKILL_DIR/$f" || echo "  (no hay cover_letter_file registrado)"
         ;;
      6) compile_docs "$idx"
         ;;
      7) local comp; comp="$("$PY" - "$CSV" "$idx" << 'PYEOF'
import csv, sys
print(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))[int(sys.argv[2]) - 1]["company"])
PYEOF
)"
         local folder; folder="$(ls -d "$SKILL_DIR/state/applications"/*/ 2>/dev/null | grep -i "$comp" | head -1)"
         [ -n "$folder" ] && [ -f "$folder/job_posting.md" ] && win_open "$folder/job_posting.md" || echo "  (sin posting archivado — pídeselo a Hermes)"
         ;;
      b) return 0 ;;
      q) exit 0 ;;
      *) echo "  (opción inválida)" ;;
    esac
  done
}

# ---------- main menu --------------------------------------------------------
while true; do
  cat << 'MAIN'
=== Job Search — manage.sh ===
  1) Ver aplicaciones
  2) Buscar hoy (normal)
  3) Buscar hoy (solo Easy Apply)
  4) Buscar hoy (dry-run, no toca Notion)
  5) Sincronizar última búsqueda a Notion
  q) Salir
MAIN
  read -r -p "> " o
  case "$o" in
    1) list_apps
       c="$(pick_app)" && app_menu "$c"
       ;;

    2) bash "$SKILL_DIR/scripts/search.sh" ;;
    3) bash "$SKILL_DIR/scripts/search.sh" --apply-filter ;;
    4) bash "$SKILL_DIR/scripts/search.sh" --dry-run --apply-filter ;;
    5) "$PY" "$SKILL_DIR/scripts/notion_sync.py" "$SKILL_DIR/state/scored-latest.json" ;;
    q) exit 0 ;;
    *) echo "  (opción inválida)" ;;
  esac
done
