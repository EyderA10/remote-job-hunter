import {
  SEARCH_URL,
  fetchJson,
  resolveCompanyNames,
  stripHtml,
  salaryToString,
  timestampToDate,
  type JobCard,
} from "../helpers.ts"

export interface SearchOpts {
  query?: string
  country?: string
  remote?: string
  category?: string
  seniority?: string
  jobage?: number
  page?: number
  limit?: number
  /** Resolve company names via /api/v0/companies (deduped + disk-cached). Default true. */
  resolveCompanies?: boolean
}

export interface NormalizedJob {
  id: string
  title: string
  company: string | null
  company_id: number | null
  location: string
  remote: boolean
  modality: string | null
  country: string | null
  seniority: string | null
  category: string | null
  date: string
  url: string
  salary_min: number | null
  salary_max: number | null
  salary: string | null
  description: string
  functions: string | null
  benefits: string | null
  desirable: string | null
  perks: string[]
  applications_count: number
  lang: string
}

// ---- vocabularies (fetched once per run, in parallel) --------------------
let seniorityNames: Record<string, string> | null = null
let modalityNames: Record<string, string> | null = null

async function loadVocabularies(): Promise<void> {
  const [sen, mod] = await Promise.all([
    fetchJson("https://www.getonbrd.com/api/v0/seniorities").catch(() => ({ data: [] })),
    fetchJson("https://www.getonbrd.com/api/v0/modalities").catch(() => ({ data: [] })),
  ])
  seniorityNames = {}
  for (const s of sen.data ?? []) seniorityNames[String(s.id)] = s.attributes?.name ?? String(s.id)
  modalityNames = {}
  for (const m of mod.data ?? []) modalityNames[String(m.id)] = m.attributes?.name ?? String(m.id)
}

// ---- search ---------------------------------------------------------------
export async function runSearch(opts: SearchOpts): Promise<{
  meta: { count: number; page: number; total: number; total_pages: number }
  results: NormalizedJob[]
}> {
  const params = new URLSearchParams()
  if (opts.query) params.set("query", opts.query)
  for (const c of (opts.country ?? "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean)) {
    params.append("country[]", c)
  }
  for (const r of (opts.remote ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)) {
    params.append("remote[]", r)
  }
  for (const c of (opts.category ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    params.append("category[]", c)
  }
  for (const s of (opts.seniority ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)) {
    params.append("seniority[]", s)
  }
  if (opts.jobage) {
    params.set("since", new Date(Date.now() - opts.jobage * 864e5).toISOString().split("T")[0])
  }
  params.set("page", String(opts.page ?? 1))
  params.set("per_page", String(Math.min(opts.limit ?? 20, 50)))

  await loadVocabularies()
  const data = await fetchJson(`${SEARCH_URL}?${params.toString()}`)
  const cards: JobCard[] = data?.data ?? []

  let companies: Record<string, { name: string }> = {}
  if (opts.resolveCompanies !== false) {
    const ids = cards.map(c => c.attributes?.company?.data?.id).filter((x): x is number => typeof x === "number")
    companies = await resolveCompanyNames(ids)
  }

  const results = cards.map(card => normalize(card, companies))
  return {
    meta: {
      count: results.length,
      page: data?.meta?.page ?? opts.page ?? 1,
      total: data?.meta?.total ?? results.length,
      total_pages: data?.meta?.total_pages ?? 1,
    },
    results,
  }
}

function normalize(card: JobCard, companies: Record<string, { name: string }>): NormalizedJob {
  const a = card.attributes
  const companyId = a.company?.data?.id ?? null
  const company = companyId !== null ? (companies[String(companyId)]?.name ?? `company-${companyId}`) : null
  const remote = Boolean(a.remote)
  const location = remote
    ? (a.countries?.join(", ") || "Remote")
    : (a.countries?.join(", ") || a.location_regions?.data?.[0]?.id || "N/A")

  return {
    id: card.id,
    title: a.title,
    company,
    company_id: companyId,
    location,
    remote,
    modality: a.remote_modality ?? null,
    country: a.countries?.[0] ?? null,
    seniority: a.seniority?.data?.id != null ? (seniorityNames?.[String(a.seniority.data.id)] ?? null) : null,
    category: a.category_name ?? null,
    date: timestampToDate(a.published_at),
    url: card.links?.public_url ?? `https://www.getonbrd.com/jobs/${card.id}`,
    salary_min: a.min_salary,
    salary_max: a.max_salary,
    salary: salaryToString(a.min_salary, a.max_salary),
    description: stripHtml(a.description ?? ""),
    functions: a.functions ? stripHtml(a.functions) : null,
    benefits: a.benefits ? stripHtml(a.benefits) : null,
    desirable: a.desirable ? stripHtml(a.desirable) : null,
    perks: a.perks ?? [],
    applications_count: a.applications_count ?? 0,
    lang: a.lang ?? "lang_not_specified",
  }
}

// ---- formatting -----------------------------------------------------------
export function formatTable(results: NormalizedJob[]): string {
  if (results.length === 0) return "No results."
  const head = "| # | Title | Company | Location | Salary | Date | URL |\n|---|-------|---------|----------|--------|------|-----|"
  const rows = results.map((j, i) =>
    `| ${i + 1} | ${j.title} | ${j.company ?? "N/A"} | ${j.location} | ${j.salary ?? "N/A"} | ${j.date} | ${j.url} |`
  ).join("\n")
  return `${head}\n${rows}`
}

export function formatPlain(j: NormalizedJob): string {
  const lines = [
    `Title: ${j.title}`,
    `Company: ${j.company ?? "N/A"}`,
    `Location: ${j.location}`,
    `Remote: ${j.remote ? "yes" : "no"}`,
    `Seniority: ${j.seniority ?? "N/A"}`,
    `Category: ${j.category ?? "N/A"}`,
    `Salary: ${j.salary ?? "N/A"}`,
    `Date: ${j.date}`,
    `URL: ${j.url}`,
    "",
    "--- Description ---",
    j.description || "(empty)",
  ]
  if (j.functions) lines.push("", "--- Functions ---", j.functions)
  if (j.benefits) lines.push("", "--- Benefits ---", j.benefits)
  if (j.desirable) lines.push("", "--- Desirable ---", j.desirable)
  lines.push("", `Perks: ${j.perks.join(", ") || "None"}`, `Applications: ${j.applications_count}`)
  return lines.join("\n")
}
