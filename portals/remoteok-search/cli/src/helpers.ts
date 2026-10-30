// RemoteOK API client. Public, unauthenticated, no API key.
//
// The API serves the full live board as one JSON array (~100 postings) at
// https://remoteok.com/api — there is no server-side search or filter, so every
// query is a client-side filter over one fetch. The first array element is a
// legal-notice object, not a job.

export const API_URL = "https://remoteok.com/api"
export const UA = "Mozilla/5.0 (compatible; remoteok-search-cli/1.0)"

export interface Job {
  slug: string
  id: string
  epoch: number
  date: string
  company: string
  company_logo: string
  position: string
  tags: string[]
  description: string
  location: string
  apply_url: string
  salary_min: number
  salary_max: number
  logo: string
  url: string
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/**
 * RemoteOK serves UTF-8 bytes that have been decoded as Latin-1 somewhere upstream,
 * so "Sotheby's" arrives as "Sothebyâ€™s" (U+00E2 U+0080 U+0099). Detect that
 * signature and re-decode. Returns the input unchanged when it is already clean
 * or contains genuine non-Latin-1 characters (which cannot be round-tripped).
 */
export function fixMojibake(s: string | null | undefined): string {
  if (!s) return ""
  if (!/[\u0080-\u00ff]/.test(s)) return s
  if ([...s].some(c => c.charCodeAt(0) > 0xff)) return s
  const out = Buffer.from(s, "latin1").toString("utf8")
  return out.includes("\ufffd") ? s : out
}

/** The API returns salary as 0-0 when the posting states none. */
export function salaryToString(min: number | null | undefined, max: number | null | undefined): string | null {
  if (!min && !max) return null
  const lo = min ? min.toLocaleString("en-US") : "?"
  const hi = max ? max.toLocaleString("en-US") : "?"
  return `${lo}-${hi} USD/yr`
}

export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h1|h2|h3|h4|div|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function fetchBoard(): Promise<Job[]> {
  let delay = 500
  for (let attempt = 0; attempt <= 5; attempt++) {
    const response = await fetch(API_URL, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 5) throw new Error(`Request failed: ${response.status}`)
      await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 400)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    const data = await response.json()
    // Element 0 is the API terms notice; everything after it is a job.
    return (Array.isArray(data) ? data : []).filter(
      (j: any) => j && typeof j === "object" && "position" in j && "slug" in j
    ) as Job[]
  }
  throw new Error("Request failed after max retries")
}
