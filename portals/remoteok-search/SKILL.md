---
name: remoteok-search
version: 1.0.0
description: >
  Search live remote tech jobs from RemoteOK's public API. Covers software,
  data, DevOps, product, design and more — all postings are remote. No auth, no
  API key, zero runtime deps — runs with just `bun`. Trigger phrases: find a
  remote job, remote developer jobs, remote tech jobs, work from home tech,
  "any remote X jobs", look up this RemoteOK posting.
context: fork
enabled: true
allowed-tools: Bash(bun run portals/remoteok-search/cli/src/cli.ts *)
---

# RemoteOK Search Skill

Search live remote job listings from **[RemoteOK](https://remoteok.com)** — a
long-running remote-only job board. No authentication, no API key, and **zero
runtime dependencies** — it runs with just `bun`.

## When to use this skill

- Search for remote job openings by keyword, tag, company, or location
- Filter by recency (posted within N days)
- Get the full description of a specific RemoteOK posting

## Commands

### Search job listings

```bash
bun run portals/remoteok-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords matched against title, company, tags, and description. Optional.
- `--tag <tags>` — tag filter, comma-separated for OR (e.g. `--tag golang,senior`).
- `--all-tags` — require **every** listed tag (default is any).
- `--company <text>` — company name substring.
- `--location <text>` — location substring (RemoteOK tags city names).
- `--jobage <days>` — posted within N days.
- `--limit <n>` / `-n <n>` — cap results emitted.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run portals/remoteok-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the `id` from a `search` result (e.g. `remote-senior-software-engineer-sothebys-1137545`).
You may also pass a full `https://remoteok.com/remote-jobs/<slug>` URL.

## Usage examples

```bash
# Senior Go roles, table view
bun run portals/remoteok-search/cli/src/cli.ts search -q "golang" --tag senior --format table

# Platform engineer roles posted in the last 7 days
bun run portals/remoteok-search/cli/src/cli.ts search -q "platform engineer" --jobage 7 --limit 10

# Roles requiring BOTH golang and kubernetes
bun run portals/remoteok-search/cli/src/cli.ts search --tag golang,kubernetes --all-tags --format table

# Full details for a specific job
bun run portals/remoteok-search/cli/src/cli.ts detail remote-senior-software-engineer-sothebys-1137545 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; carries each hit's full description |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "total", "note" }, "results": [...] }`; each
result carries `id`, `title`, `company`, `location`, `tags`, `date`, `url`,
`apply_url`, `salary_min`, `salary_max`, `salary`, and `description`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- **RemoteOK serves the whole live board** (~100 postings) in one request — there is no
  server-side search, so every filter is applied client-side. One fetch per run.
- `id` is the URL slug — pass it as-is to `detail`.
- `date` is `YYYY-MM-DD` from the API's ISO timestamp.
- **Salary is often absent**: the API reports `0-0` when the posting states none, which
  the CLI renders as `null` rather than a fake range. Treat salary as indicative only.
- `detail` reads the live board, so a posting that has closed is reported as not found
  rather than silently returning a different job.
- RemoteOK's API terms ask you to link back and credit RemoteOK as a source.
- **The API ships mojibake.** UTF-8 bytes decoded as Latin-1 upstream, so `Sotheby's` arrives as `Sothebyâ€™s`. The CLI re-decodes it (`fixMojibake` in `cli/src/helpers.ts`). If you see `â`/`Ã` sequences in output, that function is what handles it — do not strip the characters, re-decode them.