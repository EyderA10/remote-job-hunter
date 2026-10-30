# LinkedIn Easy Apply Filter

Status (verified live 2026-10-27): LinkedIn's guest endpoint CAN filter Easy Apply server-side.

## How it works

- Search param: `f_AL=true` on `jobs-guest/jobs/api/seeMoreJobPostings/search`.
- Verified: same query twice without the param returns identical job IDs (no drift);
  with `f_AL=true` the result set is mostly disjoint → the parameter is honored
  (unlike `location` and `f_WT`, which the guest API ignores).
- Detail-page marker: the CTA button's tracking attribute distinguishes the apply path:
  - Easy Apply (apply inside LinkedIn): `data-tracking-control-name="public_jobs_apply-link-onsite"`
  - External (apply on company site): `public_jobs_apply-link-offsite`
  The guest detail page never renders the literal text "Easy Apply" — never grep for it.

## Where it lives in this fork

- `portals/linkedin-search/cli/src/cli.ts`: `--easy-apply` flag → `easyApply` opt.
- `portals/linkedin-search/cli/src/commands/search.ts`: `buildUrl` adds `f_AL=true`.
- `portals/linkedin-search/cli/src/helpers.ts`: `parseJobDetail` returns `hasEasyApply`
  (matches `public_jobs_apply-link-onsite`, `jobs-apply-button`, or literal text in the description).
- `scripts/scrape-all.sh`: env `EASY_APPLY=1` → adds `--easy-apply` to LinkedIn runs only.
- `scripts/search.sh`: `--apply-filter` flag exports `EASY_APPLY=1` and passes
  `--apply-filter` to the scorer.
- `scripts/score_pool.py`: `--apply-filter` drops LinkedIn postings whose `_easy_apply`
  is not True (other portals pass through unaffected).
- `scripts/enrich_linkedin_remote.py`: caches `hasEasyApply` per job; cache entries
  predating the field are refetched, never defaulted to False.

## Usage

```bash
# daily cycle with Easy Apply (LinkedIn only) + remote-only + 24h/3d windows
bash scripts/search.sh --apply-filter

# same, without touching Notion
bash scripts/search.sh --dry-run --apply-filter

# LinkedIn CLI directly
bun run portals/linkedin-search/cli/src/cli.ts search -q "Full Stack Developer" -l "Remote" --jobage 7 --easy-apply
```
