// CV template — Typst port of the repo's moderncv "banking" style.
// Reference for structure; /apply writes output/cv/<company>_<role>.typ from it.
//
// Hard limit (framework/05-cv-templates.md): EXACTLY 2 pages.
// Tailor by editing the VALUES below — profile statement, section order, bullet emphasis.
// The body reads its content from these variables, so the layout code never changes.

#set document(author: "cv", title: "CV")

#set page(
  paper: "a4",
  margin: (x: 18mm, y: 15mm),
  numbering: "1",
)

// FONT: use "Ubuntu Sans", never "DejaVu Sans". DejaVu's kerning pairs make
// pypdf's text extraction insert spurious spaces mid-word ("T ypeScript",
// "T erraform"), which silently breaks ATS keyword matching. Ubuntu Sans and
// New Computer Modern both extract cleanly.
#set text(font: "Ubuntu Sans", size: 9.5pt, lang: "en", region: "US")
#set par(leading: 0.62em, justify: false)

// ============================================================================
// FILL THIS BLOCK — the user's real details (from Resume-2026-EN.pdf).
// Change the VALUES per application; never restructure the layout code below.
// ============================================================================
#let cv-name = "Your Name"
#let cv-title-line = "Senior Full Stack Engineer"
#let cv-contact = "your@email.com  ·  +00 000 000 0000  ·  Your City, Country  ·  linkedin.com/in/your-handle  ·  github.com/your-handle"

#let profile-statement = "Senior full-stack engineer with 4+ years building production SaaS platforms and AI agent systems across Node.js, TypeScript, Next.js and Go. Shipped multi-tenant agent infrastructure, REST APIs and real-time product surfaces, with a testing-first practice (Unit, Integration, E2E, TDD) and zero-downtime deployments."

// Experience: each role is (heading, date-range, (bullets...))
// DATES: use a single ASCII hyphen ("2021-2024"), never an en-dash. ATS date
// parsers split ranges on U+002D and drop the date when they meet U+2013;
// scripts/verify_pdf.py --ascii-dates enforces this.
#let experiences = (
  ("Senior Full Stack Engineer — Cynergy", "2024-2025", (
    "Architected and scaled a high-performance SaaS web application, managing the full client-side lifecycle",
    "Engineered scalable backend systems and REST APIs with Node.js, Express.js, Knex.js and Oracle DB",
    "Built modern front ends with Next.js, TypeScript, React Query and Shadcn for reusable UI components",
    "Implemented Unit, Integration and E2E testing suites enabling zero-downtime deployments",
  )),
  ("IoT Software Engineer — Priverion", "2023-2024", (
    "Architected full-lifecycle software for IoT devices across web portals and mobile applications",
    "Integrated low-level camera functionality in C++ streaming into high-performance Golang services",
    "Optimized web portal performance, reducing latency for real-time remote device management",
    "Engineered firmware-to-cloud communication features improving hardware resource management",
  )),
  ("Backend Developer — The Singular Factory", "2022-2023", (
    "Designed feature extensions for an enterprise logistics platform: secure messaging, job booking, file management, AI data visualization",
    "Optimized a high-traffic shipping platform improving data processing and reliability for carriers and shippers",
    "Developed backend logic and APIs with tight security compliance for financial transactions and data reporting",
    "Mentored junior developers through code reviews and clean-code enforcement",
  )),
  ("Full Stack Developer — FlexFunds", "2022-2023", (
    "Developed and maintained critical features for an enterprise Admin Dashboard for financial applications",
    "Engineered frontend and backend solutions ensuring high availability across administrative modules",
    "Resolved complex system bottlenecks, significantly reducing application error rates",
  )),
  ("Full Stack Web & Mobile Developer — NeurON", "2021-2021", (
    "Led end-to-end development for multi-store delivery applications across mobile, backend and infrastructure",
    "Implemented real-time communication with WebSockets for live updates and synchronized order tracking",
    "Designed an analytical admin dashboard for multi-tenant store operations and data visualization",
    "Managed server deployments, maintenance and DevOps operations",
  )),
)

