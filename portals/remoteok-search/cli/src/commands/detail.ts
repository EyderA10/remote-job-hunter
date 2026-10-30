import { fetchBoard, stripHtml, salaryToString, fixMojibake, writeError } from "../helpers.ts"
import type { NormalizedJob } from "./search.ts"

export interface DetailOpts {
  idOrUrl: string
  format?: "json" | "plain"
}

export function extractSlug(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input)
    if (!/remoteok\.com$/i.test(url.hostname)) throw new Error("Not a remoteok.com URL")
    const m = url.pathname.match(/\/remote-jobs\/(.+)$/)
    if (m) return m[1]
    throw new Error("Could not read a job slug from that URL")
  }
  return input.trim()
}

export async function runDetail(opts: DetailOpts): Promise<NormalizedJob> {
  const slug = extractSlug(opts.idOrUrl)
  const board = await fetchBoard()
  const hit = board.find(j => j.slug === slug || j.id === slug)
  if (!hit) throw new Error("Job not found on the live board (it may have closed)")
  return {
    id: hit.slug,
    title: fixMojibake(hit.position),
    company: fixMojibake(hit.company),
    location: fixMojibake(hit.location) || "Remote",
    remote: true,
    tags: hit.tags ?? [],
    date: (hit.date ?? "").slice(0, 10),
    url: hit.url,
    apply_url: hit.apply_url || hit.url,
    salary_min: hit.salary_min || null,
    salary_max: hit.salary_max || null,
    salary: salaryToString(hit.salary_min, hit.salary_max),
    description: fixMojibake(stripHtml(hit.description ?? "")),
  }
}

export function formatDetail(j: NormalizedJob, format: "json" | "plain"): string {
  if (format === "json") return JSON.stringify(j, null, 2)
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
