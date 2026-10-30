# Search Queries for Job Scraper

<!-- Personalise this file for the candidate — see framework/01-candidate-profile.md and
     framework/04-job-evaluation.md. Queries are grouped by function, not job title. -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `portals/*/SKILL.md` and runs its CLI first:

- **`linkedin-search`** — any country/remote. Location passed explicitly.
- **`getonboard-search`** — Spain + LatAm + remote. Country-scoped via `--country`.
- **`remoteok-search`** — remote, tech. Whole board, client-side filters.

`scripts/scrape-all.sh` runs all three in one call. `enabled: false` in a portal's `SKILL.md`
frontmatter removes it from a run (reported as skipped, never silently dropped).

The `site:` templates below are the **web_search fallback** — portals without a CLI, company
career pages, or when a CLI fails. No `site:` line is needed for a portal that has a CLI.

## Candidate profile (drives the queries below)

| Field | Value |
|---|---|
| Function | Full-stack development focused on **AI agent systems** — multi-tenant agent platforms, conversational AI with tool use, RAG, MCP, LLM orchestration |
| Stack | JavaScript (todo el ecosistema: Node.js, Express, Next.js, React, React Native, Angular, Vue, TypeScript), Go, PHP (**Laravel** primary, Symfony secondary) |
| Also in toolkit | Nest.js, AdonisJS, Ionic, PostgreSQL / MySQL / MongoDB / Oracle DB, Docker, AWS, CI/CD |
| NOT in toolkit | Python (muy poco uso, no lo maneja), .NET/C#, Java, Ruby — **search and scoring must not treat these as a fit** |
| Markets | **Remote-first**, timezone overlap with **LatAm / US / EU**. Based in your city (your UTC offset). |
| Languages | Spanish (native), English (B2) |
| Sectors | IT, Fintech, SaaS, Retail, E-commerce |
| Contract | Full-time only |

### Hard vetoes (from `framework/04-job-evaluation.md`)

On-site / presencial · visa sponsorship required · live coding test · a job-condition language other
than English or Spanish · timezone outside LatAm/US/EU · non-full-time contract · salary not
commensurate. **Any role tripping one of these is excluded, not scored.**

## Search Sites

Primary (all have CLIs):
- **linkedin.com/jobs** — global, any market
- **getonbrd.com** — Spain + LatAm + remote
- **remoteok.com** — remote-only, tech

Secondary (web_search fallback):
- `site:jobs.lever.co` / `site:boards.greenhouse.io` / `site:ashbyhq.com` — ATS boards for target companies
- Company career pages, found by searching the employer by name (never from links inside a posting body)

## Query Categories

**Organize by function, not job title.** The same work carries different titles across companies.

### Priority 1: Full-stack engineer with an AI-agent focus (primary direction)

```
"Full Stack Engineer"          "Senior Full Stack Engineer"    "Full Stack Developer"
"AI Engineer"                  "AI Agent Engineer"            "Agentic AI Engineer"
"LLM Engineer"                 "Applied AI Engineer"          "GenAI Engineer"
"AI Platform Engineer"         "Agent Infrastructure Engineer"
LangGraph OR LangChain OR CrewAI OR "tool use" OR MCP
```

**Spanish variants:** `Desarrollador Full Stack`, `Ingeniero Full Stack Senior`,
`Ingeniero de IA`, `Ingeniero LLM`, `Desarrollador de Agentes IA`.

### Priority 2: Backend / platform engineering (adjacent, strong)

```
"Backend Engineer"             "Senior Backend Engineer"       "Node.js Engineer"
"TypeScript Engineer"          "Platform Engineer"            "API Engineer"
"Multi-tenant" OR "multi-tenant platform" OR "BFF"
```

**Spanish variants:** `Desarrollador Backend`, `Ingeniero de Plataforma`, `Desarrollador Node.js`.

### Priority 3: Adjacent roles (pivot options)

```
"Technical Lead" (full-stack / platform)     "Solutions Engineer" (AI)
"Developer Experience Engineer"              "Integration Engineer" (AI tooling)
"Staff Engineer" (product platform)
```

**Spanish variants:** `Líder Técnico`, `Arquitecto de Soluciones`, `Ingeniero de Integración`.

### Priority 4: Broader technical (wider net)

```
"JavaScript Engineer"           "React Engineer"               "Next.js Developer"
"PHP Developer" (Laravel)      "Go Developer"
```

## Recommended CLI invocations

```bash
# Priority 1 — full-stack + AI agent roles, remote
scripts/scrape-all.sh --query "Full Stack Engineer" --location "Remote" --jobage 30 --limit 10
scripts/scrape-all.sh --query "AI agent engineer" --location "Remote" --jobage 30 --limit 10

# Priority 2 — backend / platform
scripts/scrape-all.sh --query "backend engineer TypeScript" --location "Remote" --jobage 30 --limit 10

# Spanish-language market (LatAm + Spain)
scripts/scrape-all.sh --query "desarrollador full stack" --country "ES,CL,CO,MX,VE,AR,PE" --jobage 30 --limit 10

# LatAm-only scope
scripts/scrape-all.sh --query "ingeniero de IA" --country "VE,CO,MX,CL,AR,PE" --jobage 30 --limit 10
```

## Location Filter

Remote-first, based in Venezuela (UTC-4). Evaluate results as:
- **Remote (any timezone)** — preferred
- **Remote with overlap requirement** (US East Coast, UK/EU hours) — check the stated hours; UTC-4 overlaps cleanly with US Eastern and most EU business hours
- **Remote, LatAm only** — fine
- **Onsite / presencial** — **VETO** (hard exclusion)
- **Relocation required with no sponsorship** — **VETO**
- **Relocation offered and funded by the employer** — acceptable; a FLAG worth surfacing, not a veto
- **Timezone outside LatAm/US/EU** (e.g. APAC-only, Australia-only) — **VETO**

## Language Filter

Working languages and levels are in `framework/01-candidate-profile.md`'s Languages table.
Apply `framework/04-job-evaluation.md`'s Language Gate: a posting requiring a language not
declared at all is excluded before scoring; a posting requiring a **higher level than B2** in
English gets **flagged**, not excluded — surface the gap and let the user judge. Postings simply
*written* in another language that don't require it on the job are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not
yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and generate 2-3
custom queries for that focus. For example:
- "scrape AI agent roles" → Priority 1 queries + `--location Remote`
- "scrape LatAm only" → `--country VE,CO,MX,CL,AR,PE`
- "scrape fintech" → Priority 1 + 2 queries, filtered by company sector after fetching
