---
name: getonboard-search
version: 1.0.0
description: >
  Search live job listings from GetOnBoard (getonbrd.com) for Spain, Latin America,
  and remote roles. Covers tech, data, product, design, marketing, sales, and more.
  No authentication, no API key, zero runtime deps — runs with just `bun`. The market
  is scoped via `--country` and `--remote` flags. Trigger phrases: find a job in
  Spain, jobs in LatAm, getonboard search, "are there any X jobs in Spain/Chile/
  Colombia/Mexico/remote", look up this GetOnBoard posting.
context: fork
enabled: true
allowed-tools: Bash(bun run portals/getonboard-search/cli/src/cli.ts *)
---

# GetOnBoard Search Skill

Search live job listings from **[GetOnBoard](https://www.getonbrd.com)** — the
leading tech/startup job board for Spain and Latin America. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`. The market
is chosen per query via `--country`, `--remote`, and `--category` flags.

## When to use this skill

- Search for job openings in Spain, Chile, Colombia, Mexico, Peru, Argentina, or remote
- Filter by category (Backend, Frontend, Data Science, DevOps, Product, Design, etc.)
- Filter by seniority, modality (remote/hybrid/onsite), or recency
- Get the full description of a specific GetOnBoard job listing

## Commands

### Search job listings

```bash
bun run portals/getonboard-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role). Optional.
- `--country <codes>` — ISO-3166 alpha-2, comma-separated for OR:
  `ES,CL,CO,MX,PE,AR` — or `remote` for remote-only. Default: all countries.
- `--remote <mode>` — `remote`, `hybrid`, `onsite`. Comma-separate for OR.
- `--category <names>` — job category from GetOnBoard's vocabulary, e.g.
  `Backend`, `Frontend`, `Data Science`, `DevOps`, `Product`, `Design`, `Mobile`,
  `QA`, `Security`, `Engineering`, `Marketing`, `Sales`, `Support`, `Management`.
  Comma-separate for OR.
- `--seniority <levels>` — `junior`, `semi-senior`, `senior`, `lead`, `staff`, `principal`, `manager`, `director`, `vp`, `c-level`. Comma-separate for OR.
- `--jobage <days>` — posted within N days (maps to API's `since` parameter).
- `--page <n>` — 1-indexed page. Default 1.
- `--limit <n>` / `-n <n>` — results per page (API limit, max 50). Default 20.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run portals/getonboard-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the `id` from a `search` result (e.g. `senior-python-engineer-company-xyz`).
You may also pass a full `https://www.getonbrd.com/jobs/<slug>` URL. Returns the full
description (HTML-stripped), functions, benefits, desirable skills, salary range,
modality, and company info.

## Usage examples

```bash
# Senior backend roles in Spain, table view
bun run portals/getonboard-search/cli/src/cli.ts search -q "backend" --country ES --seniority senior --format table

# Python or Go roles in Chile or Colombia, remote
bun run portals/getonboard-search/cli/src/cli.ts search -q "python OR go" --country CL,CO --remote remote --format table

# Data Science roles in LatAm, last 14 days
bun run portals/getonboard-search/cli/src/cli.ts search --category "Data Science" --country ES,CL,CO,MX,PE,AR --jobage 14 --format table

# Product Manager roles, fully remote anywhere
bun run portals/getonboard-search/cli/src/cli.ts search -q "product manager" --remote remote --format table

# DevOps roles in Mexico, semi-senior or senior
bun run portals/getonboard-search/cli/src/cli.ts search --category DevOps --country MX --seniority semi-senior,senior --format table

# Full details for a specific job
bun run portals/getonboard-search/cli/src/cli.ts detail senior-python-engineer-company-xyz --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; carries each hit's full description |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total", "total_pages" }, "results": [...] }`;
each result carries at least `id`, `title`, `company`, `location`, `date`,
`url`, `modality`, `country`, `seniority`, `category`, `salary_min`, `salary_max`,
and `description`. `table` and `plain` omit the description (too verbose for lists).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Residency restrictions (country-gated remote)

`remote: true` / `country: Remote` does **not** mean "applyable anywhere". GetOnBoard
posts that are 100% remote can still restrict candidates by residence country or zone.
Always check this before presenting a remote posting to the candidate — the restriction
is invisible in the search list and only surfaces on the Apply button.

How to detect it:

- The search API exposes `modality` (`remote_local` = remote with residence restriction,
  `fully_remote` = remote anywhere) and `location_tenants` (IDs of allowed zones/countries).
  **There is no endpoint that maps tenant IDs to names** — `/api/v0/location_tenants`,
  `/api/v0/tenants` and `/api/v0/location_tenants/<id>` all return 404, and `include=`
  does not work for `location_tenants`. Treat the tenant IDs as an opaque signal only.
- The restriction text lives only in the public page HTML:
  `<span class="tooltipster" title="Position is 100% remote, but candidates must reside in ...">`
  — or `"Candidates can reside anywhere in the world."` when unrestricted. Grep that
  attribute from the page to get the exact wording.
- **Fetch the page with `curl -L`.** A bare `curl -s` on `https://www.getonbrd.com/jobs/<slug>`
  returns 0 bytes: the URL 301-redirects to a category-prefixed path (`/jobs/<category>/<slug>`).
  Follow redirects or the page is empty.

Classification for a candidate based in Venezuela:

| Tooltip text | Verdict |
|---|---|
| `Candidates can reside anywhere in the world.` | Pass |
| Region list that includes Venezuela — e.g. `South America, Central America or Mexico` | Pass for a Venezuela candidate, but worth a visible flag (technically eligible, may fail in practice) |
| Explicit country list that does not include Venezuela — e.g. `Chile, Argentina, Peru, Colombia, Mexico...` | Not applyable — exclude or flag as a hard filter |
| `must reside in <single country>` | Not applyable |

A residency filter (enrichment + veto/flag in `score_pool.py`) was **not yet built**;
when it is, decide veto-vs-flag with the user first (they approved the analysis, not the
implementation). Cache the fetched pages on disk so a re-run does not re-fetch each posting.

## Notes

- Data is from GetOnBoard's public API (`www.getonbrd.com/api/v0/search/jobs`).
- `id` in search results is the public slug — pass it as-is to `detail`.
- `date` is the posting date as `YYYY-MM-DD` (from API's `published_at` timestamp).
- Salary fields keep their period when GetOnBoard records one (`CLP 2000000-2200000/month`);
  compare pay only in one period.
- Facet values are controlled vocabularies. Use `/api/v0/search/jobs/facets` (if exposed)
  to see live values with counts for a query before filtering.
- The API may rate-limit; the CLI retries 429/5xx with exponential backoff.