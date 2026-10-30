#!/usr/bin/env bash
# Run every enabled portal CLI with one query and merge the results.
# This is the concrete executable behind references/scrape-workflow.md Step 1b.
#
# Usage:
#   scripts/scrape-all.sh --query "<keywords>" [--location "<place>"] [--country "ES,CL"]
#                         [--jobage 14] [--limit 20] [--format json|table]
#
# Each portal's SKILL.md frontmatter carries `enabled: true|false`; disabled
# portals are reported as skipped, never silently omitted.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTALS_DIR="$SKILL_DIR/portals"
BUN="${BUN_BIN:-bun}"

QUERY=""
LOCATION=""
COUNTRY=""
JOBAGE=""
JOBAGE_MINUTES=""
LIMIT=""
FORMAT="json"
EASY_APPLY="${EASY_APPLY:-}"   # set EASY_APPLY=1 to filter LinkedIn by Easy Apply (f_AL=true)
while [ $# -gt 0 ]; do
  case "$1" in
    --query)   QUERY="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    --country) COUNTRY="$2"; shift 2 ;;
    --jobage)  JOBAGE="$2"; shift 2 ;;
    --jobage-minutes) JOBAGE_MINUTES="$2"; shift 2 ;;
    --limit)   LIMIT="$2"; shift 2 ;;
    --format)  FORMAT="$2"; shift 2 ;;
    *) echo "scrape-all: unknown argument $1" >&2; exit 2 ;;
  esac
done

if [ -z "$QUERY" ]; then
  echo "usage: scrape-all.sh --query <keywords> [--location <place>] [--country <codes>] [--jobage N] [--limit N]" >&2
  exit 2
fi

# --- discover enabled portals (SKILL.md frontmatter `enabled:` flag) -------
declare -a ENABLED=()
declare -a SKIPPED=()
for dir in "$PORTALS_DIR"/*/; do
  name="$(basename "$dir")"
  skill="$dir/SKILL.md"
  if [ ! -f "$skill" ]; then SKIPPED+=("$name (no SKILL.md)"); continue; fi
  if grep -qiE '^enabled:[[:space:]]*false' "$skill"; then
    SKIPPED+=("$name")
    continue
  fi
  ENABLED+=("$name")
done

if [ "${#ENABLED[@]}" -eq 0 ]; then
  echo "scrape-all: no enabled portals found in $PORTALS_DIR" >&2
  exit 1
fi

# --- run each portal, collecting JSON --------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run_portal() {  # run_portal <name>
  local name="$1" cli="$PORTALS_DIR/$1/cli/src/cli.ts"
  [ -f "$cli" ] || { echo "{\"portal\":\"$name\",\"error\":\"CLI not found\"}"; return; }
  local args=(run "$cli" search -q "$QUERY" --format json --jobage "$JOBAGE" --limit "$LIMIT")
  case "$name" in
    linkedin-search)
      [ -n "$LOCATION" ] && [ "$COUNTRY" = "" ] && args+=(-l "$LOCATION")
      [ -n "$JOBAGE_MINUTES" ] && args+=(--jobage-minutes "$JOBAGE_MINUTES")
      # f_AL=true is LinkedIn's server-side Easy Apply filter. Verified live
      # 2026-10-27: identical query twice returns identical IDs; f_AL=true
      # returns a disjoint set, so the parameter is honored.
      [ "$EASY_APPLY" = "1" ] && args+=(--easy-apply)
      ;;
    getonboard-search)
      # --location is ignored by GetOnBoard; pass --remote explicitly
      if [ "${LOCATION:-}" = "Remote" ]; then
        args+=(--remote remote)
      else
        [ -n "$COUNTRY" ] && args+=(--country "$COUNTRY")
      fi
      ;;
    weworkremotely-search)
      # WWR takes no location/country args; --jobage (days) is already in the
      # base args. Empty JOBAGE (24h window) is dropped to keep the CLI happy.
      if [ -z "$JOBAGE" ]; then
        args=(run "$cli" search -q "$QUERY" --format json --limit "$LIMIT")
      fi
      ;;
  esac
  "$BUN" "${args[@]}" 2>"$TMP/$name.err"
}

echo "=== scrape: '$QUERY' ==="
echo "enabled: ${ENABLED[*]}"
[ "${#SKIPPED[@]}" -gt 0 ] && echo "skipped (disabled): ${SKIPPED[*]}"
echo

for name in "${ENABLED[@]}"; do
  out="$(run_portal "$name")"
  rc=$?
  if [ $rc -ne 0 ] || [ -z "$out" ]; then
    err="$(cat "$TMP/$name.err" 2>/dev/null | tr '\n' ' ')"
    echo "{\"portal\":\"$name\",\"ok\":false,\"error\":$(printf '%s' "${err:-request failed}" | jq -Rs .)}"
    continue
  fi
  printf '%s' "$out" | jq -c --arg p "$name" '{portal:$p, ok:true, meta:.meta, results:.results}'
done
