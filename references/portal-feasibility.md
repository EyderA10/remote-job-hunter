# Job portal feasibility

Reachability is a property of the **network path**, not of the API. Every row below was observed by probing this host live; re-run `scripts/probe-portals.sh` before relying on any of them. A portal that worked yesterday can be WAF-blocked today.

## Observed landscape

| Portal | Endpoint that works | Result | Built? |
|---|---|---|---|
| LinkedIn | `linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=<q>&location=<place>` | 200, job cards, no login wall | ✅ `portals/linkedin-search` (ported from the source repo) |
| GetOnBoard | `www.getonbrd.com/api/v0/search/jobs?query=<q>` + `/api/v0/companies/<id>` | 200, JSON with full descriptions; company name needs the companies endpoint | ✅ `portals/getonboard-search` (built) |
| RemoteOK | `remoteok.com/api` | 200, whole board (~100 postings) in one request, no auth | ✅ `portals/remoteok-search` (built) |
| freehire | `freehire.me/api/v1/jobs?limit=1` | 403 (Cloudflare) | ❌ dropped — WAF, no credential fixes it |
| InfoJobs | `api.infojobs.net/api/9/offer?page=1` | 401 | ⏸ scaffolded inactive — needs the user's own OAuth app credentials |
| Indeed / Glassdoor | site root | 403 | ❌ blocked |
| Bumeran | `www.bumeran.com.ar/empleos.html` | 200, HTML, no captcha | ⏸ reachable, no parser built |
| Computrabajo | `computrabajo.com/trabajo-de-...` | 404 | ⏸ wrong URL pattern at minimum; re-investigate before writing it off |

## Portal CLI contract (what was built)

All three CLIs expose the same shape so `/scrape` and `/rank` can treat them uniformly:

- `search [flags] --format json|table|plain` → `{ "meta": {...}, "results": [...] }`
- `detail <slug|url> --format json|plain`
- `--format json` always carries the full posting text
- Every CLI exits non-zero with `{ "error", "code" }` on stderr
- `enabled: false` in a portal's `SKILL.md` frontmatter removes it from a run (reported as skipped)

`scripts/scrape-all.sh` runs every enabled portal for one query and merges the JSON — that is the executable behind `references/scrape-workflow.md` Step 1b. Verified live: 23 unique postings from 3 portals for the query "AI agent engineer".

## Non-obvious findings

- **Hostname matters.** `api.getonbrd.com` does not resolve; `www.getonbrd.com/api/v0/...` does. When a service's API host fails DNS, try the `www` host with the `/api/...` path before concluding the service is down.
- **A 403 from a CDN is not the same as a 401 from an API.** 401 means "authenticate"; 403 from Cloudflare means "go away" and no credentials will fix it.
- **200 is not "working".** Parse the payload and confirm it contains the fields the parser needs (title, description, URL). A 200 with an empty or login-walled body is a failure.
- **GetOnBoard's search API omits the company name.** It returns a company *id*; the name needs `/api/v0/companies/<id>` (one call per company). The CLI dedupes the ids and caches names to `state/getonboard-companies.json`. The public job page's `og:title` also carries the real company name, including staffing agencies ("at Equifax (via 23people)"), which is what `detail` uses.
- **GetOnBoard's API has no job-detail endpoint.** `detail` reads the public page and parses the `gb-rich-txt` blocks, so it also works for postings that have closed and dropped out of search.
- **RemoteOK serves the whole board in one request** (~100 postings). There is no server-side search — every filter is client-side.
- **RemoteOK returns mojibake.** UTF-8 bytes decoded as Latin-1 upstream, so "Sotheby's" arrives as "Sothebyâ€™s". The CLI re-decodes it (`fixMojibake`).
- **RemoteOK salary is often absent** (`0-0`), which the CLI renders as `null` rather than a fake range.
- **GetOnBoard reports salary in thousands** of the local currency (2000 → 2,000,000 CLP).
- **LinkedIn's `--location "Remote"` does not filter to remote-only roles.** It matches the location field, so results from London or Brazil still come back; filter client-side by the `location` field.

## Probe recipe

```bash
curl -s -o /dev/null -m 20 -w "HTTP %{http_code}\n" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "<url>"
```

Send a browser User-Agent. Several of these portals serve different bodies to curl's default UA. Then confirm the payload:

```bash
curl -s -m 20 -H "User-Agent: Mozilla/5.0" "<url>" -o out.json
python3 -c "import json;d=json.load(open('out.json'));print(list(d)[:8])"
```

## Decision rule

| HTTP | Meaning | Action |
|---|---|---|
| 200 + parseable payload | Usable | Ship it |
| 200 + empty/login-walled body | Misleading | Not usable; investigate the UA or path |
| 401 | Needs auth | Scaffold inactive; ask the user for credentials |
| 403 | WAF or blocked | Drop; tell the user plainly |
| 405/422 | Wrong path or method | Fix the endpoint |
| DNS failure / 000 | Wrong host or path | Try alternate hostnames |

## Leads to probe (never present them as verified)

Sources named as leads that have not been probed live from this host go here, **not** into the
landscape table above. A lead without a live HTTP result is a hypothesis, not a portal — probe
it before promising it to the user, and only then move it up or cross it out with the observed
code.

| Lead | Suggested probe (verify live first) | Status |
|---|---|---|
| Remotive | `remotive.com/api/remote-jobs?category=software-dev` (public JSON API; RSS also documented) | unprobed |
| Hacker News "Who's Hiring" | `hn.algolia.com/api/v1/search_by_date?tags=comment` on the monthly thread | unprobed |
| Jobicy | `jobicy.com/api/v2/remote-jobs` (public API documented) | unprobed |
| Himalayas | `himalayas.app/jobs/api` (public API documented) | unprobed |
| Jobspresso | jobspresso.co — HTML board, needs a parser | unprobed |
| Nodi, wfadigital, talently, euremotejobs, BairesDev, ChumiJobs | user-named leads; probe each from this host before judging | unprobed |
