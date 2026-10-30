// We Work Remotely RSS client. Public, unauthenticated, no API key.
//
// WWR exposes per-category RSS feeds at /categories/<slug>.rss (the full-site
// /jobs.rss is WAF-blocked, 403). There is no server-side search, so every query
// is a client-side filter over the fetched feeds. Each feed carries the latest
// ~25 postings; the union of five programming-related feeds is the working set.
// Items are HTML-escaped text (no CDATA), titles are "Company: Job Title", and
// each item carries a <region> field from WWR's fixed vocabulary.

export const FEEDS = [
  "remote-programming-jobs",
  "remote-full-stack-programming-jobs",
  "remote-back-end-programming-jobs",
  "remote-front-end-programming-jobs",
  "remote-devops-sysadmin-jobs",
] as const

export const BASE = "https://weworkremotely.com"
export const UA = "Mozilla/5.0 (compatible; weworkremotely-search-cli/1.0)"

export interface FeedItem {
  title: string        // raw RSS title, "Company: Job Title"
  company: string
  jobTitle: string
  region: string       // WWR's fixed region vocabulary
  location: string     // same as region — merged into the pool as the job's location
  category: string     // e.g. "Full-Stack Programming"
  url: string          // https://weworkremotely.com/remote-jobs/<slug>
  id: string           // slug
  date: string         // YYYY-MM-DD
  description: string  // full posting text, tags stripped
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/**
 * Decode HTML entities including numeric references (&#39;, &#xE9;) — a
 * named-entity-only decoder leaves the numeric ones literal in the output.
 */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
    "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“", "&hellip;": "…",
  }
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|mdash|ndash|rsquo|lsquo|rdquo|ldquo|hellip);/g,
             (m) => named[m] ?? m)
    .replace(/&amp;/g, "&")  // second pass: decoded "&amp;lt;" became "&lt;" above
}

export function stripHtml(text: string): string {
  return decodeEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h1|h2|h3|h4|div|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * WWR serves UTF-8 bytes decoded as Latin-1 somewhere upstream ("Sothebyâ€™s").
 * Detect the signature and re-decode; revert when the result contains U+FFFD or
 * the input carries genuine non-Latin-1 code points.
 */
export function fixMojibake(s: string | null | undefined): string {
  if (!s) return ""
  if (!/[\u0080-\u00ff]/.test(s)) return s
  if ([...s].some(c => c.charCodeAt(0) > 0xff)) return s
  const out = Buffer.from(s, "latin1").toString("utf8")
  return out.includes("\ufffd") ? s : out
}

/** RFC 2822 pubDate ("Sat, 10 Oct 2026 07:31:08 +0000") → "2026-10-10". */
export function rfc2822ToISO(s: string): string {
  const d = new Date(s.trim())
  if (isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

/** Slug from a job URL: ".../remote-jobs/typeform-full-stack-developer". */
export function slugFromUrl(url: string): string {
  const m = url.match(/\/remote-jobs\/([^/?#]+)/)
  return m ? m[1] : url
}

/** "Company: Job Title" → { company, jobTitle }. First colon splits. */
export function splitTitle(raw: string): { company: string; jobTitle: string } {
  const i = raw.indexOf(": ")
  if (i < 0) return { company: "", jobTitle: raw.trim() }
  return { company: raw.slice(0, i).trim(), jobTitle: raw.slice(i + 2).trim() }
}

/** One RSS <item> block → FeedItem, or null when the block is not a job. */
export function parseItem(block: string): FeedItem | null {
  const tag = (name: string): string => {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))
    return m ? m[1] : ""
  }
  const link = tag("link").trim() || tag("guid").trim()
  if (!link.includes("/remote-jobs/")) return null
  const rawTitle = decodeEntities(tag("title")).trim()
  const { company, jobTitle } = splitTitle(rawTitle)
  return {
    title: rawTitle,
    company: fixMojibake(company),
    jobTitle: fixMojibake(jobTitle),
    region: decodeEntities(tag("region")).trim(),
    location: decodeEntities(tag("region")).trim(), // region doubles as location in the pool
    category: decodeEntities(tag("category")).trim(),
    url: link,
    id: slugFromUrl(link),
    date: rfc2822ToISO(tag("pubDate")),
    description: stripHtml(tag("description")),
  }
}

async function fetchOnce(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  })
  if (response.status === 429 || response.status >= 500) throw new Error(`retryable:${response.status}`)
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return await response.text()
}

/** Fetch one feed with 429/5xx backoff + jitter (500ms → 8s, ~5 attempts). */
export async function fetchFeed(slug: string): Promise<string> {
  const url = `${BASE}/categories/${slug}.rss`
  let delay = 500
  for (let attempt = 0; attempt <= 5; attempt++) {
    try {
      return await fetchOnce(url)
    } catch (e) {
      const retryable = String((e as Error).message).startsWith("retryable:")
      if (!retryable || attempt === 5) throw new Error(`${slug}: ${(e as Error).message.replace("retryable:", "")}`)
      await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 400)))
      delay = Math.min(delay * 2, 8000)
    }
  }
  throw new Error(`${slug}: max retries`)
}

/** Fetch all programming feeds, parse items, dedupe by URL (feed order first wins). */
export async function fetchAllItems(): Promise<FeedItem[]> {
  const bodies = await Promise.all(FEEDS.map(s => fetchFeed(s)))
  const byUrl = new Map<string, FeedItem>()
  for (const body of bodies) {
    for (const block of body.split(/<item>/).slice(1)) {
      const item = parseItem(block.split("</item>")[0])
      if (item && !byUrl.has(item.url)) byUrl.set(item.url, item)
    }
  }
  return [...byUrl.values()]
}
