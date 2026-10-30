#!/usr/bin/env bash
# Probe job-portal reachability from THIS host.
# Reachability is a property of the network path, not of the API — re-run
# before promising any portal to the user, and re-probe before shipping a
# parser against a portal you probed days ago.
#
# Usage:  bash scripts/probe-portals.sh
set -uo pipefail

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

probe() {  # probe <label> <url>
  local label="$1" url="$2" out rc
  out=$(curl -s -o /dev/null -m 20 -w "%{http_code}" -H "User-Agent: $UA" "$url" 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    printf "%-30s NETFAIL (%s)\n" "$label" "$out"
    return
  fi
  printf "%-30s HTTP %s\n" "$label" "$out"
}

echo "=== Job portal reachability probe ==="
probe "linkedin jobs-guest"  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=engineer&location=Remote"
probe "getonboard search"    "https://www.getonbrd.com/api/v0/search/jobs?query=dev&per_page=1"
probe "getonboard api host"  "https://api.getonbrd.com/api/v0/search/jobs?query=dev&per_page=1"
probe "remoteok api"         "https://remoteok.com/api"
probe "freehire api"         "https://freehire.me/api/v1/jobs?limit=1"
probe "infojobs api"         "https://api.infojobs.net/api/9/offer?page=1"
probe "indeed ES"            "https://es.indeed.com/jobs?q=desarrollador"
probe "glassdoor"            "https://www.glassdoor.es/Empleo/index.htm"
probe "bumeran"              "https://www.bumeran.com.ar/empleos.html"
probe "computrabajo"         "https://www.computrabajo.com/trabajo-de-desarrollador"
echo
echo "Interpretation:"
echo "  200          reachable — then PARSE the payload before calling it working"
echo "  401          needs auth (OAuth-walled) — needs the user's own credentials"
echo "  403          WAF or blocked — no credential will fix it"
echo "  405 / 422    wrong path or method"
echo "  NETFAIL / 0  wrong host or path — try alternate hostnames"
