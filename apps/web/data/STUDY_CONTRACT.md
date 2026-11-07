# Study export integration

The frontend reads the saved [Tasty Crousty study](../../../examples/tasty-crousty/study_output.json).
It does not call the live analysis API. The example contains two partial analyses:
a brand-account benchmark and French sector monitoring. It does not measure local
Paris restaurants.

## Prepare and serve

Run `npm run data:prepare` from `apps/web` after the source example changes.
The script writes the allowlisted public projection to `public/data/study_output.json`.
That generated file is included in the static site. It retains measurements,
limitations, structured actions and source links. It excludes publication captions,
comments, bios, media, evidence quotations and analysis export directories. Raw
Oriane/OpenAI responses are not copied. Do not copy analysis folders into `public`.

The browser fetches `/data/study_output.json` at workspace load. **Refresh data**
fetches it again without browser caching. No analyses are started and no provider
requests or polling occur. `NEXT_PUBLIC_STUDY_URL` can instead identify a backend
JSON endpoint with this same structure. This public build-time URL must not contain
credentials. A separate origin must allow the frontend through CORS.

## Mapping from the saved export

| Export field | Presentation |
| --- | --- |
| `generated_at` | Study generation date; not an invented analysis timestamp |
| `selection_basis.source`, `scope_approval`, `peer_relevance` | Selection and brand scope |
| `analyses[].analysis_id`, `status`, `oriane_requests`, `actual_llm_tokens`, `warnings` | Analysis status, usage and warnings |
| `own_accounts[]`, `competitor_accounts[]` | Brand name from `restaurant`, platform and nested `metrics` |
| `metrics.mean_views`, `median_views` | Average and median views |
| `metrics.mean_engagement_views_percent` | Engagement divided by views, in percentage points |
| `metrics.posts_per_week` | Publication frequency; null stays unavailable |
| `metrics.limitations` | Account measurement limits |
| `peer_comparison[]` | Supplied metric, own value, comparison median and availability |
| Both corpora's `coverage[]`, `warnings`, `limitations` | Collection coverage and warnings |
| `configuration_snapshot.window`, `current`, `previous` | Publication windows |
| `market.trends[]` | Topic, counts, growth, status, abstention reason and sources |
| `market.product_opportunities[]` | Product/offer label, observed price, evidence and limits |
| `ai.actions[]` | Observation, hypothesis, proposed action, effort, outcome measure and constraints |
| `sources[]` | Publication and observation dates, handle/platform and safe `external_url` |

`sampled_posts_per_week` is not substituted for the missing full posting rate.
Peer medians and growth are not recomputed when the producer abstains. Zero is
preserved; null means unavailable. Analysis dates absent from the export remain
unavailable. AI availability/errors and action limitations remain visible.
Structured AI actions are proposals, not validated conclusions.

Citations resolve `source_ids`, `source_id` and `evidence[].source_id` against a
combined catalogue deduplicated by `source_id`. The example has 11 unique sources.
Only HTTP(S) publication URLs without embedded credentials are linked. Unresolved
references remain explicit. Restaurant context and source-author profiles are populated from the export. Editing and creator selection stay disabled.

## Verification boundary

Tests cover synthetic edge cases and the saved real example, including equality
between the original and public projection after mapping. Component integration
uses substituted HTTP responses. This verifies export compatibility and rendering;
it does not verify live providers or the factual accuracy of generated proposals.

## Dashboard and profiles

The dashboard separates account statistics, numeric comparisons, proposed actions,
market topics and source cards. Technical collection warnings remain in expandable
methodology details; a partial-evidence notice remains visible. Source cards link
numbered citations to lazy embedded publication players and retain a direct link
when a provider blocks playback or requires sign-in. URLs are restricted to known
Instagram, TikTok and YouTube publication patterns. No API keys or provider calls
are needed to construct these URLs. Browsers contact the platform to load players.
TikTok uses its documented [embed player](https://developers.tiktok.com/docs/en/embed-player).

Restaurant context comes from the own brand account and saved goals/constraints.
Paris query geography does not become the brand's location. Creator profiles are
source-author accounts, including brands, not recommendations of individual creators.
They show distinct observed source counts and dated follower measurements. The
public projection includes only named account metadata, follower counts, source
views and formats needed for this display; biographies and raw source texts remain
excluded.
