# Tasty Crousty real-data study

This snapshot contains real Oriane responses and OpenAI outputs collected for the user-approved **brand-account** example. It is not synthetic test data. Tasty Crousty, Krousty Sabaidi, Crousty One, Crousty Game and Krousty Factory France are compared as brands, not as five confirmed Paris restaurants.

## Read the data

Start with [study_output.json](study_output.json). It contains the combined `benchmark`, `market`, selection provenance and execution summaries. [study_plan.json](study_plan.json) contains the exact requested windows, accounts, thresholds and declared constraints.

Each analysis directory contains:

| File | Contents |
| --- | --- |
| `manifest.json` | Analysis ID, status, model, timestamps, usage, errors, file inventory and limitations. |
| `request.json` | The validated input and publication windows. |
| `report.json` | Calculated metrics, coverage, available AI observations/actions and source references. |
| `sources.json` | Normalized retained sources. `external_url` links to original social publications, not downloaded video files. |
| `oriane_responses.json` | Retained search queries, parameters and provider response bodies. No authentication headers. |
| `openai_responses.json` | Returned AI text, supplied analysis evidence, prompt versions and recorded usage. No provider keys. |

The benchmark covers 2026-10-01 through 2026-10-30, end exclusive. The market comparison uses 2026-10-16 through 2026-10-30 versus 2026-09-18 through 2026-10-16. Unequal durations are normalized.

## Important limitations

Both reports are currently `partial`. The benchmark retains 10 normalized sources; the market report retains 4. Some provider contents were excluded by normalization, and benchmark extraction failed an evidence check. Raw received contents remain in the Oriane response files for diagnosis. The market AI produced one supported action. Do not treat raw, rejected AI claims as validated report findings.

Missing values are `null`, not zero. `sources` can overlap across reports: deduplicate with `source_id`. Claims about measured growth require supported windows and coverage; views-per-follower candidates do not prove acceleration, unique audiences or sales. Links are deterministically normalized from provider platform IDs and have not been checked for continued accessibility.

## Processing

```python
import json
from pathlib import Path

study = json.loads(
    Path("examples/tasty-crousty/study_output.json").read_text(encoding="utf-8")
)
benchmark = study["benchmark"]
market = study["market"]
unique_sources = {
    source["source_id"]: source
    for report in (benchmark, market)
    if report
    for source in report.get("sources", [])
}
video_links = [
    source["external_url"]
    for source in unique_sources.values()
    if source.get("external_url")
]
peer_comparison = benchmark.get("peer_comparison", [])
actions = market.get("ai", {}).get("actions", [])
```

Use `own_accounts` and `competitor_accounts` for KPI tables; `peer_comparison` for this brand-level comparison; `trends`, `viral_candidates`, `repeatable_formats` and `product_opportunities` for the market view. Join citations to sources using `source_id`, then resolve `channel` and `quote` against the retained evidence. Check `availability`, warnings, denominators and publication/collection dates before displaying a conclusion.

Keep provider rights and retention requirements in mind before redistributing transcripts, excerpts, thumbnails or comments. The repository license does not grant rights over third-party social content. Never reintroduce private `.env` settings, the local database or credentials into an export.