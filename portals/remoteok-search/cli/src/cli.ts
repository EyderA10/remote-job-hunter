#!/usr/bin/env bun
// RemoteOK CLI — search remote tech jobs. Public API, no auth, zero deps.
//
//   bun run src/cli.ts search [flags]
//   bun run src/cli.ts detail <slug|url> [--format json|plain]
//
// RemoteOK serves the whole live board (~100 postings) in one request, so all
// filtering happens client-side.

import { runSearch, formatTable, formatPlain, type SearchOpts } from "./commands/search.ts"
import { runDetail, formatDetail, extractSlug } from "./commands/detail.ts"
import { writeError } from "./helpers.ts"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
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

const HELP = `remoteok-cli — search remote tech jobs on RemoteOK

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Keywords (title, company, tags, description).
  --tag <tags>           Tag filter, comma-separate for OR: golang,senior.
  --all-tags             Require EVERY listed tag (default: ANY).
  --company <text>       Company name substring.
  --location <text>      Location substring (RemoteOK tags city names).
  --jobage <days>        Posted within N days.
  --limit, -n <n>        Cap results emitted.
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "golang" --tag senior --format table
  bun run src/cli.ts search -q "platform engineer" --jobage 7 --limit 10
  bun run src/cli.ts detail remote-senior-software-engineer-sothebys-1137545 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "tag", "all-tags", "company", "location", "jobage", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
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
      tag: flags.tag as string | undefined,
      company: flags.company as string | undefined,
      location: flags.location as string | undefined,
      jobage: flags.jobage ? Number(flags.jobage) : undefined,
      limit: flags.limit ? Number(flags.limit) : undefined,
      allTags: Boolean(flags["all-tags"]),
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
    const idOrUrl = (flags._ as string[])[1]
    if (!idOrUrl) return fail("Missing job slug or URL", "BAD_ARG")
    try {
      extractSlug(idOrUrl)
      const j = await runDetail({ idOrUrl })
      const fmt = (flags.format as "json" | "plain") ?? "plain"
      console.log(formatDetail(j, fmt))
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
