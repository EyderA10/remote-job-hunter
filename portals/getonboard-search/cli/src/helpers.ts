// GetOnBoard API + public-page client. No authentication required.
//
// Two data paths, because the API is asymmetric:
//   * /api/v0/search/jobs    -> search + FULL descriptions, but company as an id only
//   * /api/v0/companies/<id> -> company name (one call per company; disk-cached)
//   * the public job page    -> og:title carries the real company name
//                               ("<role> at <Company> (via <agency>) - <location>")
//                               and the body carries the full rich-text sections.
//
// So `search` resolves company names through the companies endpoint (deduped,
// cached) and `detail` reads the public page, which also works for postings that
// have closed and dropped out of search.

export const SEARCH_URL = "https://www.getonbrd.com/api/v0/search/jobs"
export const COMPANIES_URL = "https://www.getonbrd.com/api/v0/companies"
export const PUBLIC_JOB = "https://www.getonbrd.com/jobs"

export const UA = "Mozilla/5.0 (compatible; getonboard-search-cli/1.0)"

// ---- skill root discovery (for the company-name cache) -------------------
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

export function skillRoot(): string {
  let dir = dirname(import.meta.dir)
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "state", "seen_jobs.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function companyCachePath(): string {
  return join(skillRoot(), "state", "getonboard-companies.json")
}

// ---- HTTP ---------------------------------------------------------------
const MAX_RETRIES = 5

export async function fetchJson(url: string): Promise<any> {
  let delay = 500
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) throw new Error(`Request failed: ${response.status}`)
      await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 400)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) throw new Error("Not found (404)")
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export async function fetchText(url: string): Promise<string> {
  let delay = 500
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) throw new Error(`Request failed: ${response.status}`)
      await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 400)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) throw new Error("Not found (404)")
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---- company-name cache -------------------------------------------------
export type CompanyCache = Record<string, { name: string; slug: string | null }>

export function loadCompanyCache(): CompanyCache {
  try {
    return JSON.parse(readFileSync(companyCachePath(), "utf-8")) as CompanyCache
  } catch {
    return {}
  }
}

export function saveCompanyCache(cache: CompanyCache): void {
  const p = companyCachePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(cache, null, 2))
}

export async function resolveCompanyNames(ids: number[]): Promise<CompanyCache> {
  const cache = loadCompanyCache()
  const missing = [...new Set(ids)].filter(id => !cache[String(id)])
  for (const id of missing) {
    try {
      const data = await fetchJson(`${COMPANIES_URL}/${id}`)
      const attrs = data?.data?.attributes ?? {}
      cache[String(id)] = { name: attrs.name ?? `company-${id}`, slug: data?.data?.id ?? null }
    } catch {
      cache[String(id)] = { name: `company-${id}`, slug: null }
    }
  }
  if (missing.length) saveCompanyCache(cache)
  return cache
}

// ---- HTML helpers -------------------------------------------------------
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
      if (body[0] === "#") {
        const cp = body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole
      }
      const named = ENTITIES[body.toLowerCase()]
      return named ?? whole
    })
}

export function stripHtml(text: string): string {
  return decodeHtmlEntities(
    text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h1|h2|h3|h4|div|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  )
}

export function metaContent(html: string, property: string): string | null {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(
    `<meta[^>]*(?:property|name)="${esc}"[^>]*content="([^"]*)"` +
      `|<meta[^>]*content="([^"]*)"[^>]*(?:property|name)="${esc}"`,
    "i"
  )
  const m = re.exec(html)
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? "") : null
}

/** Parse "Semi Senior Java Developer / ETL at Equifax (via 23people) - Remote (work from home)". */
export function parseOgTitle(title: string): { role: string | null; company: string | null; location: string | null } {
  const at = title.indexOf(" at ")
  const role = at > 0 ? title.slice(0, at).trim() : null
  let rest = at > 0 ? title.slice(at + 4) : title
  const dash = rest.lastIndexOf(" - ")
  const location = dash > 0 ? rest.slice(dash + 3).trim() : null
  if (dash > 0) rest = rest.slice(0, dash)
  const via = rest.match(/\s*\(via\s+([^)]+)\)\s*$/)
  const company = via ? rest.slice(0, via.index).trim() : rest.trim()
  return { role, company: company || null, location }
}

/** Extract a balanced <div> whose opening tag starts at `start`. Returns inner HTML. */
export function balancedDiv(html: string, start: number): string | null {
  const openEnd = html.indexOf(">", start)
  if (openEnd === -1) return null
  let i = openEnd + 1
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      if (depth === 0) return html.slice(openEnd + 1, nextClose)
      i = nextClose + 6
    }
  }
  return null
}

/** All inner contents of elements carrying `class~=cls`, in document order. */
export function extractByClass(html: string, cls: string): string[] {
  const re = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "gi")
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase()
    if (tag !== "div") continue
    const inner = balancedDiv(html, m.index)
    if (inner != null) out.push(inner)
  }
  return out
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export function timestampToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0]
}

/** GetOnBoard reports salary in thousands of the local currency (2000 -> 2,000,000 CLP). */
export function salaryToString(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null
  const scale = (n: number | null) => (n === null ? null : n * 1000)
  const lo = scale(min), hi = scale(max)
  if (lo !== null && hi !== null) return `${lo.toLocaleString("es-CL")}-${hi.toLocaleString("es-CL")}`
  return `${(lo ?? hi ?? 0).toLocaleString("es-CL")}`
}
