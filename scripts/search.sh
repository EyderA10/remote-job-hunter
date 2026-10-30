#!/usr/bin/env bash
# The repeatable search cycle. Run this every time; it is idempotent by design.
#
#   1. Run BOTH windows (24h and 3 days) for EVERY query
#   2. Filter: remote-only + the 7 hard vetoes
#   3. Dedup by URL, score against the fit rubric
#   4. Clear and rewrite the Notion DB (Personal > Tracking Jobs)
#   5. Print the table
#
# Usage:
#   scripts/search.sh                   # default query set
#   scripts/search.sh --dry-run         # do not touch Notion
#   scripts/search.sh --apply-filter    # LinkedIn: keep only Easy Apply postings
#
# Flags are passed through: --dry-run to Notion, --apply-filter to the scorer.
#
# Queries cover the user's actual stack (JavaScript/TypeScript/Node.js/Next.js/React/
# Go/PHP) and his AI-agent focus. "Full Stack Developer" is matched without a stack
# qualifier too, so roles that simply say "Full Stack Developer" are not missed.

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$HOME/.venvs/job-search/bin/python"
P="$SKILL_DIR/scripts"
OUT="$SKILL_DIR/state"

APPLY_FILTER=""
for a in "$@"; do
  case "$a" in
    --apply-filter) APPLY_FILTER="1" ;;
    --dry-run)      DRY_RUN="1" ;;
  esac
done
# LinkedIn: f_AL=true filters Easy Apply server-side (verified 2026-10-27).
# The scorer then re-checks per-posting (_easy_apply must be True).
[ -n "$APPLY_FILTER" ] && export EASY_APPLY=1

QUERIES=(
  "Full Stack Developer"
  "Desarrollador Full Stack"
  "Full Stack Engineer"
  "Ingeniero de software full stack"
  "Frontend Developer"
  "Desarrollador Frontend"
  "Frontend Engineer"
  "Ingeniero Frontend"
  "Backend Developer"
  "Desarrollador Backend"
  "Backend Engineer"
  "Ingeniero Backend"
  "AI agent engineer"
  "Ingeniero de agentes AI"
  "Desarrollador de agentes AI"
  "AI Engineer"
  "Ingeniero AI"
  "backend engineer TypeScript"
  "backend TypeScript engineer"
  "backend Node.js engineer"
  "desarrollador Node.js"
  "desarrollador Next.js"
  "desarrollador React"
  "desarrollador Go"
  "PHP Laravel Developer"
  "Desarrollador Laravel"
  "Go Developer"
)

WINDOW_24H=(--jobage-minutes 1440)   # LinkedIn sub-day precision
WINDOW_3D=(--jobage 3)               # all portals

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run() {  # run <query> <window...>
  local q="$1"; shift
  local tag="$1"; shift
  bash "$P/scrape-all.sh" --query "$q" --location "Remote" --limit 20 "$@" > "$TMP/${tag}.jsonl" 2>/dev/null
}

echo "=== search cycle: $(date +%Y-%m-%d) ==="
echo "windows: 24h + 3 days | queries: ${#QUERIES[@]} (ES + EN) | remote only${APPLY_FILTER:+ | easy-apply}"
echo

# 24 h window (LinkedIn supports sub-day precision; the others take --jobage 1)
for q in "${QUERIES[@]}"; do
  slug="$(printf '%s' "$q" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_')"
  run "$q" "24h_${slug}" "${WINDOW_24H[@]}"
  run "$q" "3d_${slug}"  "${WINDOW_3D[@]}"
done

# merge, dedup by URL + date filter (window: 3 days)
"$PY" - "$TMP" "$OUT/pool-latest.json" <<'PYEOF'
import json, sys, glob, os
from datetime import datetime, timedelta, timezone
tmp, out = sys.argv[1], sys.argv[2]
seen = {}
now = datetime.now(tz=timezone.utc)
cutoff_3d = now - timedelta(days=3)
for f in glob.glob(os.path.join(tmp, "*.jsonl")):
    for line in open(f, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not d.get("ok"):
            continue
        for j in d["results"]:
            # post-hoc date filter: keep only postings within last 3 days
            date_str = j.get("date") or j.get("published_at") or ""
            try:
                jdate = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                if jdate.tzinfo is None:
                    jdate = jdate.replace(tzinfo=timezone.utc)
                if jdate < cutoff_3d:
                    continue
            except (ValueError, TypeError):
                pass  # keep if date unparseable
            seen.setdefault(j["url"], j)
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(list(seen.values()), open(out, "w"), ensure_ascii=False)
print(f"merged {len(seen)} unique postings (within 3d filter)")
PYEOF

# LinkedIn cannot filter remote server-side, so confirm it per posting from the
# posting's own description. Other portals state the modality directly.
echo
echo "--- confirming remote status for LinkedIn postings ---"
"$PY" "$P/enrich_linkedin_remote.py" "$OUT/pool-latest.json" --limit 60

echo
echo "--- checking GetOnBoard residence restrictions ---"
"$PY" "$P/enrich_getonboard_residence.py" "$OUT/pool-latest.json" --limit 40

echo
echo "--- checking WeWorkRemotely residence regions ---"
"$PY" "$P/enrich_wwr_residence.py" "$OUT/pool-latest.json"

# remote-only filter + vetoes + scoring
SCORE_ARGS=(--top 40 --out "$OUT/scored-latest.json")
[ -n "$APPLY_FILTER" ] && SCORE_ARGS+=(--apply-filter)
"$PY" "$P/score_pool.py" "$OUT/pool-latest.json" "${SCORE_ARGS[@]}"
echo

# sync to Notion (Personal > Tracking Jobs)
if [ -n "${DRY_RUN:-}" ]; then
  "$PY" "$P/notion_sync.py" "$OUT/scored-latest.json" --dry-run
else
  "$PY" "$P/notion_sync.py" "$OUT/scored-latest.json"
fi
