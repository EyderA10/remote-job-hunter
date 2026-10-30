# Onboarding profile sources

Fit evaluation is only as good as the profile, and the profile is only as good as its
sources. Rank them by signal quality and by whether they are actually obtainable.

| Rank | Source | What it gives | Cost |
|---|---|---|---|
| 1 | **CV / resume PDF** the user supplies | Name, contact, education, full experience with bullets, skills, languages **with level** | Instant, user-controlled |
| 2 | **Public GitHub** | Current title, bio, location, repo names/languages/descriptions, README narrative | Instant, read-only |
| 3 | **LinkedIn official data export** | Structured CSVs incl. `Languages.csv` with self-rated proficiency — the highest-confidence source for the Language Gate | ~10 min delay, user action |
| 4 | **Interview mode** | Everything documents do not state: goals, deal-breakers, what energizes/drains | A conversation |

A CV is the best single source because it is the artifact the user already maintains and
it states languages with a level. GitHub is the best *second* source because it is live
(the CV may be stale) and it carries the narrative the user tells about their own work.

## 1. CV / resume PDF

Copy it into the skill, then extract the text layer:

```bash
mkdir -p ~/.hermes/skills/productivity/job-search/profile/materials/cv
cp "<path to the CV>" ~/.hermes/skills/productivity/job-search/profile/materials/cv/
~/.venvs/job-search/bin/python - <<'PY'
from pypdf import PdfReader
import pathlib
p = pathlib.Path("~/.hermes/skills/productivity/job-search/profile/materials/cv/<file>")
r = PdfReader(p)
print("pages:", len(r.pages))
print("\n".join(pg.extract_text() for pg in r.pages))
PY
```

Extraction quirks to expect:

- **Contact lines arrive as one long run** separated by `|` or `·` — split on those, not on whitespace.
- **Phone numbers may be deliberately masked** in the source (`+584****1371`). Do not guess the digits; mark it `[TO CONFIRM]` and ask.
- **A CV can be 2 pages** — read both. The second page often holds Education and Languages, which are exactly the sections the fit rubric and the Language Gate depend on.
- **`pypdf` extraction of a CV is reliable** — it is the same extractor used to verify the generated CV, so a source that extracts cleanly will also verify cleanly.

## 2. Public GitHub enrichment

Read-only, no auth beyond the `gh` CLI's existing token. Three calls cover it:

```bash
gh api users/<login>                            # name, bio, location, blog, followers
gh api users/<login>/repos --jq '.[] | "\(.name) | \(.language) | \(.description)"'
gh api repos/<login>/<repo>/readme --jq '.content' | base64 -d
```

What to take from it:

- **The README is the narrative source.** A profile README states the user's own framing of their work — the layers they work in, the stack they lead with, the problems they care about. Use it for `02-behavioral-profile.md` and for the profile statement, and label it as the user's own words.
- **Repo names and descriptions are project evidence.** A repo with a real architecture diagram in its README is a stronger `Independent Projects` entry than a list of technologies.
- **Recency is a signal.** `pushed_at` distinguishes a maintained project from an abandoned one; say which it is.

## 3. LinkedIn — never scrape a profile

**LinkedIn profile pages are not reachable without a session.** An unauthenticated request
returns **HTTP 999** (LinkedIn's anti-scraping rejection) and the `voyager` profile API
returns **403**. Only the `jobs-guest` endpoints are public, which is why the portal CLI
works while a profile fetch does not.

Do not attempt a profile scrape, do not try to authenticate, and do not tell the user it
needs a login to work. The supported path is the **official data export**:

> LinkedIn → Settings & Privacy → Data privacy → **Get a copy of your data** → select
> "The full data archive" / "Data files" → request, wait for the email, download the ZIP.

Unzip into `profile/materials/linkedin/`. The archive contains `Positions.csv`,
`Education.csv`, `Skills.csv`, `Languages.csv` (name + self-rated proficiency),
`Certifications.csv` and `Recommendations.csv` — structured, high-confidence, and the
best source for the Languages table that drives the Language Gate.

Note the export is delivered **by email**, so it can take minutes to arrive and the user
should be told to expect that rather than re-requesting it.

## 4. Cross-source discrepancies

When two sources describe the same person, expect them to disagree. Surface each one and
ask which is correct — never silently pick one.

The two shapes that actually occur:

- **Title mismatch.** The CV carries the title the user applied with; the GitHub bio
  carries the title they currently identify with. These diverge routinely after a role
  change or a reframing. Ask which is the headline.
- **Overlapping date ranges.** Two contracts that overlap by months are usually either
  genuinely concurrent (a part-time or overlapping engagement) or a misrecorded end
  date. Ask; do not normalize them yourself, because the answer changes what the
  experience section claims.

## 5. Filling the profile from these sources

- Write **every** claim that a source supports, and write it in the source's own
  specificity — a bullet that says "built a multi-tenant agent platform with ElevenLabs
  and Supabase" is worth more than "worked on backend systems".
- Mark anything no source states as `[TO CONFIRM — <what is missing>]` inline, and ask
  for it in one batch. A profile that is part-filled with explicit gaps is usable
  immediately; a profile padded with plausible detail is not.
- Then bake the real values into the template's `#let` fill block so the first generated
  CV is a real document rather than a placeholder compile. Verify it: it must land on
  exactly 2 pages with an extractable text layer.
