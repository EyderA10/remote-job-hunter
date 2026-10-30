import { fetchBoard, stripHtml, salaryToString, fixMojibake, type Job } from "../helpers.ts"

export interface SearchOpts {
  query?: string
  tag?: string
  company?: string
  location?: string
  jobage?: number
  limit?: number
  /** Only postings whose tags include every listed tag, e.g. "golang,senior". */
  allTags?: boolean
}

export interface NormalizedJob {
  id: string
  title: string
  company: string
  location: string
  remote: boolean
  tags: string[]
  date: string
  url: string
  apply_url: string
  salary_min: number | null
  salary_max: number | null
  salary: string | null
  description: string
}

function normalize(j: Job): NormalizedJob {
  return {
    id: j.slug,
    title: fixMojibake(j.position),
    company: fixMojibake(j.company),
    location: fixMojibake(j.location) || "Remote",
    remote: true,
    tags: j.tags ?? [],
    date: (j.date ?? "").slice(0, 10),
    url: j.url,
    apply_url: j.apply_url || j.url,
    salary_min: j.salary_min || null,
    salary_max: j.salary_max || null,
    salary: salaryToString(j.salary_min, j.salary_max),
    description: fixMojibake(stripHtml(j.description ?? "")),
  }
}

export async function runSearch(opts: SearchOpts): Promise<{
  meta: { count: number; total: number; note: string }
  results: NormalizedJob[]
}> {
  const board = await fetchBoard()
  let jobs = board.map(normalize)

  if (opts.query) {
    const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
    jobs = jobs.filter(j => {
      const hay = `${j.title} ${j.company} ${j.tags.join(" ")} ${j.description}`.toLowerCase()
      return terms.every(t => hay.includes(t))
    })
  }

  if (opts.tag) {
    const want = opts.tag.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
    jobs = jobs.filter(j => {
      const have = j.tags.map(t => t.toLowerCase())
      return opts.allTags ? want.every(t => have.includes(t)) : want.some(t => have.includes(t))
    })
  }

  if (opts.company) {
    const c = opts.company.toLowerCase()
    jobs = jobs.filter(j => j.company.toLowerCase().includes(c))
  }

  if (opts.location) {
    const l = opts.location.toLowerCase()
    jobs = jobs.filter(j => j.location.toLowerCase().includes(l))
  }

  if (opts.jobage) {
    const cutoff = Date.now() - opts.jobage * 864e5
    jobs = jobs.filter(j => {
      const t = Date.parse(j.date)
      return Number.isFinite(t) && t >= cutoff
    })
  }

  jobs.sort((a, b) => b.date.localeCompare(a.date))

  const total = jobs.length
  const limited = opts.limit ? jobs.slice(0, opts.limit) : jobs
  return {
    meta: {
      count: limited.length,
      total,
      note: "RemoteOK serves the whole live board; filters are applied client-side.",
    },
    results: limited,
  }
}

export function formatTable(results: NormalizedJob[]): string {
  if (results.length === 0) return "No results."
  const head = "| # | Title | Company | Location | Salary | Date | Tags | URL |\n|---|-------|---------|----------|--------|------|------|-----|"
  const rows = results.map((j, i) =>
    `| ${i + 1} | ${j.title} | ${j.company} | ${j.location} | ${j.salary ?? "N/A"} | ${j.date} | ${j.tags.slice(0, 4).join(", ")} | ${j.url} |`
  ).join("\n")
  return `${head}\n${rows}`
}

export function formatPlain(j: NormalizedJob): string {
  return [
    `Title: ${j.title}`,
    `Company: ${j.company}`,
    `Location: ${j.location}`,
    `Tags: ${j.tags.join(", ") || "None"}`,
    `Salary: ${j.salary ?? "N/A"}`,
    `Date: ${j.date}`,
    `URL: ${j.url}`,
    `Apply: ${j.apply_url}`,
    "",
    "--- Description ---",
    j.description || "(empty)",
  ].join("\n")
}
