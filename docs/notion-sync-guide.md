# Notion Sync Guide (Optional)

Mirror your scored job shortlist into a Notion database. The script
`scripts/notion_sync.py` writes every scored posting as a row, and applies a
simple retention rule on each run:

- Rows you mark as **seen** (checkbox) are archived — they have been reviewed
  and are either replaced by fresh results or no longer wanted.
- Rows **not** marked as seen are conserved untouched across runs.
- New postings are added; postings already present are score-updated or skipped.

Nothing personal ships with this repo: the database id and the API key are read
from environment variables, and the guide below starts from an empty database.

## 1. Create a Notion integration

1. Go to <https://www.notion.so/profile/integrations> and create an **internal
   integration**.
2. Copy the **Internal Integration Secret** (starts with `ntn_`). Keep it out of
   the repo — export it as an environment variable, never hardcode it:

   ```bash
   export NOTION_API_KEY="ntn_..."   # your integration secret
   ```

## 2. Create the database

In Notion, create a database named, for example, `Job Tracking`. It needs these
properties (names are read as-is by the script; create them exactly):

| Property | Type | Purpose |
|---|---|---|
| `Name` | Title | Posting title |
| `Company` | Rich text | Employer |
| `Location` | Rich text | Posting location |
| `Source` | Rich text | Portal name (LinkedIn, GetOnBoard, RemoteOK, WWR, ...) |
| `URL` | URL | Link to the original posting |
| `Score` | Number | Fit score (0-100) |
| `Posted` | Date | Posting date |
| `Vista` | Checkbox | Mark as **seen** to have the row archived on the next sync |

## 3. Share the database with the integration

Open the database page in Notion → `...` menu → **Connections** → connect the
integration you created in step 1. Without this step the API returns a 404.

## 4. Get the database id and export it

The database id is the 32-hex string in the database URL
(`notion.so/<workspace>/<db-id>?v=...`, with or without dashes). Export it:

```bash
export NOTION_DB_ID="your-database-id-here"
```

## 5. Run the sync

```bash
python3 scripts/notion_sync.py state/scored-latest.json --top 25
```

The script reports how many rows it archived (seen), added, score-updated,
conserved and skipped, and prints the database URL.

## Retention rule in one line

> Seen = archived. Unseen = conserved. New = added.

If you want a different rule (e.g. keep seen rows forever), the logic lives in
the `sync` function of `scripts/notion_sync.py` and is a single branch.
