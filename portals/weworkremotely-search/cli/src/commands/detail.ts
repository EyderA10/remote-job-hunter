// WWR job detail — resolved from the RSS feeds.
//
// The detail HTML page sits behind Cloudflare ("Just a moment..." challenge),
// so page fetches are not viable. The RSS description is the full posting
// anyway (it is the only field the RSS provides), so detail is a feed lookup
// keyed by slug. Limitation: a posting that has aged out of the five category
// feeds (WWR keeps only the newest ~25 per category) cannot be resolved.

import { fetchAllItems, type FeedItem } from "../helpers.ts"

export interface DetailResult {
  title: string
  company: string
  jobTitle: string
  region: string
  category: string
  date: string
  url: string
  description: string
}

/** Accept a bare slug or a full posting URL; return the slug. */
export function extractSlug(idOrUrl: string): string {
  const m = idOrUrl.match(/remote-jobs\/([^/?#]+)/)
  return m ? m[1] : idOrUrl.replace(/^.*\/remote-jobs\//, "").replace(/[/?#].*$/, "")
}

/** Find one posting across the five feeds by slug. */
export async function runDetail(slug: string): Promise<DetailResult> {
  const items = await fetchAllItems()
  const j: FeedItem | undefined = items.find(
    x => x.url === `${slug}` || x.url.endsWith(`/remote-jobs/${slug}`)
  )
  if (!j) {
    throw new Error(
      `Not found in the WWR category feeds (postings age out of the feed after ~1 week): ${slug}`
    )
  }
  return {
    title: j.title,
    company: j.company,
    jobTitle: j.jobTitle || j.title,
    region: j.region,
    category: j.category,
    date: j.date,
    url: j.url,
    description: j.description,
  }
}
