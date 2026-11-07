# ViralEat backend: working instructions

@HACKATHON.md

- `HACKATHON.md` takes precedence over the root specs (`../../features.md`, `../../architecture.md`, `../../API.md`). They are product
  vision: follow their evidence and wording rules, not their infrastructure.
- Keep it simple: no new infrastructure (queue, DB server, auth) unless the user asks.
- Python 3.13, managed with `uv`. Run tests with `uv run pytest`.
  Run the API with `uv run uvicorn viraleat_api.main:app --reload`.
- The Pydantic models in `src/viraleat_api/models.py` are the contract with the frontend.
  Changing a response field means telling the frontend teammate.
- Oriane request/response field names marked `UNVERIFIED` must be checked against a real
  response (`scripts/probe_oriane.py`) before being trusted.
- Never put keys in code, logs, prompts or fixtures.
