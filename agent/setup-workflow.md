# /setup - Profile Onboarding

You are running the onboarding setup for the AI Job Search framework. Your goal is to collect the user's professional information and populate all profile files so the `/apply` workflow works out of the box.

There are three paths into setup. Step 0 picks the right one; all three converge on Step 3 (file generation) and Step 4 (confirmation).

---

## Step 0: Welcome & Choose Path

If `$ARGUMENTS` contains `--section <name>`, skip directly to that section in Path C for an update-only flow. Do not run the path-selection prompt below.

Then welcome the user with a single message that lists three paths. The wording changes based on what was found.

*(The source-repo template this file was ported from asked about git remote visibility before writing personal data. That does not apply here: this skill is a local directory on the user's machine, not a git checkout, so there is no push to warn about.)*

Then, before greeting the user, scan the `profile/materials/` folder. Use Glob with `profile/materials/**/*` and count files per subfolder (`cv/`, `linkedin/`, `diplomas/`, `agent/`, `projects/`, `applications/`).

**If the folder is empty, do not stop at Path A.** A CV is the best single source but it is not the only one: public GitHub gives title, bio, location and repo evidence instantly, and the LinkedIn official export gives the Languages table with self-rated proficiency. Rank and use all three — `agent/profile-sources.md`. A profile built from a CV plus GitHub plus an interview for the gaps is stronger than one built from a CV alone.

Then welcome the user with a single message that lists three paths. The wording changes based on what was found.

**If `profile/materials/` has files** in one or more subfolders, lead with Path A:

> **Welcome to the AI Job Search setup!**
>
> I'll help you build your professional profile so Claude can evaluate job postings, tailor CVs, write cover letters, and prepare you for interviews.
>
> I see files in your `profile/materials/` folder: [list per subfolder, e.g. "2 in cv/, 1 in linkedin/, 3 in agent/"]. Three ways to start:
>
> **Path A: Read my documents folder** (recommended for what you have) - I'll read everything in `profile/materials/`, cross-reference for consistency, and build your profile from real source materials. Idempotent and safe to re-run as you add more documents.
>
> **Path B: Single CV import** - Paste or @-mention a single CV/resume here. I'll extract it and ask follow-up questions for what's missing.
>
> **Path C: Interview mode** - I'll walk you through structured questions section by section.
>
> Which would you like?

**If `profile/materials/` is empty or missing**, surface Path A as a "do this if you have materials" option:

> **Welcome to the AI Job Search setup!**
>
> I'll help you build your professional profile so Claude can evaluate job postings, tailor CVs, write cover letters, and prepare you for interviews.
>
> Three ways to start:
>
> **Path A: Documents folder** (best signal if you have several materials) - Drop your CV / LinkedIn export / diplomas / reference letters / project summaries in the `profile/materials/` folder, then say "go". I'll read everything and build your profile from it. See `agent/naming.md` for the folder layout.
>
> **Path B: Single CV import** - Paste or @-mention a single CV/resume here. I'll extract it and ask follow-up questions for what's missing.
>
> **Path C: Interview mode** - I'll walk you through structured questions section by section. Good if you're starting from scratch.
>
> Which would you like?

Wait for the user's choice. If they pick A but the folder is still empty, tell them what to add (point at `agent/naming.md`) and stop.

---

## Path A: Documents Folder

Reads structured documents in `profile/materials/`, cross-references them for consistency, and merges extracted data into the seven profile skill files. Read-before-write and idempotent: changes already present will not be proposed again.

Follow these steps **exactly in order**.

### Step A1: Inventory

Use Glob with `profile/materials/**/*` to scan the full tree. Print:

```
## Documents Found

**cv/**: [list files, or "(empty)"]
**linkedin/**: [list files, or "(empty)"]
**diplomas/**: [list files, or "(empty)"]
**agent/**: [list files, or "(empty)"]
**projects/**: [list files, or "(empty)"]
**applications/**: [list subfolders with their files, or "(empty)"]

I will read these and cross-reference before proposing any changes.
```

If every subfolder is empty, stop and tell the user to populate the folder. Point at `agent/naming.md` for the layout.

### Step A2: Read Existing Skill Files

Read these in parallel before extracting anything. You must know what is already there to make the merge intelligent.

- `framework/01-candidate-profile.md`
- `framework/02-behavioral-profile.md`
- `framework/03-writing-style.md`
- `framework/04-job-evaluation.md`
- `framework/05-cv-templates.md`
- `framework/06-cover-letter-templates.md`
- `framework/07-interview-prep.md`

Hold this content in context throughout Path A. Do not re-read.

### Step A3: Parse Documents

Read each document found in Step A1. Process subfolders in this order: `cv/`, `linkedin/`, `diplomas/`, `agent/`, `projects/`, `applications/`.

**`cv/` documents:** name, contact (email, phone, LinkedIn, GitHub), education (degree, institution, dates, thesis), work experience (title, company, dates, location, bullets), skills, languages (with any stated proficiency), publications, awards, profile/summary.

**`linkedin/` documents:** About/summary section (full text, used for behavioral inference), work experience, education, skills and endorsements, **Languages section** (language name + self-rated proficiency level, e.g. "Spanish - Native or bilingual proficiency" - a high-confidence structured source, feeds the Language Gate in `04-job-evaluation.md`), certifications, volunteer work, publications, recommendations received (full text). If multiple LinkedIn exports are present, use the most recently modified file.

**`diplomas/` documents:** official degree title and level, institution name (official spelling), graduation date, grade or distinction or GPA if visible.

**`agent/` documents:** referee name, title, organization; full text of the letter (extract specific quotes); competency language used.

**`projects/` documents:** project name, summary/description, problem domain, tech stack (languages, frameworks, tools), key technical challenges and architectural decisions, measurable outcomes/metrics (e.g. users, performance, stars, impact).

**`applications/<company>_<role>/` subfolders:**
- `job_posting.md`: role title, company, required skills, experience level, sector, role type
- `cover_letter.tex`: opening structure, body structure, bullet style, closing, recurring phrases
- `cv_draft.tex`: profile statement, section ordering, framing for this role type
- `outcome.md`: status (in_progress/hired/offer_declined/rejected/no_response/interview_only), interview stages, notes. Skip `in_progress` applications for calibration — they have no final signal yet.

After reading, proceed to Step A4 without intermediate output. The user sees a complete picture in Step A6.

### Step A4: Cross-Reference Check

Before mapping anything to skill files, check for inconsistencies:

- Date mismatches between CV / LinkedIn / diploma
- Title mismatches across documents for the same role
- Education mismatches (degree name, graduation date)
- Employer name variations

If inconsistencies are found, present them as a numbered list and wait for the user to resolve each one before continuing:

```
## Cross-Reference Issues Found

These need to be resolved before I continue. For each one, tell me which version is correct.

1. **Role title mismatch - [COMPANY]:**
   CV says: "[TITLE_A]"
   LinkedIn says: "[TITLE_B]"
   Which is correct?

2. ...
```

If no inconsistencies, state "No cross-reference issues found." and continue.

### Step A5: Build Change Sets

For each skill file, compare extracted document content against the current file content from Step A2. Build two buckets.

**Additive changes:** entirely new content not in the skill file in any form. Examples: a certification not in `01-candidate-profile.md`, a new independent project not in `01-candidate-profile.md`, a new endorsement skill, a referee not yet listed, a new behavioral quote from a reference letter, a new award.

**Conflicting changes:** content that touches something already in a skill file but disagrees. Examples: a different date range for an existing job, a different job title for the same role, a different graduation date than what is recorded.

**Inference rules** (apply when populating from inferred sources):

- **`01-candidate-profile.md` (`## Independent Projects`):** Source is `projects/` documents. Extract structured project entries formatted as `- **[PROJECT_NAME]**: [DESCRIPTION with tech stack and measurable outcome]`. Ground all claims in the document text.
- **`02-behavioral-profile.md`:** Source is LinkedIn About + recommendation letters. Extract recurring themes, adjectives, phrases about how the candidate works. Add only to the "Strongest Behaviors", "How You Work Best", or "Management Style Preferences" sections (the shipped file's `##` headings). Do not overwrite existing scored assessments. Always label inferred additions: *[Inferred from LinkedIn About / Reference letter - review before relying on this]*
- **`03-writing-style.md`:** Source is `cover_letter.tex` files. Extract recurring patterns. Add as observations under "## Patterns Observed in Past Applications". Do not modify existing rules. Only add if 2+ cover letters show a genuine pattern.
- **`04-job-evaluation.md`:** Source is `job_posting.md` + `outcome.md` pairs. If an application reached interview or offer: note role type and sector as a confirmed strong-fit signal. If 2+ applications repeat a no-response or rejection pattern: note it. Add findings under "## Calibration from Past Applications". Do not modify the existing scoring framework.
- **`05-cv-templates.md`:** Source is `cv_draft.tex` files. Extract any profile statement that does not already appear in templates. Label with: *[Used for: <company>_<role>]*. **Ground before extracting:** archived drafts are tailored outputs, not source documents - verify every factual claim in an extracted statement (titles, employers, metrics, technologies) against `01-candidate-profile.md` and drop or correct any claim the profile does not support, keeping only the framing. A tailored draft that drifted must never become a template future applications start from.
- **`06-cover-letter-templates.md`:** Source is `cover_letter.tex` files. Extract opening patterns, bullet structures, closing formulations. Add only what is structurally distinct from existing templates.
- **`07-interview-prep.md`:** Source is CV bullets, LinkedIn descriptions, reference letter quotes. Identify achievements not yet covered by an existing STAR example. Do NOT draft full STAR examples. Add stubs under "## STAR Candidates (Complete Manually)":

```markdown
### [Achievement title]
**Source:** [CV / LinkedIn / Reference letter - role/company]
**What happened:** [one sentence]
**Why it matters:** [interview question types this could answer]
**S/T/A/R stub:**
- Situation:
- Task:
- Action:
- Result:
```

### Step A6: Present and Confirm Changes

Present the full change set before writing anything.

**Additive changes** (single grouped list, organized by target file):

```
## Proposed Additive Changes

### 01-candidate-profile.md
- [ ] New certification: [title], [issuer], [date] - extracted from LinkedIn
- [ ] New independent project: [PROJECT_NAME] - [description, tech stack, key outcome]
- [ ] New reference: [name, title, company]
  Quote: "[relevant quote]"

### 02-behavioral-profile.md
- [ ] New behavioral observation [labeled as inference]: "[phrase]"

[and so on per file]
```

Then ask:

> **Apply all additive changes?** These add new content without touching anything already in the files.
> Reply **yes** to apply all, or list the numbers you want to skip.

Wait for the response. Apply only the confirmed items.

**Conflicting changes** (one at a time):

```
## Conflict 1 of [N]: Job title - [COMPANY]

**Current in 01-candidate-profile.md:**
[TITLE_A] - [COMPANY] ([START]-[END])

**Proposed (from LinkedIn export):**
[TITLE_B] - [COMPANY] ([START]-[END])

Options:
  [keep] Keep the existing text
  [replace] Replace with the version from the document
  [manual] I'll edit this myself - skip for now
```

Wait for the user's choice on each conflict. If no conflicts, state "No conflicting changes found." and skip this section.

### Step A7: Write Confirmed Changes and Fill Gaps

Apply the confirmed changes with the Edit tool. Make targeted edits only. Do not rewrite entire files. State which changes were applied per file. If a file has no confirmed changes, state "No changes made to [filename]."

Documents cover skills, experience, education, references, and behavioral signal. They do not cover everything `/apply` and `/scrape` need. After the writes, ask follow-up questions for gaps:

- Career goals and target role types
- What excites the user in their next role
- Deal-breakers and must-haves
- Languages you work in professionally, with proficiency levels (only if not already extracted from `cv/` or `linkedin/` above) - this feeds the Language Gate in `04-job-evaluation.md`, so ask directly rather than skipping it
- Salary expectations / baseline (optional)
- Commute or location constraints (if not visible from CV)
- Job search configuration (use the questions from Path C Section 9 below)

Then proceed to Step 3 to populate the non-skill files (`framework/01-candidate-profile.md`, `output/cv/example.tex`, `agent/search-queries.md`). Step 3 will detect that the seven skill files are already populated and skip those substeps.

---

## Path B: Single CV Import

If the user provides a single CV/resume:

1. Read the document thoroughly.
2. Extract all structured information: name, contact, education, experience, skills, languages, publications, awards.
3. Present a summary of what was extracted.
4. Ask follow-up questions for gaps (behavioral profile, career goals, deal-breakers, languages and proficiency levels if not already extracted, salary expectations, references).
5. Proceed to Step 3 (file generation).

---

## Path C: Interview Mode

Walk through each section conversationally. Ask questions naturally, not as a form. Let the user answer in their own words and you'll structure the data.

### Section 1: Identity & Contact
Ask about:
- Full name
- Location (city, country)
- Phone, email, LinkedIn, GitHub
- What languages they work in professionally, and roughly what level in each (native, fluent, conversational, a CEFR letter like B2 - whatever's natural for them to describe, doesn't need to be precise). Worth explaining why: a posting requiring a language they don't list at all gets auto-excluded later by the Language Gate, while one asking for a higher level in a language they do list gets flagged for their own judgment instead of silently passed or rejected - so it's worth being honest here rather than optimistic.
- Current employment status
- Family/commute constraints (if any)

### Section 2: Education
For each degree:
- Level (PhD, MSc, BSc, etc.), field, institution, years
- Thesis topic (if applicable)
- Key coursework or topics

Also ask about certifications (online courses, professional certs).

### Section 3: Professional Experience
For each role (most recent first):
- Job title, company, dates, location
- Key responsibilities (3-5 bullets)
- Key achievements or projects
- Technologies/tools used

Also ask about independent projects, freelance work, or side projects.

### Section 4: Technical Skills
- Programming languages + proficiency level
- ML/AI frameworks and tools
- Domain expertise
- Software tools and platforms
- Any other technical skills

### Section 5: Publications & Awards (optional)
- Peer-reviewed papers, conference presentations
- Hackathons, competitions, awards
- Skip if not applicable

### Section 6: Behavioral Profile (optional)
If they have a formal assessment (PI, DISC, Myers-Briggs, StrengthsFinder):
- Ask them to describe or share the results

If not, ask behavioral questions:
- "What work environments do you thrive in?"
- "What drains your energy at work?"
- "How do you prefer to work in teams?"
- "How do you make decisions, quickly or deliberately?"
- "What's your communication style?"
- Synthesize answers into a behavioral profile

### Section 7: Career Goals & Preferences
- Target roles and industries
- What excites you in work
- Deal-breakers and must-haves
- Salary expectations/baseline (optional)
- What environments to avoid
- Commute/location constraints

### Section 8: References (optional)
For each reference:
- Name, title, company, email, phone
- Relationship to the user

### Section 9: Job Search Configuration
This section generates the search queries that power `/scrape`. Use the information from Sections 1, 4, and 7 to build targeted queries.

Ask about:
- **Role titles to search for:** Job titles for the same underlying work vary a lot across companies and markets - a "Data Scientist" role at one employer may be called "Insights Analyst" or "Data Consultant" at another. Ask about the function first: "What kind of work do you actually want to be doing day-to-day?" Then translate that into concrete search terms: "Given that, what job titles should I search for? For example: Data Scientist, ML Engineer, Geophysicist." Collect 3-8 specific titles, but keep the underlying function in mind - it feeds the category naming in `search-queries.md` and the Experience Match dimension in `04-job-evaluation.md`.
- **Key skills as search terms:** "Which of your skills are most likely to appear in job postings?" Pick 3-5 that are distinctive and searchable.
- **Target companies (optional):** "Are there specific companies you'd like to monitor for openings?"
- **Geographic scope:** "Which cities or regions should I search in? How far are you willing to commute?" Use this to define the location filter tiers (ideal, acceptable, borderline, too far).
- **Job portals:** the skill ships three working CLIs — `linkedin-search` (any market/remote), `getonboard-search` (Spain + LatAm + remote), `remoteok-search` (remote, tech). Each portal's `SKILL.md` frontmatter carries `enabled: true|false`, and `/scrape` skips disabled ones (reported as skipped, never silently dropped). Ask which markets the user wants; flip `enabled:` accordingly. A portal the skill does not have is built with `/add-portal`. **Do not offer portals that are known-blocked from this host** (freehire 403, Indeed/Glassdoor 403, InfoJobs 401) unless the user supplies credentials — see `agent/portal-feasibility.md`.
- **CV language:** "Should your CVs be written in English (the default, accepted in most markets), or in your market's language?" Record the answer as a `CV language: <language>` line in framework/01-candidate-profile.md's Identity section. Cover letters always match each posting's language automatically; this setting governs the CV only. If the user is unsure, keep English and note they can re-run `/setup --section search` to change it.

**Important:** Also suggest role types the user may not have considered, based on their skill profile. For example:
- If they have strong Python + domain expertise: "Have you considered roles like 'Technical Consultant' or 'Solutions Engineer' in your domain?"
- If they have ML + a specific industry: "Companies in adjacent industries also hire for these skills. Should I include searches for [adjacent sector]?"
- If they have project management experience alongside technical skills: "Would you also want to search for 'Technical Project Manager' or 'Team Lead' roles?"

This proactive suggestion step helps users discover career paths they might not have considered.

---

## Step 3: Generate Profile Files

Once data collection is complete, generate or finish populating the following files. **For Path A**, the seven skill files are already populated by Step A7; check each before writing and skip if its content is no longer placeholder text.

### 1. Update `framework/01-candidate-profile.md`
Replace all `[PLACEHOLDER]` tokens with the user's actual information. Keep the structure, workflow, and verification checklist intact.

### 2. Populate `01-candidate-profile.md` *(Path B and C; skip if Path A populated it)*
Write the full candidate profile with structured sections: Identity (including Languages, with levels), Education, Professional Experience, Independent Projects, Technical Skills, Publications, Awards, References.

### 3. Populate `02-behavioral-profile.md` *(Path B and C; skip if Path A populated it)*
Write the behavioral profile based on assessment results or synthesized answers.

### 4. Update `04-job-evaluation.md` *(Path B and C; skip if Path A populated it)*
Replace skill match areas with the user's actual skills:
- Strong match areas: [their primary skills]
- Moderate match areas: [their secondary skills]
- Weak match areas: [skills they lack]

Update career goals and motivation filters with their actual preferences.

### 5. Fill the CV template's `#let` block *(all paths — Path A extracts profile statements, not the contact block)*
`templates/cv/example.typ` renders from a `#let` fill block at the top: `cv-name`, `cv-title-line`, `cv-contact`, `profile-statement`, `experiences`, `projects`, `skills-groups`, `education`, `languages-line`, and the `section-order` tuple. Put the user's real values in that block. **Baking the real values in (rather than leaving `<NAME>` placeholders) is what makes the first generated CV a real document instead of a placeholder compile.** Do not restructure the layout code below it. Compile and confirm it lands on exactly 2 pages.

### 6. Fill the cover letter template's `#let` block *(all paths)*
`templates/cover/example.typ` takes `name`, `email`, `phone`, `date`, `hiring-manager`, `company`, `company-address`, `role`, and the `<OPENING_PARAGRAPH>` / `<BODY_PARAGRAPHS>` / `<CLOSING_PARAGRAPH>` markers in the body. Personalise the identity block. The cover letter always matches the posting's language; the CV language is the separate profile-level setting below.

### 7. Update `07-interview-prep.md` *(Path B and C; skip if Path A populated it)*
Create STAR examples from their actual experience (at least 3-4 examples). Path A leaves STAR stubs under "## STAR Candidates (Complete Manually)" rather than full examples; if any stubs are present, mention them in Step 4 so the user knows to flesh them out.

### 8. Verify the compiled CV
Compile the filled template and check it before reporting success:

```bash
~/.local/bin/typst compile templates/cv/example.typ
~/.venvs/job-search/bin/python scripts/verify_pdf.py templates/cv/example.pdf --pages 2 --ascii-dates
```

It must land on **exactly 2 pages** with an extractable text layer. If it is 3, cut by relevance (see the relevance-weighted rule in `agent/apply-workflow.md`), not by shrinking the type. If it is 1, the profile is too thin — go back and get more experience detail.

### 9. Generate `agent/search-queries.md`
Replace all placeholder tokens in the search queries file with the user's actual information from Section 9 (or the equivalent follow-up questions in Path A's Step A7):
- Replace `[YOUR_PRIMARY_ROLE_TYPE]`, `[YOUR_PRIMARY_JOB_TITLE]`, etc. with actual role titles
- Replace `[YOUR_KEY_SKILL]`, `[YOUR_DOMAIN_KEYWORD_1]`, etc. with actual skills and domain terms
- Replace `[YOUR_CITY]`, `[YOUR_COUNTRY]`, `[YOUR_REGION]` with actual location
- Fill in the location filter tiers (ideal, acceptable, borderline, too far) based on commute constraints
- Organize queries into priority categories matching the user's career direction:
  - Priority 1: Their strongest/most desired role direction
  - Priority 2: Their domain expertise
  - Priority 3: Adjacent roles they could pivot into
  - Priority 4: Broader roles (wider net)

---

## Step 4: Confirm & Next Steps

Present a summary:

> **Setup complete!** Here's what was generated:
>
> - `framework/01-candidate-profile.md` - Your full candidate profile
> - `framework/02-behavioral-profile.md` - Behavioral assessment
> - `framework/04-job-evaluation.md` - Personalized evaluation framework
> - `templates/cv/example.typ` - CV template with your real details in its fill block
> - `templates/cover/example.typ` - Cover letter template with your identity block
> - `framework/07-interview-prep.md` - STAR examples from your experience
> - `agent/search-queries.md` - Job search queries for `/scrape`
>
> **Privacy note:** the profile files now hold your personal data. They live only in this skill directory on your machine and are not synced anywhere; the only outbound step is the CV and cover letter you choose to submit.
>
> **Try it out:**
> - Run `/scrape` to search for matching jobs right now
> - Run `/apply` with a job posting URL to see the full application workflow
> - Run `/setup --section search` later to update your search queries as your priorities evolve

If Path A left any STAR stubs in `07-interview-prep.md`, also note:

> Path A flagged [N] STAR candidate stubs in `07-interview-prep.md` that need your situation/task/action/result details before you use them in interviews.

---

## Relaying answers from another session

The user may answer these questions from a *different* Hermes session (a TUI, a CLI, another chat) and paste the answers back here. The profile files are the hand-off medium, so treat them as the contract:

1. **Enumerate the open markers, not your memory of them.** Grep the framework files for `[TO CONFIRM` and produce the exact numbered question list, each with its `file:line` and the literal text being asked. The user answers by number, so the list must be complete and unambiguous — a missed marker means a question that never gets asked, and a reworded one means an answer that lands in the wrong field.
2. **Map numbered answers onto markers positionally, then verify each landing.** A one-line answer can be ambiguous ("No" — to which question?). Write each answer to its marker, and where an answer could fit more than one field, say which field you chose and why.
3. **Write the answers into the files, then re-grep to confirm none remain.** The confirmation is the point: `grep -rn "TO CONFIRM" framework/ agent/` must come back empty (or showing only items the user explicitly deferred) before you report the profile ready.
4. **Flag anything the user did not understand.** If an answer is "I don't know what you mean", stop and explain the field in plain language rather than writing a guess — an unexplained field is a question the user will not be able to answer later either.

Report the result as: what was written where, what is still open, and whether the profile is ready for the next step. Do not start the next step until the open list is empty or the user has explicitly deferred the remainder.

## Design Principles

- Three onboarding paths converge on the same skill files. Step 0 picks the right path based on what's in `profile/materials/`. Steps 3 and 4 are shared.
- Path A is read-before-write and idempotent. Re-running it as documents are added does not duplicate or overwrite existing content; conflicts are surfaced for explicit resolution.
- Path A labels inferred behavioral or style additions so the user can review them critically before relying on them.
- Each section in Path C is a natural conversation, not a form. The user can skip optional sections.
- Synthesize answers into structured formats (the user does not need to know markdown or LaTeX).
- Can be re-run with `--section <name>` to update specific sections (e.g., `/setup --section search` to reconfigure job search queries without re-doing the full profile).
- Section 9 (search) in Path C, and the equivalent follow-up questions in Path A, proactively suggest role types the user may not have considered.
- At the end, suggest running `/scrape` and `/apply` with a test job posting.
