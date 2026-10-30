# User Guide

Everything you need as a person using this repo — no agent required.
The long workflow documents in [`agent/`](../agent/) are instructions for an
AI agent that runs this pipeline for you; you never have to read them.

## The 5-minute version

1. Fill [`framework/01-candidate-profile.md`](../framework/01-candidate-profile.md)
   with your real data (it ships with `<placeholders>`).
2. Run a search and score the results:

   ```bash
   bash scripts/scrape-all.sh --query "backend engineer" --jobage 3 --limit 40
   python3 scripts/score_pool.py state/pool-latest.json --out state/scored-latest.json
   ```

3. Open `state/scored-latest.json` and read the ranked shortlist
   (`kept`, highest `_score` first). Every posting includes its URL.
4. When you decide to apply, tailor `templates/cv/example.typ` and
   `templates/cover/example.typ`, compile with Typst, and check the PDFs:

   ```bash
   typst compile my-cv.typ
   python3 scripts/verify_pdf.py my-cv.pdf --pages 2
   ```

5. Track what you applied to in `state/job_search_tracker.csv`
   (one row per application; the status vocabulary is
   `drafted applied interviewing offer rejected closed`).

That's the whole loop: search → score → apply → track.

## The manage menu

`bash scripts/manage.sh` opens a guided menu that wraps all of the above:

```
1) View applications        # list + drill into one, change status, edit fields
2) Search today (normal)    # full daily cycle: scrape, enrich, score
3) Search today (Easy Apply only)
4) Search today (dry-run)   # scores but writes nothing anywhere
5) Sync to Notion           # optional, see docs/notion-sync-guide.md
```

Status changes are stamped with the date and a note, so the CSV doubles as a
contact log. On WSL, the "open in Windows" options surface the file in Explorer.

## How the scoring decides

Each posting is first checked against your **deal-breakers** (on-site, visa
sponsorship, live coding, wrong language, wrong timezone, non-full-time).
Anything that trips one is dropped, no matter how good the rest is.
What survives is scored 0-100 on five dimensions and ranked. Tune the veto
list and the fit rubric in [`framework/04-job-evaluation.md`](../framework/04-job-evaluation.md);
your profile lives in `framework/01-candidate-profile.md`.

## Optional extras

- **Notion sync** — mirror the shortlist to a Notion board:
  [docs/notion-sync-guide.md](notion-sync-guide.md)
- **Adding a job board** — the probe-first recipe:
  [docs/portal-onboarding.md](portal-onboarding.md)
- **Residence checks** — some boards hide country restrictions in the posting
  page; `scripts/enrich_getonboard_residence.py` and
  `scripts/enrich_wwr_residence.py` classify them automatically so you don't
  apply from the wrong country.

## What's for the agent

Everything under [`agent/`](../agent/) and `framework/` beyond the two files
above are operational instructions for an AI agent (scrape/rank/apply workflows,
document authoring rules, verification checklists). If you run this pipeline
with an agent, point it there; if you run it by hand, you can ignore them.
