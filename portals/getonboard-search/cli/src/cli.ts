#!/usr/bin/env bun
// GetOnBoard CLI — search jobs on getonbrd.com (Spain, LatAm, remote).
// No auth, no API key, zero runtime deps — runs with just `bun`.
//
//   bun run src/cli.ts search [flags]
//   bun run src/cli.ts detail <slug|url> [--format json|plain]
//
// Search returns the FULL posting text (requirements, functions, benefits,
// desirable skills) — no per-hit detail loop needed. `detail` reads the public
// job page, so it also works for postings that have closed and dropped out of
// search.

import { runSearch, formatTable, formatPlain, type SearchOpts } from "./commands/search.ts"
import { runDetail, formatDetail, extractSlug } from "./commands/detail.ts"
import { writeError } from "./helpers.ts"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "country", n: "limit" }
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

const HELP = `getonboard-cli — search jobs on GetOnBoard (Spain, LatAm, remote)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>        Keywords (job title, skill, or role). Optional.
  --country <codes>         ISO-3166 alpha-2, comma-separated: ES,CL,CO,MX,PE,AR.
  --remote <mode>           remote | hybrid | onsite (comma-separate for OR).
  --category <names>        Job category (comma-separate for OR). Values from
                            /api/v0/categories, e.g. backend, frontend, data-science.
  --seniority <levels>      junior | semi-senior | senior | expert | lead | manager
                            (comma-separate for OR).
  --jobage <days>           Posted within N days.
  --page <n>                1-indexed page. Default 1.
  --limit, -n <n>           Results per page (max 50). Default 20.
  --no-company              Skip resolving company names (faster; company = id).
  --format <fmt>            json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "backend" --country ES --seniority senior --format table
  bun run src/cli.ts search -q "python" --country CL,CO --remote remote --format table
  bun run src/cli.ts search --category data-science --jobage 14 --format table
  bun run src/cli.ts detail data-engineer-gcp-ssr-tcit-santiago --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "country", "remote", "category", "seniority", "jobage",
    "page", "limit", "format", "no-company", "help", "h",
  ]),
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

  if (!cmd) {
    console.log(HELP)
    return 2
  }
  if (flags.help || flags.h) {
    console.log(HELP)
    return 0
  }

  if (cmd === "search") {
    for (const k of Object.keys(flags)) {
      if (k !== "_" && !KNOWN_FLAGS.search.has(k)) return fail(`Unknown flag: --${k}`, "BAD_ARG")
    }
    const opts: SearchOpts = {
      query: flags.query as string | undefined,
      country: flags.country as string | undefined,
      remote: flags.remote as string | undefined,
      category: flags.category as string | undefined,
      seniority: flags.seniority as string | undefined,
      jobage: flags.jobage ? Number(flags.jobage) : undefined,
      page: flags.page ? Number(flags.page) : undefined,
      limit: flags.limit ? Number(flags.limit) : undefined,
      resolveCompanies: !flags["no-company"],
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
      extractSlug(idOrUrl) // validates the input before spending a request
      const d = await runDetail({ idOrUrl })
      const fmt = (flags.format as "json" | "plain") ?? "plain"
      console.log(formatDetail(d, fmt))
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
