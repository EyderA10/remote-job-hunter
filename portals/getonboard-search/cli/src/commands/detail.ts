import {
  PUBLIC_JOB,
  fetchText,
  fetchJson,
  metaContent,
  parseOgTitle,
  stripHtml,
  extractByClass,
} from "../helpers.ts"

export interface DetailOpts {
  idOrUrl: string
  format?: "json" | "plain"
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  url: string
  salary: string | null
  modality: string | null
  description: string | null
  sections: { heading: string; body: string }[]
  source: "public-page" | "search-api"
}

/** Accept a slug, or any getonbrd.com/jobs URL (any path depth). */
export function extractSlug(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input)
    if (!/getonbrd\.com$/i.test(url.hostname)) throw new Error("Not a getonbrd.com URL")
    const parts = url.pathname.split("/").filter(Boolean)
    const i = parts.lastIndexOf("jobs")
    if (i >= 0 && parts[i + 1]) return parts[i + 1]
    throw new Error("Could not read a job slug from that URL")
  }
  return input.trim()
}

// The public page renders the posting body as a series of `gb-rich-txt` divs in
// document order, with no heading siblings. Label each by its own content.
function labelSection(body: string, index: number): string {
  const head = body.slice(0, 400).toLowerCase()
  if (/buscamos (un|una|a) |^en\s+\S+.*\bbuscamos\b/.test(head)) return "Resumen"
  if (/habilidades\s+(requeridas|excluyentes)|requisitos|experiencia requerida|conocimientos\b/.test(head)) return "Habilidades y requisitos"
  if (/responsible|responsable|rol implicar|funciones|you will|day.to.day/.test(head)) return "Funciones"
  if (/^(modalidad|condiciones|duraci|jornada)\b/.test(head)) return "Condiciones"
  return `Sección ${index + 1}`
}

function pageSalary(html: string): string | null {
  const m = /Gross salary[\s\S]{0,200}?([^\s<\n]{1,12})\s*-\s*([^\s<\n]{1,12})[\s\S]{0,80}?([A-Z]{3})\/month/i.exec(html)
  if (m) return `${m[1]}-${m[2]} ${m[3]}/month`
  const single = /Gross salary[\s\S]{0,200}?([$€£]\s?[\d.,]+[\s\S]{0,80}?)([A-Z]{3})\/month/i.exec(html)
  return single ? `${single[1].trim()} ${single[2]}/month` : null
}

function pageModality(html: string): string | null {
  const m = /performed([\s\S]{0,400}?)\((Hybrid|Remote|Onsite)\)/i.exec(html)
  if (m) return m[2].toLowerCase()
  const t = stripHtml(html)
  const m2 = /(?:modalidad|work mode)\s*:?\s*(h[ií]brido|remoto|presencial)/i.exec(t)
  return m2 ? m2[1].toLowerCase() : null
}

export async function runDetail(opts: DetailOpts): Promise<JobDetail> {
  const slug = extractSlug(opts.idOrUrl)

  // Path 1: the public page. Works for postings that have closed and dropped out
  // of search, and its og:title carries the real company name.
  try {
    const html = await fetchText(`${PUBLIC_JOB}/${slug}`)
    const ogTitle = metaContent(html, "og:title")
    if (!ogTitle) throw new Error("Page loaded but carried no og:title")
    const parsed = parseOgTitle(ogTitle)

    const divs = extractByClass(html, "gb-rich-txt").map(stripHtml).filter(s => s.length > 0)
    const sections = divs.map((body, i) => ({ heading: labelSection(body, i), body }))

    return {
      id: slug,
      title: parsed.role ?? ogTitle,
      company: parsed.company,
      location: parsed.location,
      url: `${PUBLIC_JOB}/${slug}`,
      salary: pageSalary(html),
      modality: pageModality(html),
      description: divs.join("\n\n") || metaContent(html, "og:description"),
      sections,
      source: "public-page",
    }
  } catch (pageError) {
    // Path 2: the search API, matched by slug. A closed posting is not here.
    try {
      const data = await fetchJson(
        `https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(slug)}&per_page=20`
      )
      const card = (data?.data ?? []).find((c: any) => c.id === slug)
      if (!card) throw new Error("not in search results")
      const a = card.attributes
      return {
        id: slug,
        title: a.title,
        company: null,
        location: a.remote ? "Remote" : (a.countries?.join(", ") ?? null),
        url: card.links?.public_url ?? `${PUBLIC_JOB}/${slug}`,
        salary: null,
        modality: a.remote_modality ?? null,
        description: stripHtml(a.description ?? ""),
        sections: [
          ...(a.functions ? [{ heading: "Funciones", body: stripHtml(a.functions) }] : []),
          ...(a.benefits ? [{ heading: "Beneficios", body: stripHtml(a.benefits) }] : []),
          ...(a.desirable ? [{ heading: "Deseables", body: stripHtml(a.desirable) }] : []),
        ],
        source: "search-api",
      }
    } catch {
      throw /404/.test((pageError as Error).message)
        ? new Error("Job not found (404)")
        : new Error(`Could not retrieve this posting (page error: ${(pageError as Error).message})`)
    }
  }
}

export function formatDetail(d: JobDetail, format: "json" | "plain"): string {
  if (format === "json") return JSON.stringify(d, null, 2)
  const lines = [
    `Title: ${d.title}`,
    `Company: ${d.company ?? "N/A"}`,
    `Location: ${d.location ?? "N/A"}`,
    `Salary: ${d.salary ?? "N/A"}`,
    `Modality: ${d.modality ?? "N/A"}`,
    `Source: ${d.source}`,
    `URL: ${d.url}`,
    "",
    "--- Description ---",
    d.description ?? "(not retrieved)",
  ]
  for (const s of d.sections) lines.push("", `--- ${s.heading} ---`, s.body || "(empty)")
  return lines.join("\n")
}
