# ViralEat backend (hackathon)

FastAPI backend that collects real social content from Oriane, extracts evidence-backed observations with
OpenAI structured outputs, and serves benchmark, market and niche-study reports. Scope and rules:
[HACKATHON.md](HACKATHON.md), which takes precedence over the full specifications at the repository root.

## Setup

```bash
cd apps/api
cp .env.example .env   # fill in OpenAI and Oriane settings; never commit .env
uv sync
uv run pytest
uv run uvicorn viraleat_api.main:app --reload
```

The API contract is served at `http://localhost:8000/openapi.json` (generate frontend types from it).

## Routes

| Route | Purpose |
|---|---|
| `GET /health` | Lists missing configuration (no provider call) |
| `POST /analyses` | Starts a `benchmark` (restaurant + 4 competitors) or `market` analysis, returns `202` |
| `GET /analyses/{id}` | Status, progress, then the report |
| `GET /sources/{id}` | One collected content with its metrics and text |

## Scripts

| Script | What it does | Cost |
|---|---|---|
| `scripts/probe_oriane.py "Name"` | One real search, prints what each content contains | 1 Oriane search |
| `scripts/probe_extract.py "Name"` | Runs extraction on a restaurant's results | up to `--limit` OpenAI calls |
| `scripts/niche_study.py --term ...` | Most-viewed posts of a niche → restaurant profiles → patterns, Markdown report | 1 search, 1-3 profile searches, ~fetch OpenAI calls |

Every line that calls Oriane or OpenAI is marked `# API CALL` (`grep -rn "# API CALL" src scripts`).
Only `oriane.py` (`http.post`) and the three `responses.parse` calls actually hit the network.

Provider responses are cached in `cache/` and reports are written to `reports/`. Both are git-ignored:
they contain third-party content whose republication rights are not confirmed.

## Guarantees

- Every finding cites an exact quote, verified against the received text; a price must appear in its quote.
- Missing values stay `null`; no fabricated data on provider failure.
- Oriane returns no post URL: `Source.url` stays `null`; reports rebuild links from platform ids (`post_url`).
