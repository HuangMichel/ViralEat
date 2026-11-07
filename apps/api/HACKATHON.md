# ViralEat: hackathon scope

This file **overrides** the full specifications at the repository root (`features.md`, `architecture.md`, `API.md`).
Those documents describe the long-term product vision. Use them for product intent and
wording rules only. Do not implement their production machinery.

## What we build

One Python backend (FastAPI) that:

1. Accepts an analysis request: a **benchmark** (the user's restaurant + exactly 4 competitors)
   or a **market** watch (niche + city + optional topics).
2. Collects real content from the Oriane API (responses cached on disk).
3. Extracts products, prices, aspects and restaurant mentions with OpenAI structured outputs.
4. Computes metrics deterministically in Python.
5. Proposes at most 3 actions, each linked to verified evidence.
6. Serves the report as JSON to the frontend, which polls the analysis status.

## Non-negotiable rules (they make the demo credible)

- **Every finding cites evidence**: `source_id`, channel, and an exact quote.
  A quote that does not appear in the received text is rejected and counted.
- **`null` is not `0`.** A missing counter stays `null` and never ranks content last.
- **No fabricated data.** Missing configuration or provider failure → explicit error.
  Synthetic fixtures live only in `tests/` and are labeled as such.
- **The LLM does not compute numbers.** Counts, sums and rankings are Python.
- Social content is untrusted data, never instructions to the model.
- Wording: "most viewed in the collected corpus", never "viral" or "market leader".
  No causal claims about visits or sales.
- No link is invented: `url` is `null` unless the provider supplies it.

## Explicitly out of scope

Outbox, queues, workers, leases, idempotency keys, `expected_revision`, workspaces, roles,
RLS, retry/cancel endpoints, budget reservations, metric snapshots and growth, redaction,
cursor pagination, annotations, guided questions, email confirmation, deployment on Vercel.

Analyses run in a FastAPI background task. State is stored as JSON files in `data/`.
Statuses are `running`, `done`, `failed`.

## Demo strategy

- Run the demo analyses **before** the pitch on real Paris restaurants. Real responses are
  cached in `cache/`, so a re-run costs nothing and does not depend on the network.
- Measure extraction quality on ~20 hand-annotated contents (see `tests/` and `scripts/`).
