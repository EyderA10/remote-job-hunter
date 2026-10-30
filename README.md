# ai-job-search-typst

An end-to-end, agent-ready job search pipeline: scrape multiple remote-job boards,
enrich postings with residence/eligibility signals, score them against your own
candidate profile with hard deal-breaker vetoes, and generate tailored,
ATS-verified application documents (CV + cover letter) rendered with
[Typst](https://typst.app).

Built as a Typst-based port of [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) (MIT),
extended with live-tested portal clients for the Latin-American and remote market.

## Highlights

- **Four live portal clients** (Bun + TypeScript): LinkedIn (public jobs-guest API),
  GetOnBoard (Spain + LatAm), RemoteOK, We Work Remotely. Each one probed and
  verified against its real board; blocked portals (Cloudflare WAF, OAuth walls)
  are documented as such instead of pretending to work.
- **Residence enrichment**: GetOnBoard hides country restrictions in an HTML
  tooltip; `scripts/enrich_getonboard_residence.py` fetches and classifies each
  posting into PASS / FLAG / VETO for a given residence.
- **Scoring with hard vetoes**: `scripts/score_pool.py` applies your deal-breakers
  as hard vetoes (a 90-point job that trips one is dropped, not ranked first),
  then scores five fit dimensions (tech / experience / behavioral / location / career).
- **Typst document toolchain**: 2-page CV + 1-page cover letter from `#let`-fill
  templates, with PDF verification (`verify_pdf.py`): page counts, ASCII-date
  enforcement, and ATS text-layer checks (extractable text, no mid-word
  spacing artifacts, contact details as literal text).
- **Drafter-reviewer application workflow**: a two-agent flow (`references/apply-workflow.md`)
  with a factual grounding audit so no claim reaches a document ungrounded.
- **Optional Notion sync**: mirror the scored shortlist into a Notion database,
  archiving rows you mark as seen. Fully documented as a setup guide; no
  credentials or database IDs ship with this repo.

## Layout

```
portals/          # one CLI per job board (Bun + TypeScript)
scripts/          # search, scoring, enrichment, PDF verification, tracking
templates/        # Typst layout contract (CV + cover letter)
framework/        # evaluation framework: profile templates, fit rubric, style guide
references/       # per-step workflow docs (scrape, rank, apply, outcome, ...)
docs/             # setup guides (Notion sync, portal onboarding)
```

## Quick start

```bash
# 1. Fill in your candidate profile (placeholders everywhere)
$EDITOR framework/01-candidate-profile.md

# 2. Scrape a pool from every enabled portal
bash scripts/scrape-all.sh --query "backend engineer node" --jobage 3 --limit 40

# 3. Score it against your profile and deal-breakers
python3 scripts/score_pool.py state/pool-latest.json --top 25 --out state/scored-latest.json

# 4. Render the CV / cover templates and verify the PDFs
~/.local/bin/typst compile templates/cv/example.typ
python3 scripts/verify_pdf.py templates/cv/example.pdf --pages 2
```

Requirements: [Bun](https://bun.sh) (portal CLIs), Python 3 with `pypdf` and
`beautifulsoup4` (verification and enrichment scripts), and
[Typst](https://typst.app) for document rendering.

## Documentation

| Doc | What it covers |
|---|---|
| [docs/notion-sync-guide.md](docs/notion-sync-guide.md) | Step-by-step optional Notion integration (create the integration, build the database, wire the env vars) |
| [docs/portal-onboarding.md](docs/portal-onboarding.md) | How to add a new job board to `scrape-all.sh` |
| [references/apply-workflow.md](references/apply-workflow.md) | The full drafter-reviewer application workflow |
| [framework/04-job-evaluation.md](framework/04-job-evaluation.md) | Eligibility gate, language gate, deal-breaker vetoes, scoring dimensions |

## Contributing

Issues and pull requests are welcome. `main` is protected: pushes are restricted
to the maintainer, so please open a PR from your fork or a feature branch.

## License

MIT — see [LICENSE](LICENSE). Derived from
[MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search);
see [NOTICE](NOTICE).
