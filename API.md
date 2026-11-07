# ViralEat API target contract v0.1

Date: 2026-11-07. Status: specification, not implemented.

This document defines the planned business API for the ViralEat restaurant competitive-intelligence MVP. It does not describe an operational service. The routes, objects, and business rules below are design decisions. Section 12 links the provider and configuration references.

The planned frontend uses Next.js and TypeScript. The separate Python backend uses FastAPI and the `/v1` prefix. Supabase provides Auth, PostgreSQL, and the Data API. Examples use fictional identifiers and restaurants. Social publication URLs are never invented. The corresponding example fields contain `null`. These examples illustrate the contract and are not application data.

## 1. Scope and authorization

### 1.1 Execution requirements

- Analyses use real providers with complete, validated configuration. Missing configuration produces an explicit error. Provider failures never cause a fallback to fabricated data.
- The MVP includes a benchmark for one restaurant and exactly four competitors, plus market monitoring by niche and area.
- Guided questions are an optional P0 feature, initially disabled with `FEATURE_GUIDED_QUESTIONS=false`.
- The free-form assistant belongs to P1. `FEATURE_FREE_CHAT=false` initially. This P0 contract does not promise a free-form conversation endpoint.

### 1.2 Authentication and workspace

Users register and sign in with email and password through Supabase Auth. The [account workflow](features.md#f01-landing-page-and-user-account) defines product behavior; [architecture section 4.5](architecture.md#45-email-and-password-authentication) defines confirmation, recovery, and session integration. FastAPI business routes do not accept passwords or implement separate sign-up, sign-in, or reset endpoints.

Business routes require a user access JWT issued by Supabase Auth:

```http
Authorization: Bearer <SUPABASE_USER_JWT>
Content-Type: application/json
```

The backend verifies the JWT signature and constraints, including the expected issuer, expiration, and configured audience. It identifies the user through the validated `sub`. Each access also requires active membership in the resource's workspace. A client-provided `workspace_id`, `user_id`, or role grants no access.

The target roles are `owner`, `editor`, and `viewer`. Members can read authorized resources. Owners and editors can change configurations and start analyses. Each member can manage their creator selection and, if enabled, their own annotations. P0 does not expose invitation or billing management.

Objects outside the authorized scope return `404`, including valid identifiers from another workspace. A known member without permission for an action receives `403`. Editable user metadata never determines authorization.

### 1.3 Data access and secrets

Ordinary business operations use the Supabase Data API with the user JWT, explicit permissions, and RLS policies. The frontend cannot directly write analysis states, snapshots, AI results, or reports. The backend controls the business contract even when an authorized read uses the Data API.

Analysis commands use a limited SQL transaction. It verifies membership and budget, then records the job and its outbox message in the same database. An internal worker has private SQL access for these commands. This access is unavailable to the browser and does not expose arbitrary SQL to clients. The outbox later publishes to `QUEUE_PROVIDER=local|vercel`. A PostgreSQL write and an external queue publication are not one atomic transaction.

OpenAI and Oriane keys remain in the backend. Privileged SQL connections and Supabase secret keys never enter the Next.js bundle. `API_CORS_ORIGINS` explicitly lists CORS origins. CORS does not replace authorization. Auth and Data API references: [S1], [S2].

## 2. Common conventions

### 2.1 Transport, types, and versions

| Item | Target convention |
|---|---|
| Prefix | `/v1`, configured by `API_PREFIX` |
| Transport | HTTPS when deployed, UTF-8 JSON |
| Persisted internal identifiers | UUID strings |
| Provider identifiers | Opaque strings, separate from internal UUIDs |
| Dates and times | ISO 8601 UTC with the `Z` suffix |
| Publication intervals | Inclusive start, exclusive end: `start_at <= published_at < end_at` |
| Observed amounts | Decimal string and explicit currency, with no implicit conversion |
| Units | Explicit units such as `count`, `percent`, `ratio`, `seconds`, and `EUR` |
| Unknown request fields | Rejected with `422` to detect integration errors |
| Added response fields | Clients ignore unknown fields compatible with `/v1` |
| Concurrent edits | Changes to an existing configuration require `expected_revision`. Conflicts return `409`. |

`null` means that a value is unavailable or cannot be calculated. `0` means a measured value of zero. An empty search result does not prove a lack of visibility. An empty array means no items exist in the returned scope. Its `availability` field indicates whether collection actually covered that scope.

Missing metrics never become zero. A ratio with a zero denominator remains `null`, with a reason. Percentages use the 0 to 100 scale. Ratios and changes use distinct units to avoid ambiguity.

### 2.2 Success envelope

Every JSON success response contains `data` and `meta.request_id`. `request_id` is a server correlation identifier without sensitive information.

```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Example restaurant",
    "role": "owner"
  },
  "meta": {
    "request_id": "req_example_workspace_01"
  }
}
```

`204 No Content` responses have no body. Section 6.2 defines the minimum analysis-creation response.

### 2.3 Pagination

Lists accept an integer `limit` from 1 to 100, default 20, and an opaque `cursor`. They return `meta.page.next_cursor`, a string or `null`, and `has_more`. There is no public offset, even if a provider uses one.

The cursor is bound to the workspace, filters, sort order, and queried view or snapshot. The client returns it without decoding it. An invalid cursor or a cursor used with different filters returns `400 INVALID_CURSOR`. Sort orders always have a stable secondary key, usually the UUID. Report lists sort by descending `created_at`, then `id`. Lists within a report are bound to its immutable version. No exhaustive total is reported unless it is known.

```json
{
  "data": [],
  "meta": {
    "request_id": "req_example_sources_01",
    "page": {
      "limit": 20,
      "next_cursor": null,
      "has_more": false
    }
  }
}
```

### 2.4 Errors without information leaks

```json
{
  "error": {
    "code": "BENCHMARK_REQUIRES_FOUR_COMPETITORS",
    "message": "Select exactly four distinct competitors.",
    "retryable": false,
    "details": [
      {
        "field": "competitor_restaurant_ids",
        "code": "INVALID_COUNT"
      }
    ]
  },
  "meta": {
    "request_id": "req_example_error_01"
  }
}
```

| HTTP | Example business codes | Rule |
|---|---|---|
| 400 | `INVALID_CURSOR`, `INVALID_IDEMPOTENCY_KEY` | Invalid transport request or pagination |
| 401 | `AUTH_REQUIRED`, `TOKEN_INVALID` | Missing or invalid session |
| 403 | `ACTION_FORBIDDEN` | Insufficient permission in an accessible workspace |
| 404 | `RESOURCE_NOT_FOUND`, `FEATURE_NOT_AVAILABLE` | Inaccessible or missing resource, or disabled option |
| 409 | `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `ANALYSIS_NOT_RETRYABLE`, `ATTEMPT_LIMIT_REACHED`, `ANALYSIS_ALREADY_TERMINAL` | State conflict, with no new expenditure |
| 422 | `INVALID_INPUT`, `BENCHMARK_REQUIRES_FOUR_COMPETITORS`, `WINDOW_INVALID` | Business validation failed |
| 429 | `RATE_LIMITED`, `BUDGET_EXCEEDED`, `WORKSPACE_CONCURRENCY_LIMIT` | Request rejected before execution. Respect `Retry-After`. |
| 503 | `PROVIDER_NOT_CONFIGURED`, `SERVICE_UNAVAILABLE` | Incomplete provider configuration or temporarily unavailable service |
| 500 | `INTERNAL_ERROR` | Generic message with correlated server-side diagnostics |

Public errors never include raw provider bodies, keys, JWTs, full prompts, or SQL traces. FastAPI HTTP validation errors use this envelope.

For `429`, `Retry-After` gives the number of seconds until the next known useful time: rate-limit expiry, an available slot, or budget reset. It does not authorize an unlimited retry loop. The body can include `reset_at` and the affected budget name without exposing other customers.

## 3. P0 endpoint inventory

Route identifiers are resolved with workspace authorization. Cross-resource lists require `workspace_id`. Additional filters cannot expand access.

| Method and route | Purpose | Normal response |
|---|---|---|
| `GET /v1/workspaces` | Workspaces in which the user is a member | 200, paginated list |
| `POST /v1/workspaces` | Create a workspace and its `owner` membership | 201 |
| `GET /v1/workspaces/{workspace_id}` | Read the workspace | 200 |
| `PATCH /v1/workspaces/{workspace_id}` | Change its name with an expected revision | 200 |
| `GET /v1/workspaces/{workspace_id}/restaurants` | Local restaurant directory | 200, paginated list |
| `POST /v1/workspaces/{workspace_id}/restaurants` | Add a restaurant identity | 201 |
| `GET /v1/restaurants/{restaurant_id}` | Read an identity | 200 |
| `PATCH /v1/restaurants/{restaurant_id}` | Correct an identity with an expected revision | 200 |
| `GET /v1/workspaces/{workspace_id}/restaurant-profile` | User's restaurant profile | 200, or 404 if not configured |
| `PUT /v1/workspaces/{workspace_id}/restaurant-profile` | Create or replace the profile | 201 or 200 |
| `GET /v1/workspaces/{workspace_id}/benchmark` | Benchmark configuration | 200 or 404 |
| `PUT /v1/workspaces/{workspace_id}/benchmark` | Save the restaurant and its four competitors | 201 or 200 |
| `GET /v1/workspaces/{workspace_id}/market-watch` | Market-monitoring configuration | 200 or 404 |
| `PUT /v1/workspaces/{workspace_id}/market-watch` | Create or replace market monitoring | 201 or 200 |
| `POST /v1/analyses` | Accept an asynchronous analysis | 202 |
| `GET /v1/analyses` | History, filtered by `workspace_id`, `kind`, `status` | 200, paginated list |
| `GET /v1/analyses/{analysis_id}` | State and result links | 200 |
| `POST /v1/analyses/{analysis_id}/retry` | Resume an eligible analysis | 202 |
| `POST /v1/analyses/{analysis_id}/cancel` | Request best-effort cancellation | 202, or 200 if already cancelled |
| `GET /v1/sources` | Sources, filtered by `workspace_id`, `analysis_id`, `restaurant_id`, `platform` | 200, paginated list |
| `GET /v1/sources/{source_id}` | Source, with optional `snapshot_id` for a specific version | 200 |
| `GET /v1/benchmark-reports` | Benchmark reports, filtered by `workspace_id`, `analysis_id` | 200, paginated list |
| `GET /v1/benchmark-reports/{report_id}` | Immutable benchmark report | 200 |
| `GET /v1/market-reports` | Market reports, filtered by `workspace_id`, `analysis_id` | 200, paginated list |
| `GET /v1/market-reports/{report_id}` | Immutable market report | 200 |
| `GET /v1/creators` | Observed creators, filtered by `workspace_id`, `report_id`, `platform`, `selected_by_me` | 200, paginated list |
| `GET /v1/creators/{creator_id}` | Authorized profile and observations, with optional `report_id` | 200 |
| `PUT /v1/creators/{creator_id}/selection` | Add or remove a creator from the user's selection | 200 |
| `GET /v1/opportunities` | Recommendations, filtered by `workspace_id`, `report_id`, `action_status` | 200, paginated list |
| `GET /v1/opportunities/{opportunity_id}` | Recommendation and separate user state | 200 |
| `PUT /v1/opportunities/{opportunity_id}/action` | Save recommendation tracking | 200 |
| `GET /v1/annotations` | Optional notes extension, filtered by `workspace_id`, `target_type`, `target_id` | 200, paginated list |
| `POST /v1/annotations` | Optional extension to add a user note | 201 |
| `PATCH /v1/annotations/{annotation_id}` | Optional extension to edit the user's note with an expected revision | 200 |
| `DELETE /v1/annotations/{annotation_id}` | Optional extension to delete the user's note | 204 |

The server allocates identifiers for ordinary creations. Changes to existing resources include the positive integer `expected_revision`. Singleton creation uses `expected_revision: 0`. The revision increases on each effective change. No report `PATCH` endpoint exists.

## 4. Restaurants, user profile, and benchmark

### 4.1 Restaurant identity

`POST /v1/workspaces/{workspace_id}/restaurants` accepts a name, declared location, and known social identifiers. Creation records an identity to verify. It guarantees neither a provider listing nor data coverage.

```json
{
  "name": "Example Burger Atelier",
  "location": {
    "country_code": "FR",
    "city": "Paris",
    "district": "11th arrondissement",
    "address": null,
    "latitude": null,
    "longitude": null
  },
  "cuisine_tags": ["burger", "street food"],
  "aliases": ["Burger Atelier"],
  "social_accounts": [],
  "website_url": null
}
```

`social_accounts` contains only objects with `platform`, `handle`, `profile_url`, and `provider_profile_id`. The last two fields are null when unknown. A display name is not a handle. A chain and its branches retain separate identities. Ambiguous results are not automatically attributed to the selected branch.

The returned object adds `id`, `workspace_id`, `revision`, `identity_status` (`declared`, `verified`, or `ambiguous`), `created_at`, and `updated_at`. Verification requires an explicit decision or an evidence-backed match. Creation alone does not verify an identity.

### 4.2 Restaurant operator profile

`PUT /v1/workspaces/{workspace_id}/restaurant-profile` links an existing identity to the user's restaurant. A workspace has only one active profile in P0.

```json
{
  "expected_revision": 0,
  "restaurant_id": "20000000-0000-4000-8000-000000000001",
  "positioning": "Neighborhood burgers and fast food",
  "target_customers": ["students", "local workers"],
  "business_goals": ["understand visibility", "identify relevant creators"]
}
```

Positioning information comes from the user. It is not presented as consumer observations. Changing the profile restaurant requires a consistent benchmark configuration before another analysis. It does not rewrite previous reports.

### 4.3 Benchmark configuration

`PUT /v1/workspaces/{workspace_id}/benchmark` requires exactly four distinct competitor identifiers, each different from `own_restaurant_id`. All five restaurants belong to the workspace. The user's restaurant matches the active profile. P0 requires explicit selection. Any future automatic selection must allow confirmation and cannot silently replace a chosen competitor.

```json
{
  "expected_revision": 0,
  "own_restaurant_id": "20000000-0000-4000-8000-000000000001",
  "competitor_restaurant_ids": [
    "20000000-0000-4000-8000-000000000002",
    "20000000-0000-4000-8000-000000000003",
    "20000000-0000-4000-8000-000000000004",
    "20000000-0000-4000-8000-000000000005"
  ],
  "platforms": ["instagram", "tiktok"],
  "publication_window": {
    "start_at": "2026-10-01T00:00:00Z",
    "end_at": "2026-11-01T00:00:00Z"
  },
  "target_contents": 100
}
```

The server returns the configuration with its `id` and `revision`. `target_contents` is the deduplicated collection target for the entire benchmark, not one hundred items per restaurant. It ranges from 1 to the server ceiling, defined by `BENCHMARK_TARGET_CONTENTS` in [.env.example](.env.example). Clients can lower the target but cannot raise that ceiling. Budget and availability can yield fewer sources. The report states the resulting coverage. Low coverage is never filled with fabricated content.

Allowed platforms are `instagram`, `tiktok`, and `youtube`, subject to configured capabilities. A provider schema accepting a value does not guarantee commercial coverage. Dates are checked against available capabilities. Unsupported windows produce an explicit error.

## 5. Market monitoring

`PUT /v1/workspaces/{workspace_id}/market-watch` configures a niche, area, platforms, and publication window. This workflow can operate without a complete benchmark. The area defines the market searched. It does not establish where creators' audiences live.

```json
{
  "expected_revision": 0,
  "niche": "burgers and street food",
  "location": {
    "country_code": "FR",
    "city": "Paris",
    "district": null,
    "radius_km": null,
    "center_latitude": null,
    "center_longitude": null
  },
  "platforms": ["instagram", "tiktok"],
  "publication_window": {
    "start_at": "2026-09-01T00:00:00Z",
    "end_at": "2026-11-01T00:00:00Z"
  },
  "comparison_windows": {
    "current": {
      "start_at": "2026-10-01T00:00:00Z",
      "end_at": "2026-11-01T00:00:00Z"
    },
    "previous": {
      "start_at": "2026-09-01T00:00:00Z",
      "end_at": "2026-10-01T00:00:00Z"
    }
  },
  "target_contents": 100
}
```

Comparison windows must fall within the publication window and must not overlap. If their durations differ, the calculation explicitly normalizes by duration or states that raw counts are not directly comparable. Statistics do not compare silently changed queries. The target ranges from 1 to the server ceiling, defined by `MARKET_TARGET_CONTENTS` in [.env.example](.env.example). This analysis has a budget separate from benchmark analyses. Validated extraction for shared content can be reused.

Each analysis freezes the search vocabulary, filters, extraction versions, and windows. New configuration does not change an accepted analysis.

## 6. Asynchronous analyses

### 6.1 Creation

`POST /v1/analyses` requires `Idempotency-Key`. The client selects a saved configuration, its type, and its revision. The server revalidates identities, scope, and budgets, then captures an immutable configuration snapshot. Clients cannot supply provider keys, system prompts, SQL, or arbitrary models.

```http
POST /v1/analyses
Authorization: Bearer <SUPABASE_USER_JWT>
Idempotency-Key: benchmark-example-20261107-001
Content-Type: application/json
```

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "kind": "benchmark",
  "target_id": "30000000-0000-4000-8000-000000000001",
  "target_revision": 1
}
```

`kind` accepts only `benchmark` or `market`. `target_id` identifies the workspace's benchmark or market monitoring respectively. An outdated revision returns `409 REVISION_CONFLICT`. The server does not automatically substitute the latest configuration.

### 6.2 Required response

The response is `202 Accepted` after durable recording of the job and outbox. It does not wait for Oriane, the LLM, or report generation.

```json
{
  "data": {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "status": "pending_dispatch",
    "status_url": "/v1/analyses/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  },
  "meta": {
    "request_id": "req_example_analysis_create_01"
  }
}
```

`status_url` is a relative path on the same API. The `Location` header contains this path. `Retry-After` can indicate the recommended delay before the first status read. The server does not return `202` before the transaction commits. A later outbox publication failure leaves the job in `pending_dispatch` for durable recovery.

Long-running work cannot depend on an in-memory task tied to the HTTP request's lifetime. Queue events can arrive more than once. Work acquisition, processing steps, and report publication must be idempotent.

### 6.3 Status read

`GET /v1/analyses/{analysis_id}` returns the current state, actual progress, applied limits, warnings, and published reports. An unknown estimate remains `null`.

```json
{
  "data": {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "workspace_id": "11111111-1111-4111-8111-111111111111",
    "kind": "benchmark",
    "status": "running",
    "attempt_no": 1,
    "max_attempts": 3,
    "target_id": "30000000-0000-4000-8000-000000000001",
    "target_revision": 1,
    "publication_window": {
      "start_at": "2026-10-01T00:00:00Z",
      "end_at": "2026-11-01T00:00:00Z"
    },
    "collection_window": {
      "started_at": "2026-11-07T10:00:03Z",
      "finished_at": null
    },
    "progress": {
      "phase": "extracting",
      "collected_unique_contents": 72,
      "eligible_contents": 64,
      "processed_contents": 40,
      "failed_contents": 1,
      "estimated_total_contents": null
    },
    "limits": {
      "target_contents": 100,
      "max_oriane_requests": 10,
      "max_oriane_credits": 200,
      "max_llm_tokens": 300000
    },
    "usage": {
      "oriane_requests": 3,
      "oriane_credits": 60,
      "llm_tokens": 18000
    },
    "report_ids": [],
    "latest_report_id": null,
    "retryable": false,
    "cancel_requested_at": null,
    "warnings": [],
    "error": null,
    "created_at": "2026-11-07T10:00:00Z",
    "started_at": "2026-11-07T10:00:02Z",
    "finished_at": null
  },
  "meta": {
    "request_id": "req_example_analysis_status_01",
    "poll_after_seconds": 3
  }
}
```

`usage` describes recorded consumption. Unknown monetary costs are not invented. The limits shown are MVP configuration choices, not provider-guaranteed quotas. Example counters are illustrative contract values.

`phase` is one of `awaiting_dispatch`, `collecting`, `normalizing`, `extracting`, `aggregating`, `publishing`, or `finished`. It describes current work without replacing `status`. The interface does not infer an exact percentage from an unknown total. Polling respects `poll_after_seconds`, has a frequency ceiling, and stops at a terminal state.

### 6.4 States and transitions

| State | Meaning |
|---|---|
| `pending_dispatch` | Job recorded, outbox publication not yet acknowledged |
| `queued` | Work placed in the durable queue, awaiting acquisition |
| `running` | Worker acquired the attempt, with recorded steps and lease |
| `succeeded` | Planned work finished and validated report published, with coverage still stated |
| `partial` | Useful report published with missing parts, exhausted budget, or explicit errors |
| `failed` | No new usable report published for this attempt |
| `cancelled` | Cancellation applied, with no new provider work permitted |

The normal path is `pending_dispatch → queued → running → succeeded|partial|failed`. Direct `pending_dispatch → running` is allowed if the consumer receives the message before publication acknowledgement is recorded. A late `queued` write must never move `running` backwards. An unrecoverable dispatch failure can end in `failed` without reaching `running`. Cancellation can end a nonterminal state. Only an eligible explicit retry moves `partial`, `failed`, or `cancelled` back to `pending_dispatch`, with an increased `attempt_no`.

`succeeded` does not mean exhaustive market coverage. A completed collection with few results can succeed while reporting `INSUFFICIENT_COVERAGE`. `partial` describes interrupted or incomplete work that still produced a report. Completeness checks belong to the versioned method.

## 7. Idempotency, retries, cancellation, and budgets

### 7.1 Idempotency for paid commands

`POST /v1/analyses` and `POST /v1/analyses/{analysis_id}/retry` require `Idempotency-Key`. It is a nonempty opaque ASCII string of 1 to 128 characters and contains no secret.

The key is scoped by authenticated user, workspace, and command route. The server associates it with the hash of the validated, canonical JSON body. The body is not part of the uniqueness key. Reusing a key with a different body returns `409 IDEMPOTENCY_CONFLICT` rather than creating another analysis.

- Same key and body: the same `analysis_id` and logical acceptance, with no new attempt or budget reservation. The transport `request_id` can differ.
- Same key and different body: `409`, with no effect.
- Identical concurrent requests: one durable command and one outbox record.
- After a network timeout, the client reuses the same key. No response does not prove that creation failed.

The target minimum retention is 24 hours after command completion. A key associated with an active analysis must not expire. A replay returns `202` acceptance for the same job. Its current state is read with `GET`. Authorization is checked again before replaying a response.

### 7.2 Bounded retries

`POST /v1/analyses/{analysis_id}/retry` accepts an empty JSON body:

```json
{}
```

A retry keeps the same `analysis_id` and original configuration snapshot. It increments `attempt_no` and creates a new attempt and outbox record in a limited transaction. It then returns the `202` envelope from section 6.2. The proposed ceiling is three total attempts, including the initial attempt. Clients cannot increase it.

A retry from `failed`, `partial`, or `cancelled` requires `retryable: true`, an unreached attempt ceiling, and sufficient remaining budget. After cancellation, this explicit command constitutes a new processing request. Automatic resumption is prohibited. Valid completed steps are reused. Published reports remain available. New publications have new identifiers. Permanent errors, invalid configuration, and refused AI output are not retried indefinitely.

Transient retries within a step are also bounded. At most two retries follow the initial call, with increasing delays, jitter, and respect for `Retry-After` when provided. All calls count toward analysis usage limits, including previous attempts. An ambiguous provider response may already have consumed credits. The application does not promise exactly-once provider billing.

Changing dates or competitors requires a new analysis, not a retry. Refreshing a `succeeded` analysis also requires explicit creation of a new analysis.

### 7.3 Best-effort cancellation

`POST /v1/analyses/{analysis_id}/cancel` accepts `{}`. The server records `cancel_requested_at` and returns `202` with the identifier, current state, and `status_url`. Completed cancellation returns `200` with `status: "cancelled"`. Other terminal states return `409 ANALYSIS_ALREADY_TERMINAL`.

Cancellation is checked before each new external call and between steps. An in-flight call can finish and incur charges. Saved data and reports from previous attempts remain accessible. Cancellation does not withdraw a finalized publication. A transactional check resolves races between cancellation and final publication. An explicit retry opens a new attempt and ends the previous cancellation signal's effect. A late worker from the old attempt cannot publish results.

### 7.4 Budget control

Before acceptance, the backend checks user and workspace limits, concurrency, and a budget reservation. Initially, each workspace allows one active analysis across all types. `pending_dispatch`, `queued`, and `running` occupy that slot. Benchmark and market analyses start separately, with one `kind` per analysis. Insufficient starting budget returns `429 BUDGET_EXCEEDED`, without a job or provider expenditure. An accepted idempotent command is recognized before checking allocation of a new slot.

During processing, the worker reserves resources before each call and records observed usage. It accounts for retries and the LLM output ceiling. Reaching a ceiling stops new calls. The analysis becomes `partial` if a useful report can be published, otherwise `failed`, with a `BUDGET_EXCEEDED` error or warning. The ceiling applies to the logical analysis, not separately to each attempt.

## 8. Sources and availability

### 8.1 Identity, observation, and snapshot

A `source` is content with a stable identity. A `source_snapshot` records its data at a given time. Reports reference both `source_id` and `source_snapshot_id`. Later view-count updates cannot change historical evidence.

Primary deduplication uses `(platform, platform_id)`. The Oriane identifier is stored separately. Multiple queries finding the same content do not create multiple sources. A video about several restaurants keeps several restaurant-content relationships. Reposts can be grouped, but their views are not presented as a unique audience.

`published_at` describes social publication. `fetched_at` describes our collection. When available, `provider_updated_at` retains the provider's declared date without assuming that it is the exact latest view measurement. Counter changes require several real snapshots. They are not reconstructed from one cumulative value.

### 8.2 Source example

The following fictional example illustrates response structure. It is not a provider response or a runtime fallback.

```json
{
  "data": {
    "id": "50000000-0000-4000-8000-000000000001",
    "snapshot_id": "51000000-0000-4000-8000-000000000001",
    "workspace_id": "11111111-1111-4111-8111-111111111111",
    "provider": "oriane",
    "provider_content_id": "example_provider_content_001",
    "platform": "instagram",
    "platform_id": "example_platform_content_001",
    "external_url": null,
    "creator_id": "70000000-0000-4000-8000-000000000001",
    "restaurant_ids": ["20000000-0000-4000-8000-000000000002"],
    "published_at": "2026-10-20T12:00:00Z",
    "fetched_at": "2026-11-07T10:00:04Z",
    "provider_updated_at": null,
    "caption": "Fictional example: at Example competitor, burger meal deal.",
    "metrics": {
      "views_count": 12000,
      "likes_count": 480,
      "comments_count": 32,
      "shares_count": null,
      "engagement_rate_per_views_percent": null
    },
    "audio": {
      "platform_id": null,
      "title": null,
      "author": null
    },
    "media": [
      {
        "type": "video",
        "duration_seconds": 32,
        "transcript": "The burger meal deal is advertised at twelve euros.",
        "transcript_chunks": [
          {
            "start_seconds": 8,
            "end_seconds": 11,
            "text": "The burger meal deal is advertised at twelve euros."
          }
        ],
        "frames": []
      }
    ],
    "popular_comments": [],
    "availability": {
      "content": "available",
      "external_url": "not_provided",
      "transcript": "available",
      "popular_comments": "not_provided",
      "audio": "not_provided",
      "frames": "not_requested",
      "location": "not_provided"
    }
  },
  "meta": {
    "request_id": "req_example_source_detail_01"
  }
}
```

`availability` accepts `available`, `partial`, `not_requested`, `not_provided`, `not_supported`, and `removed`. These values describe data availability, not reliability. Source removal can hide content. Historical references, where retention is permitted, indicate unavailability without recreating removed content. If a conclusion or excerpt also requires removal, section 9.1 applies.

Each available frame includes a timestamp and, if provided and permitted for display, a URL. The LLM never fills in timestamps, audio identifiers, or URLs. `popular_comments` is a capped sample, not all comments. Each item contains a provider identifier, text, and available counters and dates. Profile data unnecessary for analysis is not exposed by default.

External links come from received data or validated, deterministic platform normalization. Without a reliable link, `external_url` remains `null`. The interface shows actual availability rather than a plausible invented link. The internal `GET /v1/sources/{source_id}` resource and its snapshot expose retained, authorized evidence without claiming a link to the original publication.

## 9. Reports and metrics

### 9.1 Common contract

Each report contains `id`, `analysis_id`, `attempt_no`, `workspace_id`, `kind`, `schema_version`, `method_version`, `created_at`, `configuration_snapshot`, `publication_window`, `collection_window`, `coverage`, `findings`, `source_ids`, and `opportunity_ids`.

After publication, ordinary changes cannot modify a report. An analytical correction creates a new report with `supersedes_report_id` and a reason. User notes, action-state changes, and new view measurements never write to the report.

Immutability does not prevent required removal. Source removal or an applicable obligation can require redaction or deletion of excerpts, data, and affected conclusions, including in older reports. The served view indicates `redaction_status` (`none`, `partial`, or `withdrawn`) and, where applicable, `redacted_at`. An audit log retains the permitted operation record without retaining content that must be deleted. Removed evidence is no longer an active citation. A conclusion that loses its only evidence is redacted or marked unsupported.

Each factual item in `findings` has `evidence_refs` containing `source_id`, `source_snapshot_id`, and `evidence_id`. Each metric includes its definition, unit, denominator, content count, and availability status. Recommendations distinguish observation, interpretation, and proposed action.

Any comparative scores expose their formula version and components. The backend calculates them. An LLM cannot invent them. Minimum coverage thresholds and abstention rules belong to `method_version`.

### 9.2 Benchmark report

The report retains exactly the five selected identities, even if one has no sources. Unmeasurable metrics remain `null` for a restaurant without data. The table indicates insufficient coverage instead of automatically ranking that restaurant last.

The following example is a `comparison` substructure, not a complete response:

```json
{
  "own_restaurant_id": "20000000-0000-4000-8000-000000000001",
  "metric": "distinct_creators_observed",
  "unit": "count",
  "method_version": "benchmark.v0.1",
  "values": [
    {
      "restaurant_id": "20000000-0000-4000-8000-000000000001",
      "value": 2,
      "content_count": 4,
      "availability": "available"
    },
    {
      "restaurant_id": "20000000-0000-4000-8000-000000000002",
      "value": 3,
      "content_count": 5,
      "availability": "available"
    },
    {
      "restaurant_id": "20000000-0000-4000-8000-000000000003",
      "value": 1,
      "content_count": 2,
      "availability": "available"
    },
    {
      "restaurant_id": "20000000-0000-4000-8000-000000000004",
      "value": null,
      "content_count": 0,
      "availability": "not_provided"
    },
    {
      "restaurant_id": "20000000-0000-4000-8000-000000000005",
      "value": 2,
      "content_count": 3,
      "availability": "available"
    }
  ]
}
```

The benchmark can expose mentioned dishes, observed prices, praised or criticized aspects, and content associated with visibility. It infers neither actual visits, revenue, nor commercial causality. Sentiment separates creators' statements from commenters' statements. It does not automatically represent all consumers.

### 9.3 Market report

The market report exposes `product_concepts`, observed creators, associated content, and calculable trends. Each trend contains both windows, distinct content counts, creator counts, the formula, the change or abstention reason, and source references.

The target labels are `rising`, `established`, `declining`, and `insufficient_data`. Percentage growth requires a nonzero baseline and comparable windows. More mentions do not establish more sales. A window that may be incomplete because of indexing delay has `provisional: true`.

The following structures populate the three P0 Market view tabs. Maxima limit selections. They are never result counts to fill.

| Report field | Maximum | Item contract |
|---|---:|---|
| `top_contents` | 10 | `source_id`, `source_snapshot_id`, `creator_id` if known, `rank`, `ranking_basis`, metric with unit and date, `evidence_refs`, `availability` |
| `repeatable_formats` | 3 | `id`, `title`, `hook`, `observed_structure`, `audio_key`, `supporting_distinct_contents`, `supporting_distinct_creators`, `creator_ids`, `evidence_refs`, `adaptation`, `availability`, `limitations` |
| `product_opportunities` | 3 | `id`, `product_concept`, `composition`, `price`, `evidence_refs`, `novelty_status`, `announced_launch_at`, `first_observed_at`, `adaptation`, `availability`, `limitations` |

For `top_contents`, `ranking_basis` distinguishes `cumulative_views` from `observed_views_growth`. The former requires an available view counter and its `fetched_at`. The latter requires at least two comparable snapshots of the same counter, with dates and delta. With one measurement, the title describes the most-viewed content in the corpus. It does not claim acceleration. A missing value excludes content from a ranking based on that value. It does not become zero.

For `repeatable_formats`, `hook` describes an observable opening and its evidence. `observed_structure` is a sequence of supported characteristics. A transcript alone cannot establish visual editing. `audio_key` identifies audio by platform and a received audio identifier. It remains `null` without a reliable match. Audio title and author, when present, remain separate metadata and do not establish a reuse license. The initial setting requires at least two distinct content items and two distinct creator accounts to claim repetition. One video can remain in `top_contents` but cannot artificially fill this tab. `adaptation` describes a proposal for the restaurant operator and its prerequisites, separate from observed characteristics.

For `product_opportunities`, `composition` contains only source-observed product elements with evidence. `price` follows `PriceObservation` or is `null`. It is a price advertised on a date, not a recommended profitable price. `novelty_status` accepts:

- `announced_launch`: a source explicitly announces a launch. `announced_launch_at` is an ISO 8601 UTC date only if it can be established without invented precision. Otherwise it is `null`, and the announcement text remains in the evidence.
- `seasonal_offer`: a documented seasonal offer, not automatically a permanent new product.
- `first_observed`: first observation within this corpus. `first_observed_at` is an actual collection date, not a commercial launch date.
- `unknown`: commercial novelty cannot be established.

`announced_launch_at` and `first_observed_at` are separate nullable fields. First observation is scoped to the corpus. Late collection does not make a launch recent. A product without enough evidence for a useful proposal produces no item. Each array can be empty, with an availability status and an explanation in `coverage`.

## 10. Creators, opportunities, and annotations

### 10.1 Creators

The list exposes observed profiles: platform identity, observed follower count and measurement date, content, covered restaurants, topics, known publication areas, calculable engagement, and sources.

`audience_local_share_percent` remains `null` without explicit audience-location data. Publication geolocation or biography text cannot replace that data. Any compatibility score includes its formula, components, missing data, and sources. Otherwise the API returns descriptive criteria without an arbitrary score out of 100.

`PUT /v1/creators/{creator_id}/selection` stores the user's selection in the creator resource's workspace. The body does not select the actor. Identity comes from the validated JWT. The logical selection key is `(workspace_id, user_id, creator_id)`. Other members do not share that selection.

```json
{
  "selected": true,
  "expected_revision": 0
}
```

The server checks active membership and resource access. The first write expects revision 0. Later writes use the returned revision. The `200` response contains `creator_id`, `selected`, `revision`, and `updated_at` in the common envelope. `selected: false` removes the creator from the selection without deleting data or sources. On `GET /v1/creators`, `selected_by_me=true` returns creators selected by the current user in the requested workspace. `false` returns unselected creators. Omitting the filter returns all accessible creators. Creator details include the current user's selection state independently of the immutable report. None of these operations contacts the creator.

### 10.2 Opportunities and action tracking

A generated opportunity belongs to an immutable report. It contains `title`, `observation`, `proposed_action`, qualitative `expected_impact`, `effort`, `evidence_refs`, `limitations`, and `method_version`. Impact is an estimate, not a numerical growth promise. An analysis proposes at most three priority actions. It proposes fewer if the profile or evidence cannot support three.

User tracking is a separate resource. `PUT /v1/opportunities/{opportunity_id}/action` accepts:

```json
{
  "expected_revision": 0,
  "status": "testing",
  "note": "Compare lunch meal deals before deciding on a test."
}
```

`status` is `todo` ("To review"), `testing` ("In testing"), or `done` ("Completed"). The logical initial state is `todo`. The first write creates tracking at revision 1. Later writes specify the expected revision. The server records the author and date. Marking an action neither contacts a creator, changes a menu, nor publishes a message.

### 10.3 User notes

Generic annotations are an optional, nonblocking P0 extension. Core functionality already stores creator selection and action states. It does not depend on these note endpoints.

`POST /v1/annotations` accepts an accessible target and text of 1 to 4,000 characters:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "target_type": "source",
  "target_id": "50000000-0000-4000-8000-000000000001",
  "text": "Check whether this meal deal is still available before comparing it with our menu."
}
```

Allowed targets are `source`, `benchmark_report`, `market_report`, and `opportunity`. An annotation always identifies its author. It is not presented as an extracted fact. In P0, authorized workspace members can read notes. Only the author can edit or delete them. Evidence-retention rules remain independent of notes.

### 10.4 Optional P0 guided questions

If `FEATURE_GUIDED_QUESTIONS=true`, `GET /v1/reports/{report_id}/guided-answers/{question_key}` returns an answer prepared with the report. Each display does not trigger new collection or a paid call.

Allowed keys are `visibility_drivers`, `consumer_concerns`, `creator_matches`, `emerging_concepts`, and `priority_actions`. Report type determines applicable keys. The response contains `answer`, `evidence_refs`, `limitations`, and `availability`. Insufficient evidence is stated explicitly, with unsupported conclusions omitted. A disabled option or unavailable answer returns `404 FEATURE_NOT_AVAILABLE`.

The P1 free-form assistant must preserve this evidence scope and these permissions. The P0 contract accepts no free text for conversion into external queries or action commands.

## 11. Internal adapter contract: `StandardObservation`

This internal contract separates provider data from the domain. It is not an Oriane or OpenAI request body. It does not assume that every provider exposes every field.

| Object | Responsibility |
|---|---|
| `Content` | Source identity, platform, available text and multimedia data, dates, counters, and availability |
| `Restaurant` | Candidate identity, match to a workspace restaurant, resolution or ambiguity |
| `ProductConcept` | Specific dish or normalized concept, retaining the original label |
| `PriceObservation` | Amount, currency, unit or meal deal, publication date, restaurant, and evidence |
| `AspectObservation` | Aspect, polarity, speaker type, and target of judgment |
| `Evidence` | Source and snapshot, channel, exact excerpt or visual element, available timestamps |

Normalized observation example:

```json
{
  "schema_version": "standard-observation.v0.1",
  "content": {
    "source_id": "50000000-0000-4000-8000-000000000001",
    "source_snapshot_id": "51000000-0000-4000-8000-000000000001",
    "platform": "instagram",
    "published_at": "2026-10-20T12:00:00Z"
  },
  "restaurants": [
    {
      "restaurant_id": "20000000-0000-4000-8000-000000000002",
      "name_as_mentioned": "Example competitor",
      "resolution_status": "resolved",
      "evidence_ids": ["90000000-0000-4000-8000-000000000002"]
    }
  ],
  "product_concepts": [
    {
      "label": "burger meal deal",
      "normalized_label": "burger meal deal",
      "kind": "menu",
      "restaurant_id": "20000000-0000-4000-8000-000000000002",
      "evidence_ids": ["90000000-0000-4000-8000-000000000001"]
    }
  ],
  "prices": [
    {
      "amount": "12.00",
      "currency": "EUR",
      "basis": "menu",
      "product_label": "burger meal deal",
      "restaurant_id": "20000000-0000-4000-8000-000000000002",
      "observed_in_content_published_at": "2026-10-20T12:00:00Z",
      "evidence_ids": ["90000000-0000-4000-8000-000000000001"]
    }
  ],
  "aspects": [],
  "evidence": [
    {
      "id": "90000000-0000-4000-8000-000000000001",
      "source_id": "50000000-0000-4000-8000-000000000001",
      "source_snapshot_id": "51000000-0000-4000-8000-000000000001",
      "channel": "transcript",
      "quote": "The burger meal deal is advertised at twelve euros.",
      "start_seconds": 8,
      "end_seconds": 11,
      "comment_platform_id": null,
      "frame_reference": null
    },
    {
      "id": "90000000-0000-4000-8000-000000000002",
      "source_id": "50000000-0000-4000-8000-000000000001",
      "source_snapshot_id": "51000000-0000-4000-8000-000000000001",
      "channel": "caption",
      "quote": "Fictional example: at Example competitor, burger meal deal.",
      "start_seconds": null,
      "end_seconds": null,
      "comment_platform_id": null,
      "frame_reference": null
    }
  ],
  "quality": {
    "needs_review": false,
    "warnings": []
  }
}
```

In this fictional example, the caption supplies the restaurant mention and the transcript supplies the price. Resolution to the specific restaurant must also be established upstream. One name can identify several establishments. Each actual relationship retains the evidence needed for its assertion. An uncertain match has `resolution_status: "ambiguous"` and `restaurant_id: null`. It does not automatically contribute to that restaurant's score.

`AspectObservation.aspect` uses a versioned vocabulary: `quality`, `portion`, `price_value`, `waiting_time`, `service`, `ambience`, `delivery`, `presentation`, `originality`, and `other`. `polarity` is `positive`, `negative`, `mixed`, `neutral`, or `uncertain`. `speaker_type` distinguishes `creator`, `commenter`, `restaurant_account`, and `unknown`. No judgment is not a neutral judgment.

The separate `experience_basis` field is `reported_experience`, `content_reaction`, or `unspecified`. `reported_experience` means that a person reports a visit, order, or consumption experience. The statement does not verify a visit. `content_reaction` describes a reaction to a video, its appearance, or its statements without reported experience. `unspecified` avoids assuming experience. Sentiment aggregation preserves this distinction alongside `speaker_type`. An enthusiastic comment about a burger image does not become a customer review.

Evidence channels are `caption`, `transcript`, `comment`, `on_screen_text`, `frame`, and `provider_metadata`. Extraction does not create sources or provider identifiers. The backend allocates UUIDs and checks that references belong to the authorized corpus. Excerpts must match received data. An invented sentence cannot become a quotation.

Extraction artifacts are cached by relevant content hash and schema, prompt, provider, and model versions. Changing only the view count does not rerun transcript extraction. A new comment batch can produce a separate extraction. Aggregations remain recalculable from validated observations.

## 12. Provider adapters and configuration

Provider capabilities and integration requirements are defined in [architecture section 8](architecture.md#8-oriane-observable-data-and-limits) and [architecture section 9](architecture.md#9-ai-extraction-and-calculations). Adapters map received data to `StandardObservation` in section 11. Missing provider fields remain `null`; adapters do not invent sources or observations.

[`.env.example`](.env.example) defines shared configuration names and proposed defaults. [Architecture section 12](architecture.md#12-configuration-operations-and-observability) defines configuration validation and hosted execution. Missing or invalid provider configuration maps to the errors in section 2.4. Report and source GET requests do not trigger provider calls.

`API_CORS_ORIGINS` is a JSON list of authorized frontend origins. Deployment configuration supplies the actual domains. CORS does not grant workspace access.

## 13. HTTP conformance checks

Product workflows and acceptance criteria are defined in [features section 3](features.md#3-main-workflow) and [features section 9](features.md#9-proposed-mvp-validation-conditions). Processing and recovery checks are defined in [architecture section 7](architecture.md#7-bounded-asynchronous-pipeline) and [architecture section 11](architecture.md#11-coverage-quality-and-evaluation).

The HTTP implementation must also pass these contract checks:

- Analysis creation and eligible explicit retries return `202` with the acceptance envelope and status URL from section 6.2.
- Replaying the same idempotency key and body returns the same logical acceptance without another command, attempt, budget reservation, or report publication. A distinct eligible retry can create another attempt as defined in section 7.2. Provider calls can repeat after a crash or an ambiguous response.
- Reusing the same key with a different body returns `409 IDEMPOTENCY_CONFLICT`.
- Access to another workspace's resource returns `404`. A known member without the required permission receives `403`.
- A benchmark with three competitors, five competitors, or duplicate competitor identifiers is rejected before collection.
- An insufficient starting budget returns `429 BUDGET_EXCEEDED` without creating a job. Replayed acceptance does not require another active-analysis slot.
- Status responses preserve the transitions in section 6.4, polling metadata, and the distinction between low coverage and interrupted processing.
- Cancellation responses distinguish accepted cancellation, completed cancellation, and other terminal states as defined in section 7.3. Cancellation does not promise a refund for an in-flight call.
- Source and report responses preserve `null` for missing measurements. A missing denominator does not produce a fabricated percentage.
- Reanalysis returns new report identifiers and preserves published reports, subject to recorded source removal or redaction.
- Missing or invalid provider configuration returns an explicit error. Provider failures never produce fabricated replacement data.

These checks are future acceptance criteria. This document claims no completed provider integration test or deployment.

## 14. Primary references

Pages consulted on 2026-11-07 for the source specification. Provider documents can change. Implementation must pin versions and revalidate capabilities. This translation does not constitute a new source check.

- [S1] Supabase, JSON Web Tokens: https://supabase.com/docs/guides/auth/jwts
- [S2] Supabase, Securing your API: https://supabase.com/docs/guides/api/securing-your-api
