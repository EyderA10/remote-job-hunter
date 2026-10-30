import { fetchAllItems, type FeedItem } from "../helpers.ts"

export interface SearchOpts {
  query?: string
  region?: string
  category?: string
  company?: string
  location?: string // accepted for scrape-all parity; ignored (remote-only board)
  jobage?: number
  limit?: number
}

export interface SearchResult {
  meta: { count: number; page: number; total: number; total_pages: number }
  results: FeedItem[]
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

export async function runSearch(opts: SearchOpts): Promise<SearchResult> {
  let items = await fetchAllItems()

  if (opts.region) {
    const want = opts.region.toLowerCase()
    items = items.filter(j => (j.region || "").toLowerCase().includes(want))
  }
  if (opts.category) {
    const want = opts.category.toLowerCase()
    items = items.filter(j => (j.category || "").toLowerCase().includes(want))
  }
  if (opts.company) {
    const want = opts.company.toLowerCase()
    items = items.filter(j => (j.company || "").toLowerCase().includes(want))
  }
  if (opts.jobage !== undefined && !isNaN(opts.jobage)) {
    const floor = daysAgo(opts.jobage)
    items = items.filter(j => !j.date || j.date >= floor)  // undated items stay
  }
  if (opts.query) {
    // Every token must appear (AND) across title/company/category/region/description.
    const tokens = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
    items = items.filter(j => {
      const hay = `${j.title} ${j.company} ${j.category} ${j.region} ${j.description}`.toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }

  // Newest first, then cap.
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  const total = items.length
  if (opts.limit !== undefined && !isNaN(opts.limit)) items = items.slice(0, opts.limit)

  return {
    meta: { count: items.length, page: 1, total, total_pages: 1 },
    results: items,
  }
}

export function formatTable(results: FeedItem[]): string {
  const rows = results.map(j =>
    `| ${(j.jobTitle || j.title).slice(0, 46).padEnd(46)} | ${(j.company || "—").slice(0, 22).padEnd(22)} | ${(j.region || "—").slice(0, 26).padEnd(26)} | ${j.date} |`
  )
  return [
    "| Title                                            | Company                | Region                     | Date       |",
    "|--------------------------------------------------|------------------------|----------------------------|------------|",
    ...rows,
  ].join("\n")
}

export function formatPlain(j: FeedItem): string {
  const lines = [
    `Title: ${j.jobTitle || j.title}`,
    `Company: ${j.company || "N/A"}`,
    `Region: ${j.region || "N/A"}`,
    `Category: ${j.category || "N/A"}`,
    `Date: ${j.date || "N/A"}`,
    `URL: ${j.url}`,
    "",
    "--- Description ---",
    j.description || "(not retrieved)",
  ]
  return lines.join("\n")
}
