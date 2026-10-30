---
name: weworkremotely-search
version: 1.0.0
description: >
  Search live remote tech jobs from We Work Remotely's public RSS feeds.
  Covers full-stack, back-end, front-end and DevOps programming categories —
  all postings are remote. No auth, no API key, zero runtime deps — runs with
  just `bun`. Trigger phrases: find a remote job on We Work Remotely, WWR
  remote jobs, remote programming jobs, look up this WWR posting.
context: fork
enabled: true
allowed-tools: Bash(bun run portals/weworkremotely/cli/src/cli.ts *)
---

# We Work Remotely Search Skill

Search live remote job listings from **[We Work Remotely](https://weworkremotely.com)**
via its **public RSS feeds** — no authentication, no API key, and **zero runtime
dependencies** (just `bun`).

## When to use this skill

- Search for remote programming jobs by keyword, region, company, or category
- Filter by recency (posted within N days)
- Get the full description of a specific WWR posting

## How it works

WWR has **no server-side search**: each category publishes an RSS feed and all
filtering (query, region, company, jobage) happens client-side over the feed
items. The CLI fetches all five programming feeds in parallel, de-duplicates by
URL, and filters in memory. One run = 5 feed fetches.

## Commands

### Search job listings

```bash
bun run portals/weworkremotely/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords matched against title, company, and description. Optional.
- `--region <text>` — region substring, e.g. `Anywhere in the World`, `Americas Only`.
- `--category <slug>` — restrict to one feed (see slugs below).
- `--company <text>` — company name substring (feed titles are `Company: Title`).
- `--location <text>` — accepted for scrape-all parity; **ignored** (remote-only board).
- `--jobage <days>` — posted within N days.
- `--limit <n>` / `-n <n>` — cap results emitted.
- `--format json|table|plain` — default `json`.

Category slugs:
- `remote-programming-jobs` (all programming)
- `remote-full-stack-programming-jobs`
- `remote-back-end-programming-jobs`
- `remote-front-end-programming-jobs`
- `remote-devops-sysadmin-jobs`

### Fetch full job detail

```bash
bun run portals/weworkremotely/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the URL slug (e.g. `typeform-full-stack-developer`). You may also pass a
full `https://weworkremotely.com/remote-jobs/<slug>` URL.

**Detail resolves from the RSS feeds, not the HTML page.** The posting page sits
behind a Cloudflare challenge ("Just a moment..."), so the CLI never fetches it.
The RSS `<description>` carries the full posting body, so detail returns the same
data a page fetch would — company, title, region, category, date, URL, and the
complete description. If the slug is not in any current feed (postings age out
after ~1 week), the CLI exits with a `NOT_FOUND` error rather than guessing.

## Usage examples

```bash
# Laravel roles, table view
bun run portals/weworkremotely/cli/src/cli.ts search -q "laravel" --format table

# Back-end roles posted in the last 3 days
bun run portals/weworkremotely/cli/src/cli.ts search --category remote-back-end-programming-jobs --jobage 3

# Anywhere-in-the-world roles only
bun run portals/weworkremotely/cli/src/cli.ts search -q "full stack" --region "Anywhere in the World"

# Full details for a specific job
bun run portals/weworkremotely/cli/src/cli.ts detail typeform-full-stack-developer --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; carries each hit's full description |
| `table` | Quick human-readable scanning (title/company/region/date) |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "total", "note" }, "results": [...] }`; each
result carries `id` (URL slug), `title`, `company`, `jobTitle`, `region`,
`category`, `date` (`YYYY-MM-DD`), `url`, and `description`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- **Region is a residence proxy, not a legal filter** — treat `Anywhere in the World`
  as confirmed-applyable; region strings like `Americas Only` or `Europe Only` still
  need a per-posting description check for Venezuela eligibility (same discipline as
  GetOnBoard residence enrichment).
- **Salary is not exposed** in WWR feeds — the CLI emits `salary: null` rather than
  a fake range.
- The feed's `<title>` is `Company: Job Title` — `splitTitle` in `cli/src/helpers.ts`
  separates them; if a title has no colon separator, the whole string stays in `title`
  and `company` is empty (rare; fall back to the detail lookup).
- Feeds are mojibake-prone the same way RemoteOK's API is — `fixMojibake` handles the
  re-decode; do not strip `â`/`Ã` sequences.
- WWR RSS terms ask that you credit We Work Remotely as a source when redistributing.
