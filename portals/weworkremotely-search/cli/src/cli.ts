#!/usr/bin/env bun
// We Work Remotely CLI — search remote jobs via public RSS feeds. No auth, zero deps.
//
//   bun run src/cli.ts search [flags]
//   bun run src/cli.ts detail <slug|url> [--format json|plain]
//
// WWR has no server-side search: each category publishes an RSS feed and all
// filtering (query, region, company, jobage) happens client-side over the feed.
// Hand-rolled flag parser (NOT util.parseArgs): Bun 1.3.14 ignores the
// `allowPositionals` option and rejects positional args like `search`.
// Same contract as remoteok-search: `bun run src/cli.ts search -q ... --format json`.

import { runSearch, formatTable, formatPlain, type SearchOpts } from "./commands/search.ts"
import { runDetail, extractSlug } from "./commands/detail.ts"
import { writeError } from "./helpers.ts"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit", l: "location" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || (a.startsWith("-") && a.length === 2)) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `wwr-cli — search remote jobs on We Work Remotely (public RSS)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Keywords (AND semantics per token).
  --region <text>        Region filter, e.g. "Anywhere in the World", "Americas".
  --category <slug>      Restrict to one feed: remote-programming-jobs,
                         remote-full-stack-programming-jobs,
                         remote-back-end-programming-jobs,
                         remote-front-end-programming-jobs,
                         remote-devops-sysadmin-jobs.
  --company <text>       Company name substring (title prefix "Company:").
  --location <text>      Accepted for scrape-all parity; ignored (remote-only board).
  --jobage <days>        Posted within N days.
  --limit, -n <n>        Cap results emitted.
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "full stack" --format table
  bun run src/cli.ts search -q "laravel" --jobage 3 --limit 10
  bun run src/cli.ts detail typeform-full-stack-developer --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "region", "category", "company", "location", "jobage", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h", "id"]),
}

function fail(message: string, code: string): number {
  writeError(message, code)
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd) { console.log(HELP); return 2 }
  if (flags.help || flags.h) { console.log(HELP); return 0 }

  if (cmd === "search") {
    for (const k of Object.keys(flags)) {
      if (k !== "_" && !KNOWN_FLAGS.search.has(k)) return fail(`Unknown flag: --${k}`, "BAD_ARG")
    }
    const opts: SearchOpts = {
      query: flags.query as string | undefined,
      region: flags.region as string | undefined,
      category: flags.category as string | undefined,
      company: flags.company as string | undefined,
      location: flags.location as string | undefined, // parity; ignored
      jobage: flags.jobage ? Number(flags.jobage) : undefined,
      limit: flags.limit ? Number(flags.limit) : undefined,
    }
    try {
      const result = await runSearch(opts)
      const fmt = (flags.format as "json" | "table" | "plain") ?? "json"
      if (fmt === "table") console.log(formatTable(result.results))
      else if (fmt === "plain") for (const j of result.results) { console.log(formatPlain(j)); console.log("====") }
      else console.log(JSON.stringify(result, null, 2))
      return 0
    } catch (e) {
      return fail((e as Error).message, "REQUEST_FAILED")
    }
  }

  if (cmd === "detail") {
    for (const k of Object.keys(flags)) {
      if (k !== "_" && !KNOWN_FLAGS.detail.has(k)) return fail(`Unknown flag: --${k}`, "BAD_ARG")
    }
    // scrape-all contract detail calls may pass the id as --id <slug>
    const idOrUrl = (flags._ as string[])[1] ?? (flags.id as string | undefined)
    if (!idOrUrl) return fail("Missing job slug or URL", "BAD_ARG")
    try {
      const slug = extractSlug(idOrUrl)
      const j = await runDetail(slug)
      const fmt = (flags.format as "json" | "plain") ?? "json"
      console.log(fmt === "plain"
        ? `${j.company}: ${j.title}\n${j.category || ""} | ${j.date}\n${j.url}\n\n${j.description}`
        : JSON.stringify(j, null, 2))
      return 0
    } catch (e) {
      const msg = (e as Error).message
      return fail(msg, /not found/i.test(msg) ? "NOT_FOUND" : "REQUEST_FAILED")
    }
  }

  return fail(`Unknown command: ${cmd}`, "BAD_CMD")
}

main().then(code => process.exit(code)).catch(e => {
  writeError((e as Error).message, "UNEXPECTED")
  process.exit(1)
})
