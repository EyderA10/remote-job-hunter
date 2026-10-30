# Authoring a portal CLI

How to build a new job-portal CLI under `portals/` so `/scrape`, `/rank` and `/apply` treat it like the shipped ones.

## Contract

Every portal CLI speaks the same shape. Match it or the pipeline forks.

- `search [flags] --format json|table|plain` → `{ "meta": {...}, "results": [...] }`
- `detail <slug|url> --format json|plain` → a single result object
- `--format json` MUST carry the full posting text — `/scrape` and `/rank` must not need a per-hit detail loop
- Every result carries at least: `id`, `title`, `company`, `location`, `date` (YYYY-MM-DD), `url`
- Errors go to **stderr** as `{ "error": "...", "code": "..." }` and exit non-zero
- `enabled: false` in the portal's `SKILL.md` frontmatter removes it from a run (reported as skipped, never silently dropped)

## Bun + TypeScript setup

```jsonc
// tsconfig.json — the two starred flags are what make `bun run src/cli.ts` work
{
  "compilerOptions": {
    "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
    "types": ["bun"], "strict": true, "noEmit": true, "skipLibCheck": true,
    "allowImportingTsExtensions": true,   // ← required
    "verbatimModuleSyntax": true          // ← required
  },
  "include": ["src/**/*.ts"]
}
```

- **Imports carry the real `.ts` extension** (`from "../helpers.ts"`), and the path is relative to the *importing file*. `./helpers.ts` from `src/commands/` is wrong — it is `../helpers.ts`. A `Cannot find module './helpers.js'` failure means the extension or the depth is wrong, not that Bun is broken.
- **`node_modules` is not needed at runtime.** Bun executes `.ts` directly and the CLI has zero runtime deps; `node_modules` holds only TypeScript dev types. Remove it to keep the skill lean — the CLI still runs. Restore with `bun install` only if you want to run the upstream test suite.
- Split into `helpers.ts` (fetch, retry, HTML/entity helpers), `commands/search.ts`, `commands/detail.ts`, and `cli.ts` (flag parsing + dispatch). Keep flag parsing in one `parseFlags` with a short-alias map and a `KNOWN_FLAGS` allowlist per command.

## Fetching

- Retry 429/5xx with exponential backoff + jitter (500ms → 8s, ~5 attempts).
- Send a browser-ish `User-Agent`. Several boards serve a different body to curl's default UA.
- Bound every request: timeout (15–25s), redirect cap, and a byte cap applied *after* decompression.
- Treat 404 as "not found", not as a transport failure — the caller reports those differently.

## HTML parsing

- **Track div depth; never regex a nested `<div>`.** A non-greedy `/(<div[^>]*>)(.*?)(<\/div>)/s` match swallows the rest of the page, because the first `</div>` it meets is not the matching one — you get one giant garbage section. Walk the string counting `<div` vs `</div>` and slice at the index where depth returns to zero.
- **Label content blocks by their own text, not by a preceding heading.** Modern server-rendered pages often emit body sections as a flat run of rich-text divs with headings elsewhere in the DOM; a heading-sibling regex produces one garbage blob. Match on the section's own opening words instead.
- **Entity decoding must handle numeric references.** `&#39;`, `&#xE9;`, `&nbsp;` and `&amp;` all appear; a named-entity-only decoder leaves `&#39;` literal in the output.

## Data quirks worth handling

- **UTF-8 decoded as Latin-1 (mojibake).** Some APIs ship `Sothebyâ€™s` where the source is `Sotheby's`. Detect the `[\u0080-\u00ff]` signature and re-decode `Buffer.from(s, "latin1").toString("utf8")` — but only when every code point is < 0x100, and revert to the original if the result contains U+FFFD. Guard the guard: a genuine non-Latin-1 string must never be corrupted.
- **Salary in thousands.** GetOnBoard reports `2000` meaning 2,000,000 CLP. Scale before display and say so in the field name.
- **Absent salary is not zero.** RemoteOK returns `0-0`; render it as `null`, never as a fake `0-0` range.
- **No detail endpoint.** Some boards expose only search. `detail` then reads the public page; its `og:title` often carries the real company name — including staffing agencies, as `<role> at <Company> (via <Agency>) - <location>` — which the search payload omits. This is also the only route that still resolves postings that have closed and dropped out of search.
- **Hostname matters.** A service's API host can fail DNS while its `www` host serves `/api/...` fine. Try alternate hostnames before concluding the service is down.

## Verify before declaring it done

1. `search` with a real query, `--limit 3`, `--format json` — parse the JSON and confirm the fields the pipeline needs are non-null (not just that the request returned 200).
2. `detail` on one hit, by slug AND by full URL.
3. A deliberate failure: a bogus slug exits non-zero with a clean `{ "error", "code" }` message, not a stack trace.
4. Run `scripts/scrape-all.sh` and confirm the new portal reports `ok:true`.
