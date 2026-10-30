# Portal Onboarding Guide

Every job board lives in `portals/<name>-search/` as a small Bun + TypeScript
CLI, and `scripts/scrape-all.sh` runs every enabled portal and merges the JSON
pools into one file for scoring.

This guide walks through adding a new board. Before writing any code, probe the
board: **reachability is a property of the network path, not of the API.**

## 1. Probe the board

```bash
curl -s -o /dev/null -w "%{http_code}" "https://example-board.com/api/jobs"
```

| Result | Meaning |
|---|---|
| `200` with a parseable payload | Ship it — but parse the payload before calling it done |
| `401` / `403` | OAuth-walled or WAF-blocked (Cloudflare). Either needs the user's own credentials or is unusable — document it and stop |
| DNS failure / `000` | Wrong host or path; try alternate hostnames before dropping it |

Known-blocked boards (verified live, do not re-attempt without a change):
freehire.me (403, Cloudflare), Indeed/Glassdoor (403), InfoJobs (401, OAuth).

## 2. Scaffold the CLI

Copy the shape of an existing portal (see `portals/remoteok-search/` — it is the
smallest). A CLI implements two commands:

```bash
bun run portals/<name>-search/cli/src/cli.ts search --query "node" --format json
bun run portals/<name>-search/cli/src/cli.ts detail <id|url> --format plain
```

The authoring contract (output schema, argument parsing, robots.txt etiquette)
is described in `references/portal-cli-authoring.md`.

## 3. Register it in scrape-all.sh

Add a case to `scripts/scrape-all.sh` mapping the portal name to its CLI and
its flags (job age, remote filter, location). Keep per-portal volume low —
rate limits are a Terms-of-Service matter, not a bug to engineer around.

## 4. Make scoring accept it

`scripts/score_pool.py` normalises each posting's fields (title, company,
location, description, url, date). If your board uses a different field name or
a location vocabulary of its own (We Work Remotely, for example, says
"Anywhere in the World"), add the mapping in the normalisation step and, if
needed, an exception in the veto checks — with a comment explaining why.