#let projects = (
  ("factoria-agent-core", "2026", (
    "Multi-tenant agent core: one repo serving several clients, each declaring its identity, agent, tools and business rules in config/tenants/<id>.json",
    "ElevenLabs Conversational AI + tool layer, Supabase Postgres via Drizzle, Zod validation, white-label embed.js iframe widget",
  )),
  ("Other public repositories", "—", (
    "mini-content-approval-engine (TypeScript), my-python-ci-app (Python), my-first-ci-cd (DevOps), backend-adonis (AdonisJS), api-calendar (PHP)",
  )),
)

#let skills-groups = (
  ("Programming", "JavaScript, TypeScript, Node.js, Go, Python, PHP, C++"),
  ("Frameworks", "Next.js, React, React Native, Nest.js, ExpressJS, Angular, Vue, Ionic, Symfony, Laravel, AdonisJS, React Query, Shadcn, TanStack Query"),
  ("Databases", "PostgreSQL, MySQL, MongoDB, SQLite, Oracle DB"),
  ("Infrastructure", "Docker, Linux, AWS Services, CI/CD"),
  ("AI", "AI Agent Development, RAG, MCP, conversational AI with tool use, Claude Code, OpenCode"),
  ("Practices", "Unit / Integration / E2E testing, TDD, SDD, Clean Code, SOLID, Architecture Patterns, Systems Design, SCRUM"),
)

#let education = (
  ("Systems Engineer", "2016-2022", "UNEFA", ""),
)

#let languages-line = "Spanish — Native   ·   English — B2"

// Which sections appear, and in what order. Remove a line to drop a section;
// reorder to reprioritise. Available: "profile", "experience", "projects",
// "skills", "education", "languages", "publications", "awards", "references".
#let section-order = ("profile", "experience", "projects", "skills", "education", "languages")
// ============================================================================

// ---- palette -------------------------------------------------------------
#let ink = rgb("#1f2937")
#let muted = rgb("#6b7280")
#let accent = rgb("#0f766e")
#let rule = rgb("#d1d5db")

// ---- primitives ----------------------------------------------------------
#let section(title) = {
  v(2.2mm)
  text(size: 10.5pt, weight: "bold", fill: accent, smallcaps(title))
  v(0.8mm)
  line(length: 100%, stroke: 0.4pt + rule)
  v(1.6mm)
}

// An entry: heading left, date range right. Kept on one page so a heading can
// never orphan from its bullets.
#let entry(heading, dates, body) = {
  block(breakable: false)[
    #grid(
      columns: (1fr, auto),
      align(left + horizon, heading),
      align(right + horizon, text(size: 8.4pt, fill: muted, dates)),
    )
    #if body != none {
      v(0.6mm)
      body
    }
    #v(1.6mm)
  ]
}

#let bullet(body) = {
  pad(left: 3.5mm, top: 0.3mm)[#text(fill: accent, "▪") #h(1.1mm) #body]
}

#let render-bullets(list) = list.map(b => bullet(b)).join(v(0.35mm))

// ---- header --------------------------------------------------------------
#align(center)[
  #set text(size: 21pt, weight: "bold", fill: ink)
  #cv-name
  #v(1mm)
  #set text(size: 10pt, fill: muted)
  #cv-title-line
]

#v(1.5mm)
#align(center)[#set text(size: 8.2pt, fill: muted); #cv-contact]

#v(1mm)
#line(length: 100%, stroke: 0.7pt + accent)

// ---- body ----------------------------------------------------------------
#for s in section-order {
  if s == "profile" {
    section("Profile")
    profile-statement
  } else if s == "experience" {
    section("Experience")
    for (heading, dates, bullets) in experiences {
      entry(heading, dates, render-bullets(bullets))
    }
  } else if s == "projects" {
    section("Independent Projects")
    for (heading, dates, bullets) in projects {
      entry(heading, dates, render-bullets(bullets))
    }
  } else if s == "skills" {
    section("Technical Skills")
    for (label, value) in skills-groups {
      [#text(weight: "bold", label + ": ") #value]
      v(0.2mm)
    }
  } else if s == "education" {
    section("Education")
    for (degree, years, institution, topics) in education {
      entry(degree, years, [
        #text(fill: muted, institution) #h(1mm)
        #text(size: 8.4pt, fill: muted, topics)
      ])
    }
  } else if s == "languages" {
    section("Languages")
    text(fill: muted, languages-line)
  }
}

#v(1mm)
