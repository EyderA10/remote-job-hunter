#!/usr/bin/env bash
# Compile a CV + cover letter with Typst and run the verification checks from
# references/apply-workflow.md Step 5. Typst is the toolchain (not LaTeX).
#
# Usage:
#   scripts/build-application.sh <cv.typ> <cover.typ> [--cv-pages N] [--cover-pages N]
#
# Exits non-zero if any check fails. Prints a one-line verdict per document.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${JOBPY:-$HOME/.venvs/job-search/bin/python}"
TYPST="${TYPST_BIN:-$HOME/.local/bin/typst}"
VERIFY="$SKILL_DIR/scripts/verify_pdf.py"

CV_PAGES=2
COVER_PAGES=1
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --cv-pages)   CV_PAGES="$2"; shift 2 ;;
    --cover-pages) COVER_PAGES="$2"; shift 2 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [ "${#POSITIONAL[@]}" -lt 2 ]; then
  echo "usage: build-application.sh <cv.typ> <cover.typ> [--cv-pages N] [--cover-pages N]" >&2
  exit 2
fi

CV_SRC="${POSITIONAL[0]}"
COVER_SRC="${POSITIONAL[1]}"

fail=0

compile_one() {  # compile_one <src.typ>
  local src="$1"
  if [ ! -f "$src" ]; then echo "MISSING SOURCE: $src"; return 2; fi
  "$TYPST" compile "$src" 2>&1 | sed 's/^/    /'
  local pdf="${src%.typ}.pdf"
  if [ ! -f "$pdf" ]; then echo "COMPILE FAILED: $src (no PDF produced)"; return 1; fi
  echo "$pdf"
}

verify_one() {  # verify_one <pdf> <expected_pages> <label>
  local pdf="$1" pages="$2" label="$3"
  if [ ! -f "$PY" ]; then
    echo "  [$label] WARNING: pypdf venv not found at $PY - mechanical checks skipped"
    return 0
  fi
  if "$PY" "$VERIFY" "$pdf" --pages "$pages" --ascii-dates; then
    echo "  [$label] OK: $pages page(s), ASCII dates, extractable text layer"
    return 0
  fi
  echo "  [$label] FAILED verification (see above)"
  return 1
}

echo "=== CV ==="
CV_PDF="$(compile_one "$CV_SRC")" || { echo "$CV_PDF"; fail=1; }
if [ -n "${CV_PDF:-}" ] && [ -f "${CV_PDF:-/nonexistent}" ]; then
  verify_one "$CV_PDF" "$CV_PAGES" "CV" || fail=1
fi

echo "=== Cover letter ==="
COVER_PDF="$(compile_one "$COVER_SRC")" || { echo "$COVER_PDF"; fail=1; }
if [ -n "${COVER_PDF:-}" ] && [ -f "${COVER_PDF:-/nonexistent}" ]; then
  verify_one "$COVER_PDF" "$COVER_PAGES" "COVER" || fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "BUILD FAILED - fix the source and re-run."
  exit 1
fi
echo "BUILD OK"
